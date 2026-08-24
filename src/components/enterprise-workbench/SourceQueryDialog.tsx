import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useNotify } from "ra-core";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SourceConnection, WorkbenchJobResponse } from "./types";
import { getErrorMessage } from "./utils";
import { createIdempotencyKey, runWorkbenchAction } from "./workbenchActions";

type QueryProvider = "qcc" | "huoke_assistant";
type RiskFlagKey =
  | "businessAbnormal"
  | "equityFreeze"
  | "severeViolation"
  | "administrativePenalty";
type RiskFlagValue = "any" | "has" | "none";

export type KcProviderSelection = {
  id: string;
  label: string;
  providerValues: string[];
};

type KcFormState = {
  keyword: string;
  page: string;
  pageSize: string;
  statuses: string;
  qualificationTags: string;
  regions: KcProviderSelection[];
  industries: KcProviderSelection[];
  enterpriseTypes: Record<"individual" | "cooperative" | "company", boolean>;
  contactRequirements: Record<"phone" | "email", boolean>;
  actualOperatingOnly: boolean;
  smallBusinessOnly: boolean;
  capitalMin: string;
  capitalMax: string;
  insuredMin: string;
  insuredMax: string;
  shareMin: string;
  shareMax: string;
  establishedStart: string;
  establishedEnd: string;
  legalChangedStart: string;
  legalChangedEnd: string;
  legalUnchangedStart: string;
  legalUnchangedEnd: string;
  riskFlags: Record<RiskFlagKey, RiskFlagValue>;
};

const initialKcForm: KcFormState = {
  keyword: "",
  page: "1",
  pageSize: "10",
  statuses: "",
  qualificationTags: "",
  regions: [],
  industries: [],
  enterpriseTypes: {
    individual: true,
    cooperative: true,
    company: true,
  },
  contactRequirements: { phone: false, email: false },
  actualOperatingOnly: false,
  smallBusinessOnly: false,
  capitalMin: "",
  capitalMax: "",
  insuredMin: "",
  insuredMax: "",
  shareMin: "",
  shareMax: "",
  establishedStart: "",
  establishedEnd: "",
  legalChangedStart: "",
  legalChangedEnd: "",
  legalUnchangedStart: "",
  legalUnchangedEnd: "",
  riskFlags: {
    businessAbnormal: "any",
    equityFreeze: "any",
    severeViolation: "any",
    administrativePenalty: "any",
  },
};

const riskFlagLabels: Record<RiskFlagKey, string> = {
  businessAbnormal: "经营异常",
  equityFreeze: "股权冻结",
  severeViolation: "严重违法",
  administrativePenalty: "行政处罚",
};

export function SourceQueryDialog({
  open,
  onOpenChange,
  workspaceId,
  sources,
  sourcesError,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  sources: SourceConnection[];
  sourcesError: unknown;
  onSubmitted: () => void;
}) {
  const notify = useNotify();
  const querySources = useMemo(
    () =>
      sources.filter((source) => normalizeProvider(source.provider) !== null),
    [sources],
  );
  const [sourceId, setSourceId] = useState("");
  const selectedSource = useMemo(
    () => querySources.find((source) => source.id === sourceId),
    [querySources, sourceId],
  );
  const provider = normalizeProvider(selectedSource?.provider);
  const [kcMode, setKcMode] = useState<"company_search" | "risk_enrichment">(
    "company_search",
  );
  const [targetDescription, setTargetDescription] = useState("");
  const [searchKey, setSearchKey] = useState("");
  const [kcForm, setKcForm] = useState<KcFormState>(initialKcForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<WorkbenchJobResponse | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  const resetSubmission = () => {
    setReceipt(null);
    idempotencyKeyRef.current = null;
  };

  useEffect(() => {
    if (!open) resetSubmission();
  }, [open]);

  const submit = async () => {
    if (!selectedSource || !isQueryableStatus(selectedSource.status)) {
      notify("请选择一个状态为 ready 或 degraded 的已安装数据源。", {
        type: "warning",
      });
      return;
    }

    let queryKind: "company_detail" | "company_search" | "risk_enrichment";
    let criteria: Record<string, unknown>;
    try {
      if (provider === "qcc") {
        requireSearchKey(searchKey);
        queryKind = "company_detail";
        criteria = { searchKey: searchKey.trim() };
      } else if (
        provider === "huoke_assistant" &&
        kcMode === "risk_enrichment"
      ) {
        requireSearchKey(searchKey);
        queryKind = "risk_enrichment";
        criteria = { searchKey: searchKey.trim() };
      } else if (provider === "huoke_assistant") {
        queryKind = "company_search";
        criteria = buildKcCriteria(kcForm);
      } else {
        throw new Error("当前连接没有已安装的查询适配器");
      }
    } catch (error) {
      notify(getErrorMessage(error), { type: "error" });
      return;
    }

    setIsSubmitting(true);
    setReceipt(null);
    try {
      const idempotencyKey =
        idempotencyKeyRef.current ?? createIdempotencyKey("query");
      idempotencyKeyRef.current = idempotencyKey;
      const job = await runWorkbenchAction(
        "start_ingestion",
        workspaceId,
        {
          sourceConnectionId: sourceId,
          queryKind,
          ...(targetDescription.trim()
            ? { queryText: targetDescription.trim() }
            : {}),
          criteria,
        },
        idempotencyKey,
      );
      setReceipt(job);
      notify(`查询任务已提交（${job.status}）`, { type: "success" });
      onSubmitted();
    } catch (error) {
      notify(getErrorMessage(error), { type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectableCount = querySources.filter((source) => {
    const sourceProvider = normalizeProvider(source.provider);
    return isQueryableStatus(source.status) && sourceProvider !== null;
  }).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>从真实数据源发起任务</DialogTitle>
          <DialogDescription>
            目标说明可编辑，但不代替结构化条件。后端只处理所选适配器已支持的字段。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2 sm:grid-cols-2">
          {sourcesError ? (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertTitle>无法读取数据源</AlertTitle>
              <AlertDescription>
                {getErrorMessage(sourcesError)}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label>数据源</Label>
            <Select
              value={sourceId}
              onValueChange={(value) => {
                setSourceId(value);
                setKcMode("company_search");
                resetSubmission();
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择已验证连接" />
              </SelectTrigger>
              <SelectContent>
                {querySources.map((source) => {
                  const sourceProvider = normalizeProvider(source.provider);
                  const unavailable =
                    !isQueryableStatus(source.status) ||
                    sourceProvider === null;
                  return (
                    <SelectItem
                      key={source.id}
                      value={source.id}
                      disabled={unavailable}
                    >
                      {source.name}（{providerLabel(sourceProvider)} ·{" "}
                      {source.status}）
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              ready 可直接查询；degraded
              表示本地驱动已验证、尚未进行本次远程授权验证。
            </p>
          </div>

          {provider === "huoke_assistant" ? (
            <div className="space-y-2">
              <Label>任务类型</Label>
              <Select
                value={kcMode}
                onValueChange={(value) => {
                  setKcMode(value as typeof kcMode);
                  resetSubmission();
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company_search">多条件企业检索</SelectItem>
                  <SelectItem value="risk_enrichment">单企风险补充</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : provider === "qcc" ? (
            <div className="space-y-2">
              <Label>任务类型</Label>
              <Input value="工商登记核验" readOnly />
            </div>
          ) : null}

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="target-description">目标说明</Label>
            <Textarea
              id="target-description"
              value={targetDescription}
              onChange={(event) => {
                setTargetDescription(event.target.value);
                resetSubmission();
              }}
              placeholder="例如：本次用于会议邀约名单初筛"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              说明用于审计和沟通；真实查询以下方字段为准。
            </p>
          </div>

          {selectedSource?.status === "degraded" ? (
            <Alert className="border-amber-200 bg-amber-50/60 sm:col-span-2 dark:border-amber-900 dark:bg-amber-950/30">
              <AlertTitle>本次为首次远程授权验证</AlertTitle>
              <AlertDescription>
                点击“提交真实查询”即明确授权调用当前数据商；查询成功后后端才会将连接转为
                ready。
              </AlertDescription>
            </Alert>
          ) : null}

          {provider === "qcc" ||
          (provider === "huoke_assistant" && kcMode === "risk_enrichment") ? (
            <div className="space-y-3 sm:col-span-2">
              <div className="space-y-2">
                <Label htmlFor="company-search-key">
                  企业全名 / 统一社会信用代码
                </Label>
                <Input
                  id="company-search-key"
                  value={searchKey}
                  onChange={(event) => {
                    setSearchKey(event.target.value);
                    resetSubmission();
                  }}
                  placeholder="请输入可核对的完整企业识别信息"
                />
              </div>
              {provider === "qcc" ? (
                <Alert>
                  <AlertTitle>当前仅开放已验收能力</AlertTitle>
                  <AlertDescription>
                    点击提交即授权本次真实工商登记查询；“测试连接”只验证服务端
                    CLI 版本，不查询企业、不消耗额度。
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : null}

          {provider === "huoke_assistant" && kcMode === "company_search" ? (
            <KcCompanySearchForm
              value={kcForm}
              onChange={(value) => {
                setKcForm(value);
                resetSubmission();
              }}
            />
          ) : null}

          {selectableCount === 0 ? (
            <Alert className="sm:col-span-2">
              <AlertTitle>没有可查询的真实数据源</AlertTitle>
              <AlertDescription>
                请先到“数据源”初始化获客助手或企查查连接，并完成后端本地驱动测试。draft、error
                和 disabled 不能发起查询。
              </AlertDescription>
            </Alert>
          ) : null}

          {receipt ? (
            <Alert className="sm:col-span-2">
              <AlertTitle>查询任务：{receipt.status}</AlertTitle>
              <AlertDescription>任务 ID：{receipt.jobId}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button
            onClick={submit}
            disabled={
              !sourceId ||
              !isQueryableStatus(selectedSource?.status) ||
              provider === null ||
              isSubmitting ||
              Boolean(receipt)
            }
          >
            {isSubmitting ? <Loader2 className="animate-spin" /> : <Search />}
            提交真实查询
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KcCompanySearchForm({
  value,
  onChange,
}: {
  value: KcFormState;
  onChange: (value: KcFormState) => void;
}) {
  const setField = <K extends keyof KcFormState>(
    key: K,
    nextValue: KcFormState[K],
  ) => onChange({ ...value, [key]: nextValue });

  return (
    <div className="space-y-5 sm:col-span-2">
      <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="kc-keyword">关键词</Label>
          <Input
            id="kc-keyword"
            value={value.keyword}
            onChange={(event) => setField("keyword", event.target.value)}
            placeholder="企业名称、产品或经营范围关键词"
          />
        </div>
        <KcCatalogMultiSelect
          kind="regions"
          label="地区"
          value={value.regions}
          onChange={(next) => setField("regions", next)}
        />
        <KcCatalogMultiSelect
          kind="industries"
          label="行业"
          value={value.industries}
          onChange={(next) => setField("industries", next)}
        />
        <div className="space-y-2">
          <Label htmlFor="kc-statuses">经营状态</Label>
          <Input
            id="kc-statuses"
            value={value.statuses}
            onChange={(event) => setField("statuses", event.target.value)}
            placeholder="多项用逗号分隔"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="kc-qualifications">资质标签</Label>
          <Input
            id="kc-qualifications"
            value={value.qualificationTags}
            onChange={(event) =>
              setField("qualificationTags", event.target.value)
            }
            placeholder="多项用逗号分隔"
          />
        </div>
        <div className="space-y-3 sm:col-span-2">
          <Label>企业类型</Label>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {(
              [
                ["individual", "个体"],
                ["cooperative", "合作社"],
                ["company", "企业"],
              ] as const
            ).map(([key, label]) => (
              <CheckboxLabel
                key={key}
                id={`enterprise-${key}`}
                label={label}
                checked={value.enterpriseTypes[key]}
                onCheckedChange={(checked) =>
                  setField("enterpriseTypes", {
                    ...value.enterpriseTypes,
                    [key]: checked === true,
                  })
                }
              />
            ))}
            <span className="text-xs text-muted-foreground">
              三项全选按“不限”提交
            </span>
          </div>
        </div>
        <div className="space-y-3 sm:col-span-2">
          <Label>联系方式要求</Label>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {(
              [
                ["phone", "有电话"],
                ["email", "有邮箱"],
              ] as const
            ).map(([key, label]) => (
              <CheckboxLabel
                key={key}
                id={`contact-${key}`}
                label={label}
                checked={value.contactRequirements[key]}
                onCheckedChange={(checked) =>
                  setField("contactRequirements", {
                    ...value.contactRequirements,
                    [key]: checked === true,
                  })
                }
              />
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <RangeInputs
          label="注册资本（万元）"
          minimum={value.capitalMin}
          maximum={value.capitalMax}
          onMinimumChange={(next) => setField("capitalMin", next)}
          onMaximumChange={(next) => setField("capitalMax", next)}
        />
        <RangeInputs
          label="参保人数（人）"
          minimum={value.insuredMin}
          maximum={value.insuredMax}
          onMinimumChange={(next) => setField("insuredMin", next)}
          onMaximumChange={(next) => setField("insuredMax", next)}
        />
        <RangeInputs
          label="法人持股比例（%）"
          minimum={value.shareMin}
          maximum={value.shareMax}
          onMinimumChange={(next) => setField("shareMin", next)}
          onMaximumChange={(next) => setField("shareMax", next)}
        />
        <DateRangeInputs
          label="成立日期"
          start={value.establishedStart}
          end={value.establishedEnd}
          onStartChange={(next) => setField("establishedStart", next)}
          onEndChange={(next) => setField("establishedEnd", next)}
        />
        <DateRangeInputs
          label="法人变更日期"
          start={value.legalChangedStart}
          end={value.legalChangedEnd}
          onStartChange={(next) => setField("legalChangedStart", next)}
          onEndChange={(next) => setField("legalChangedEnd", next)}
        />
        <DateRangeInputs
          label="法人未变更日期"
          start={value.legalUnchangedStart}
          end={value.legalUnchangedEnd}
          onStartChange={(next) => setField("legalUnchangedStart", next)}
          onEndChange={(next) => setField("legalUnchangedEnd", next)}
        />
      </section>

      <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        {(Object.keys(riskFlagLabels) as RiskFlagKey[]).map((key) => (
          <div key={key} className="space-y-2">
            <Label>{riskFlagLabels[key]}</Label>
            <Select
              value={value.riskFlags[key]}
              onValueChange={(next) =>
                setField("riskFlags", {
                  ...value.riskFlags,
                  [key]: next as RiskFlagValue,
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">不限</SelectItem>
                <SelectItem value="has">有</SelectItem>
                <SelectItem value="none">无</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
        <div className="flex flex-wrap gap-x-5 gap-y-3 sm:col-span-2">
          <CheckboxLabel
            id="actual-operating-only"
            checked={value.actualOperatingOnly}
            onCheckedChange={(checked) =>
              setField("actualOperatingOnly", checked === true)
            }
            label="仅实际经营"
          />
          <CheckboxLabel
            id="small-business-only"
            checked={value.smallBusinessOnly}
            onCheckedChange={(checked) =>
              setField("smallBusinessOnly", checked === true)
            }
            label="仅小微企业"
          />
        </div>
      </section>

      <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="kc-page">页码</Label>
          <Input
            id="kc-page"
            type="number"
            min="1"
            step="1"
            value={value.page}
            onChange={(event) => setField("page", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="kc-page-size">每页数量</Label>
          <Input
            id="kc-page-size"
            type="number"
            min="1"
            max="10"
            step="1"
            value={value.pageSize}
            onChange={(event) => setField("pageSize", event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            单次最多 10 家；后续页请显式新建批次。
          </p>
        </div>
      </section>
    </div>
  );
}

type KcCatalogKind = "regions" | "industries";
type KcCatalogItem = KcProviderSelection & {
  pathLabels: string[];
  searchText?: string;
  level: number | "section" | "division";
  selectable: boolean;
};
type KcCatalogDocument = {
  schemaVersion: "1.0";
  source: { path: string; sha256: string };
  items: KcCatalogItem[];
};

const kcCatalogUrls: Record<KcCatalogKind, string> = {
  regions: "/catalogs/kc-regions.v1.json",
  industries: "/catalogs/kc-industries.v1.json",
};

function KcCatalogMultiSelect({
  kind,
  label,
  value,
  onChange,
}: {
  kind: KcCatalogKind;
  label: string;
  value: KcProviderSelection[];
  onChange: (value: KcProviderSelection[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<KcCatalogDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsPending(true);
    setError(null);
    void fetch(kcCatalogUrls[kind], { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = (await response.json()) as unknown;
        return validateCatalog(payload, kind);
      })
      .then((payload) => {
        if (!cancelled) setCatalog(payload);
      })
      .catch((catalogError: unknown) => {
        if (!cancelled) {
          setCatalog(null);
          setError(getErrorMessage(catalogError));
        }
      })
      .finally(() => {
        if (!cancelled) setIsPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const selectedIds = useMemo(
    () => new Set(value.map((item) => item.id)),
    [value],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const options = useMemo(() => {
    const items = catalog?.items ?? [];
    return items
      .filter((item) => {
        if (!item.selectable || selectedIds.has(item.id)) return false;
        if (normalizedQuery) {
          return `${item.label} ${item.pathLabels.join(" ")} ${item.searchText ?? ""}`
            .toLowerCase()
            .includes(normalizedQuery);
        }
        return kind === "regions" ? item.level === 1 : item.level === "section";
      })
      .slice(0, 60);
  }, [catalog, kind, normalizedQuery, selectedIds]);

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label htmlFor={`catalog-${kind}`}>{label}（可多选）</Label>
      <Input
        id={`catalog-${kind}`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={`搜索${label}名称`}
      />
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                onChange(value.filter((entry) => entry.id !== item.id))
              }
              className="rounded-full border bg-primary/5 px-3 py-1 text-xs hover:bg-muted"
              aria-label={`移除${item.label}`}
            >
              {item.label} ×
            </button>
          ))}
        </div>
      ) : null}
      {isPending ? (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          正在读取获客助手权威{label}目录…
        </p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>{label}目录未部署</AlertTitle>
          <AlertDescription>
            {error}。页面不会猜测供应商编码；其他条件仍可使用。
          </AlertDescription>
        </Alert>
      ) : (
        <div className="max-h-44 overflow-y-auto rounded-lg border p-1">
          {options.length > 0 ? (
            options.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onChange([
                    ...value,
                    {
                      id: item.id,
                      label: catalogSelectionLabel(item),
                      providerValues: item.providerValues,
                    },
                  ]);
                  setQuery("");
                }}
                className="block w-full rounded-md px-3 py-2 text-left text-xs hover:bg-muted"
              >
                <span className="font-medium">{item.label}</span>
                {item.pathLabels.length > 1 ? (
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {item.pathLabels.join(" › ")}
                  </span>
                ) : null}
              </button>
            ))
          ) : (
            <p className="p-3 text-center text-xs text-muted-foreground">
              没有匹配的目录项
            </p>
          )}
        </div>
      )}
      {catalog ? (
        <p className="text-[11px] text-muted-foreground">
          权威目录版本 {catalog.source.sha256.slice(0, 12)}
          ；界面只展示中文路径，提交时保留完整父级链。
        </p>
      ) : null}
    </div>
  );
}

function catalogSelectionLabel(item: KcCatalogItem) {
  return item.pathLabels.length > 1 ? item.pathLabels.join(" ") : item.label;
}

function validateCatalog(
  payload: unknown,
  kind: KcCatalogKind,
): KcCatalogDocument {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("目录根节点格式错误");
  }
  const document = payload as Partial<KcCatalogDocument>;
  if (
    document.schemaVersion !== "1.0" ||
    !document.source ||
    typeof document.source.sha256 !== "string" ||
    !Array.isArray(document.items)
  ) {
    throw new Error("目录缺少版本、来源哈希或项目列表");
  }
  const items = document.items.filter((item): item is KcCatalogItem => {
    if (
      !item ||
      typeof item.id !== "string" ||
      typeof item.label !== "string" ||
      !Array.isArray(item.pathLabels) ||
      !Array.isArray(item.providerValues) ||
      item.providerValues.length === 0 ||
      item.providerValues.some((token) => typeof token !== "string" || !token)
    ) {
      return false;
    }
    if (
      kind === "regions" &&
      item.providerValues.length === 1 &&
      item.providerValues[0].endsWith("$C")
    ) {
      return false;
    }
    return item.selectable === true;
  });
  if (items.length === 0) {
    throw new Error("目录没有可用的已校验项");
  }
  return {
    schemaVersion: "1.0",
    source: {
      path: String(document.source.path ?? ""),
      sha256: document.source.sha256,
    },
    items,
  };
}

function normalizeProvider(provider?: string): QueryProvider | null {
  if (!provider) return null;
  if (["qcc", "qichacha_mcp"].includes(provider)) return "qcc";
  if (
    ["huoke_assistant", "kc", "kingdee", "kingdee_credit"].includes(provider)
  ) {
    return "huoke_assistant";
  }
  return null;
}

function isQueryableStatus(status?: string | null) {
  return status === "ready" || status === "degraded";
}

function providerLabel(provider: QueryProvider | null) {
  if (provider === "qcc") return "企查查";
  if (provider === "huoke_assistant") return "获客助手";
  return "未支持";
}

function requireSearchKey(value: string) {
  if (!value.trim()) {
    throw new Error("请输入企业全名或统一社会信用代码");
  }
}

function parseList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,，、;]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function parsePositiveInteger(value: string, label: string, maximum?: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label}必须是大于 0 的整数`);
  }
  if (maximum !== undefined && parsed > maximum) {
    throw new Error(`${label}不能大于 ${maximum}`);
  }
  return parsed;
}

function buildNumberRange(
  minimum: string,
  maximum: string,
  label: string,
  upperLimit?: number,
) {
  if (!minimum.trim() && !maximum.trim()) return [];
  const min = minimum.trim() ? Number(minimum) : undefined;
  const max = maximum.trim() ? Number(maximum) : undefined;
  if (
    (min !== undefined && (!Number.isFinite(min) || min < 0)) ||
    (max !== undefined && (!Number.isFinite(max) || max < 0))
  ) {
    throw new Error(`${label}区间必须为非负数`);
  }
  if (min !== undefined && max !== undefined && min > max) {
    throw new Error(`${label}区间下限不能大于上限`);
  }
  if (
    upperLimit !== undefined &&
    ((min !== undefined && min > upperLimit) ||
      (max !== undefined && max > upperLimit))
  ) {
    throw new Error(`${label}不能大于 ${upperLimit}`);
  }
  return [
    {
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
    },
  ];
}

function buildDateRange(start: string, end: string, label: string) {
  if (!start && !end) return [];
  if (!start || !end) {
    throw new Error(`${label}需要同时填写开始和结束日期`);
  }
  if (start > end) {
    throw new Error(`${label}的开始日期不能晚于结束日期`);
  }
  return [{ start, end }];
}

function buildKcCriteria(value: KcFormState) {
  const registeredCapitalWan = buildNumberRange(
    value.capitalMin,
    value.capitalMax,
    "注册资本",
  );
  const insuredCount = buildNumberRange(
    value.insuredMin,
    value.insuredMax,
    "参保人数",
  );
  const legalPersonSharePercent = buildNumberRange(
    value.shareMin,
    value.shareMax,
    "法人持股比例",
    100,
  );
  const establishedBetween = buildDateRange(
    value.establishedStart,
    value.establishedEnd,
    "成立日期",
  );
  const legalChangedBetween = buildDateRange(
    value.legalChangedStart,
    value.legalChangedEnd,
    "法人变更日期",
  );
  const legalUnchangedBetween = buildDateRange(
    value.legalUnchangedStart,
    value.legalUnchangedEnd,
    "法人未变更日期",
  );
  const selectedTypes = (
    Object.entries(value.enterpriseTypes) as Array<
      [keyof KcFormState["enterpriseTypes"], boolean]
    >
  )
    .filter(([, checked]) => checked)
    .map(([type]) => type);
  const enterpriseTypes = selectedTypes.length === 3 ? [] : selectedTypes;
  const contactRequirements = (
    Object.entries(value.contactRequirements) as Array<
      [keyof KcFormState["contactRequirements"], boolean]
    >
  )
    .filter(([, checked]) => checked)
    .map(([contact]) => contact);
  const riskFlags = Object.fromEntries(
    Object.entries(value.riskFlags).filter(([, flag]) => flag !== "any"),
  );
  const statuses = parseList(value.statuses);
  const qualificationTags = parseList(value.qualificationTags);
  const hasConstraint = Boolean(
    value.keyword.trim() ||
      value.regions.length ||
      value.industries.length ||
      statuses.length ||
      enterpriseTypes.length ||
      contactRequirements.length ||
      Object.keys(riskFlags).length ||
      qualificationTags.length ||
      value.actualOperatingOnly ||
      value.smallBusinessOnly ||
      registeredCapitalWan.length ||
      insuredCount.length ||
      legalPersonSharePercent.length ||
      establishedBetween.length ||
      legalChangedBetween.length ||
      legalUnchangedBetween.length,
  );
  if (!hasConstraint) {
    throw new Error("至少填写一项结构化条件，避免误发起无边界全量查询");
  }

  return {
    keyword: value.keyword.trim(),
    page: parsePositiveInteger(value.page, "页码"),
    pageSize: parsePositiveInteger(value.pageSize, "每页数量", 10),
    regions: value.regions.map(({ label, providerValues }) => ({
      label,
      providerValues,
    })),
    industries: value.industries.map(({ label, providerValues }) => ({
      label,
      providerValues,
    })),
    statuses,
    enterpriseTypes,
    contactRequirements,
    riskFlags,
    qualificationTags,
    actualOperatingOnly: value.actualOperatingOnly,
    smallBusinessOnly: value.smallBusinessOnly,
    ...(registeredCapitalWan.length ? { registeredCapitalWan } : {}),
    ...(insuredCount.length ? { insuredCount } : {}),
    ...(legalPersonSharePercent.length ? { legalPersonSharePercent } : {}),
    ...(establishedBetween.length ? { establishedBetween } : {}),
    ...(legalChangedBetween.length ? { legalChangedBetween } : {}),
    ...(legalUnchangedBetween.length ? { legalUnchangedBetween } : {}),
  };
}

function CheckboxLabel({
  id,
  checked,
  onCheckedChange,
  label,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean | "indeterminate") => void;
  label: string;
}) {
  return (
    <span className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </span>
  );
}

function RangeInputs({
  label,
  minimum,
  maximum,
  onMinimumChange,
  onMaximumChange,
}: {
  label: string;
  minimum: string;
  maximum: string;
  onMinimumChange: (value: string) => void;
  onMaximumChange: (value: string) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          min="0"
          value={minimum}
          onChange={(event) => onMinimumChange(event.target.value)}
          placeholder="下限"
        />
        <Input
          type="number"
          min="0"
          value={maximum}
          onChange={(event) => onMaximumChange(event.target.value)}
          placeholder="上限"
        />
      </div>
    </fieldset>
  );
}

function DateRangeInputs({
  label,
  start,
  end,
  onStartChange,
  onEndChange,
}: {
  label: string;
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="date"
          value={start}
          onChange={(event) => onStartChange(event.target.value)}
          aria-label={`${label}开始`}
        />
        <Input
          type="date"
          value={end}
          onChange={(event) => onEndChange(event.target.value)}
          aria-label={`${label}结束`}
        />
      </div>
    </fieldset>
  );
}
