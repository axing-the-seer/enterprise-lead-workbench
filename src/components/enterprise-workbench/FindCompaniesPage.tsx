import { useEffect, useMemo, useRef, useState } from "react";
import {
  Buildings,
  Check,
  CheckCircle,
  ClockCountdown,
  Coins,
  Info,
  MagnifyingGlass,
  MapPin,
  SpinnerGap,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react";
import { useGetList, useNotify } from "ra-core";
import { useNavigate } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import type {
  IngestionJob,
  SourceConnection,
  WorkbenchJobResponse,
} from "./types";
import { getErrorMessage } from "./utils";
import { KcCatalogPicker, type KcCatalogSelection } from "./KcCatalogPicker";
import { useWorkspace } from "./workspace";
import { createIdempotencyKey, runWorkbenchAction } from "./workbenchActions";

const qualifications = [
  "小微企业",
  "A级纳税人",
  "科技型中小企业",
  "高新技术企业",
  "专精特新中小企业",
  "创新型中小企业",
  "专精特新企业",
  "专精特新小巨人企业",
  "制造业单项冠军企业",
  "瞪羚企业",
  "雏鹰企业",
  "独角兽企业",
  "隐形冠军企业",
  "重点软件企业",
  "智能制造标杆企业",
] as const;

type FormState = {
  listName: string;
  keyword: string;
  regions: KcCatalogSelection[];
  industries: KcCatalogSelection[];
  count: number;
  enterpriseType: "company" | "cooperative" | "individual";
  statusNormal: boolean;
  phone: boolean;
  email: boolean;
  actualOperatingOnly: boolean;
  qualification: string;
  capitalMin: string;
  capitalMax: string;
  insuredMin: string;
  insuredMax: string;
  establishedYears: string;
  excludeBusinessAbnormal: boolean;
  excludeSevereViolation: boolean;
};

const initialState: FormState = {
  listName: "",
  keyword: "",
  regions: [],
  industries: [],
  count: 20,
  enterpriseType: "company",
  statusNormal: true,
  phone: true,
  email: false,
  actualOperatingOnly: true,
  qualification: "none",
  capitalMin: "",
  capitalMax: "",
  insuredMin: "",
  insuredMax: "",
  establishedYears: "3",
  excludeBusinessAbnormal: true,
  excludeSevereViolation: true,
};

export function FindCompaniesPage() {
  const { workspace } = useWorkspace();
  const notify = useNotify();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(initialState);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedJobs, setSubmittedJobs] = useState<WorkbenchJobResponse[]>(
    [],
  );
  const hasNavigated = useRef(false);

  const sources = useGetList<SourceConnection>("source_connections_safe", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "name", order: "ASC" },
    filter: { workspace_id: workspace?.id },
  });
  const jobIds = useMemo(
    () => new Set(submittedJobs.map((job) => job.jobId)),
    [submittedJobs],
  );
  const jobs = useGetList<IngestionJob>(
    "ingestion_jobs",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "requested_at", order: "DESC" },
      filter: { workspace_id: workspace?.id },
    },
    {
      enabled: submittedJobs.length > 0,
      refetchInterval: (result) => {
        const tracked = (result.state.data?.data ?? []).filter((job) =>
          jobIds.has(job.id),
        );
        return tracked.length < submittedJobs.length ||
          tracked.some((job) => ["queued", "running"].includes(job.status))
          ? 1_500
          : false;
      },
    },
  );

  const kcSource = (sources.data ?? []).find(
    (source) => source.provider === "huoke_assistant",
  );
  const sourceReady =
    kcSource && ["ready", "degraded"].includes(kcSource.status);
  const callCount = Math.ceil(form.count / 10);
  const scopeCount = [
    Boolean(form.keyword.trim()),
    form.regions.length > 0,
    form.industries.length > 0,
    form.qualification !== "none",
    Boolean(form.capitalMin || form.capitalMax),
    Boolean(form.insuredMin || form.insuredMax),
    form.establishedYears !== "any",
  ].filter(Boolean).length;

  const trackedJobs = (jobs.data ?? []).filter((job) => jobIds.has(job.id));
  const completed = trackedJobs.filter((job) =>
    ["completed", "partial"].includes(job.status),
  );
  const failed = trackedJobs.filter((job) => job.status === "failed");

  useEffect(() => {
    if (
      hasNavigated.current ||
      submittedJobs.length === 0 ||
      completed.length + failed.length < submittedJobs.length
    ) {
      return;
    }
    const listId = completed
      .map((job) => job.result?.company_list_id)
      .find(
        (value): value is string => typeof value === "string" && Boolean(value),
      );
    if (listId) {
      hasNavigated.current = true;
      notify(
        `查找完成：${completed.length} 个查询页成功${failed.length ? `，${failed.length} 个失败` : ""}。`,
        {
          type: failed.length ? "warning" : "success",
        },
      );
      navigate(`/lists/${listId}`);
    }
  }, [completed, failed, navigate, notify, submittedJobs.length]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const requestConfirmation = () => {
    if (!sourceReady) {
      notify("获客助手尚未就绪，请先在右上角“配置”中完成检查。", {
        type: "warning",
      });
      return;
    }
    if (!form.industries.length && !form.keyword.trim()) {
      notify("请先选择行业或输入企业/产品关键词；地区不选时按全国查找。", {
        type: "warning",
      });
      return;
    }
    if (scopeCount < 2) {
      notify(
        "请至少选择两类有效范围条件，例如“地区 + 行业”或“关键词 + 规模”，避免无边界调用。",
        {
          type: "warning",
        },
      );
      return;
    }
    if (
      invalidRange(form.capitalMin, form.capitalMax) ||
      invalidRange(form.insuredMin, form.insuredMax)
    ) {
      notify("区间下限不能大于上限。", { type: "warning" });
      return;
    }
    setConfirmOpen(true);
  };

  const submit = async () => {
    if (!workspace || !kcSource) return;
    setSubmitting(true);
    setConfirmOpen(false);
    hasNavigated.current = false;
    const listName = form.listName.trim() || buildListName(form);
    const criteriaBase = buildCriteria(form);
    const receipts: WorkbenchJobResponse[] = [];
    try {
      for (let page = 1; page <= callCount; page += 1) {
        const remaining = form.count - (page - 1) * 10;
        const pageSize = Math.min(10, remaining);
        const receipt = await runWorkbenchAction(
          "start_ingestion",
          workspace.id,
          {
            sourceConnectionId: kcSource.id,
            queryKind: "company_search",
            queryText: summaryText(form),
            listName,
            criteria: { ...criteriaBase, page, pageSize },
          },
          createIdempotencyKey(`find-page-${page}`),
        );
        receipts.push(receipt);
      }
      setSubmittedJobs(receipts);
      notify(
        `已提交 ${receipts.length} 次获客助手查询，完成后会自动打开名单。`,
        { type: "info" },
      );
    } catch (error) {
      setSubmittedJobs(receipts);
      notify(getErrorMessage(error), { type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1240px] space-y-7">
      <header className="space-y-3">
        <Badge
          variant="outline"
          className="rounded-full bg-white px-3 py-1 text-slate-600"
        >
          <Buildings className="mr-1 size-3.5" /> 金蝶征信有限公司数据支撑
        </Badge>
        <h1 className="text-3xl font-semibold tracking-[-0.035em] text-[#1d1d1f] sm:text-[40px]">
          找企业
        </h1>
        <p className="max-w-3xl text-[15px] leading-7 text-slate-500">
          按地区、行业和经营条件筛选企业。提交前会显示预计查询次数。
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="overflow-visible rounded-[28px] border border-black/[0.06] bg-white shadow-[0_12px_40px_rgba(0,0,0,0.05)]">
          <div className="space-y-7 p-5 sm:p-8">
            <FormSection
              icon={MapPin}
              title="企业范围"
              description="选择地区、行业或企业关键词。"
            >
              <Field label="在哪里找" hint="可选；不选则按全国查找">
                <KcCatalogPicker
                  kind="regions"
                  value={form.regions}
                  onChange={(value) => update("regions", value)}
                  placeholder="搜索省、市或区县"
                />
              </Field>
              <Field label="找什么行业">
                <KcCatalogPicker
                  kind="industries"
                  value={form.industries}
                  onChange={(value) => update("industries", value)}
                  placeholder="搜索行业名称"
                />
              </Field>
              <Field
                label="企业或产品关键词"
                hint="可选；支持企业名称、产品或经营范围关键词"
              >
                <Input
                  value={form.keyword}
                  onChange={(event) => update("keyword", event.target.value)}
                  placeholder="例如：工业机器人、冷链设备"
                  className="h-12 rounded-xl"
                />
              </Field>
            </FormSection>

            <FormSection
              icon={UsersThree}
              title="规模与联系方式"
              description="进一步限定企业规模和可联系条件。"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="注册资本（万元）">
                  <RangeInputs
                    label="注册资本（万元）"
                    min={form.capitalMin}
                    max={form.capitalMax}
                    onMin={(value) => update("capitalMin", value)}
                    onMax={(value) => update("capitalMax", value)}
                  />
                </Field>
                <Field label="参保人数">
                  <RangeInputs
                    label="参保人数"
                    min={form.insuredMin}
                    max={form.insuredMax}
                    onMin={(value) => update("insuredMin", value)}
                    onMax={(value) => update("insuredMax", value)}
                  />
                </Field>
                <Field label="成立时间">
                  <Select
                    value={form.establishedYears}
                    onValueChange={(value) => update("establishedYears", value)}
                  >
                    <SelectTrigger
                      aria-label="成立时间"
                      className="h-12 w-full rounded-xl"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">不限</SelectItem>
                      <SelectItem value="1">成立 1 年以上</SelectItem>
                      <SelectItem value="3">成立 3 年以上</SelectItem>
                      <SelectItem value="5">成立 5 年以上</SelectItem>
                      <SelectItem value="10">成立 10 年以上</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="企业资质">
                  <Select
                    value={form.qualification}
                    onValueChange={(value) => update("qualification", value)}
                  >
                    <SelectTrigger
                      aria-label="企业资质"
                      className="h-12 w-full rounded-xl"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">不限</SelectItem>
                      {qualifications.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <ToggleRow
                  label="仅显示有联系电话的企业"
                  checked={form.phone}
                  onChange={(value) => update("phone", value)}
                />
                <ToggleRow
                  label="仅显示有邮箱的企业"
                  checked={form.email}
                  onChange={(value) => update("email", value)}
                  hint="与电话同时勾选表示两项都需满足"
                />
                <ToggleRow
                  label="仅实际经营企业"
                  checked={form.actualOperatingOnly}
                  onChange={(value) => update("actualOperatingOnly", value)}
                />
                <ToggleRow
                  label="仅正常经营"
                  checked={form.statusNormal}
                  onChange={(value) => update("statusNormal", value)}
                />
              </div>
            </FormSection>

            <FormSection
              icon={WarningCircle}
              title="风险筛选与数量"
              description="选择需要排除的风险状态和名单数量。"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <ToggleRow
                  label="排除经营异常"
                  checked={form.excludeBusinessAbnormal}
                  onChange={(value) => update("excludeBusinessAbnormal", value)}
                />
                <ToggleRow
                  label="排除严重违法"
                  checked={form.excludeSevereViolation}
                  onChange={(value) => update("excludeSevereViolation", value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="找多少家">
                  <Select
                    value={String(form.count)}
                    onValueChange={(value) => update("count", Number(value))}
                  >
                    <SelectTrigger
                      aria-label="找多少家"
                      className="h-12 w-full rounded-xl"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[10, 20, 30, 50].map((count) => (
                        <SelectItem key={count} value={String(count)}>
                          {count} 家
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="名单名称" hint="不填会按地区和行业自动命名">
                  <Input
                    aria-label="名单名称"
                    value={form.listName}
                    onChange={(event) => update("listName", event.target.value)}
                    placeholder="例如：上海机器人潜在客户"
                    className="h-12 rounded-xl"
                  />
                </Field>
              </div>
            </FormSection>
          </div>
          <div className="flex flex-col gap-4 border-t border-black/[0.06] bg-slate-50/70 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div className="text-sm text-slate-500">
              已选 <strong className="text-slate-900">{scopeCount}</strong>{" "}
              类范围条件 · 预计调用{" "}
              <strong className="text-slate-900">{callCount}</strong> 次
            </div>
            <Button
              onClick={requestConfirmation}
              disabled={submitting || submittedJobs.length > 0}
              className="h-12 rounded-full bg-[#0969da] px-7 hover:bg-[#075ab9]"
            >
              {submitting ? (
                <SpinnerGap className="animate-spin" />
              ) : (
                <MagnifyingGlass weight="bold" />
              )}
              开始查找
            </Button>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-[22px] border border-black/[0.06] bg-white p-5">
            <h2 className="text-sm font-semibold">调用前说明</h2>
            <ul className="mt-4 space-y-3 text-xs leading-5 text-slate-500">
              <li className="flex gap-2">
                <Coins className="mt-0.5 size-4 shrink-0 text-[#c57a00]" />
                获客助手单次最多返回 10 家，当前条件预计调用 {callCount} 次。
              </li>
              <li className="flex gap-2">
                <CheckCircle className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                查询条件、原始响应和字段来源都会留痕。
              </li>
              <li className="flex gap-2">
                <Info className="mt-0.5 size-4 shrink-0 text-[#0969da]" />
                结果为空不代表企业不存在，可能是条件过严。
              </li>
            </ul>
          </section>
          <section className="rounded-[22px] border border-[#d7e8ff] bg-[#eef6ff] p-5">
            <p className="text-xs font-semibold text-[#0b5eb7]">数据源状态</p>
            <div className="mt-3 flex items-center gap-2 text-sm font-medium text-[#17324f]">
              <span
                className={`size-2 rounded-full ${sourceReady ? "bg-emerald-500" : "bg-amber-500"}`}
              />
              获客助手 {sourceReady ? "可以调用" : "需要配置"}
            </div>
            <p className="mt-2 text-xs leading-5 text-[#47627e]">
              {kcSource?.status === "degraded"
                ? "本次首次真实查询成功后会自动转为已验证。"
                : "配置入口位于页面右上角。"}
            </p>
          </section>
          {submittedJobs.length ? (
            <section className="rounded-[22px] border border-black/[0.06] bg-white p-5">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <ClockCountdown className="size-4" />
                正在生成名单
              </p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[#0969da] transition-all"
                  style={{
                    width: `${Math.max(8, ((completed.length + failed.length) / submittedJobs.length) * 100)}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {completed.length + failed.length} / {submittedJobs.length}{" "}
                个查询页完成
              </p>
            </section>
          ) : null}
        </aside>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="rounded-[24px] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>确认本次真实查询</DialogTitle>
            <DialogDescription>
              请核对筛选条件和预计调用次数。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex flex-wrap gap-2">
              {summaryChips(form).map((chip) => (
                <Badge
                  key={chip}
                  variant="outline"
                  className="rounded-full px-3 py-1.5"
                >
                  {chip}
                </Badge>
              ))}
            </div>
            <Alert className="border-amber-200 bg-amber-50/70">
              <Coins />
              <AlertTitle>预计调用 {callCount} 次</AlertTitle>
              <AlertDescription>
                每次最多 10 家，共请求 {form.count} 家。联系方式“电话 +
                邮箱”是同时满足，不是二选一。
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              className="rounded-full"
            >
              返回修改
            </Button>
            <Button onClick={submit} className="rounded-full bg-[#0969da] px-6">
              <Check weight="bold" />
              确认并调用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FormSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof MapPin;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eef5ff] text-[#0969da]">
          <Icon className="size-4.5" />
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-[-0.01em]">
            {title}
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="space-y-4 pl-0 sm:pl-12">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm font-medium">{label}</Label>
        {hint ? (
          <span className="text-[11px] text-slate-400">{hint}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function RangeInputs({
  label,
  min,
  max,
  onMin,
  onMax,
}: {
  label: string;
  min: string;
  max: string;
  onMin: (value: string) => void;
  onMax: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <Input
        aria-label={`${label}最低值`}
        type="number"
        min="0"
        value={min}
        onChange={(event) => onMin(event.target.value)}
        placeholder="最低"
        className="h-12 rounded-xl"
      />
      <span className="text-slate-400">—</span>
      <Input
        aria-label={`${label}最高值`}
        type="number"
        min="0"
        value={max}
        onChange={(event) => onMax(event.target.value)}
        placeholder="最高"
        className="h-12 rounded-xl"
      />
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-black/[0.06] bg-slate-50/60 px-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint ? (
          <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
        ) : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function optionalRange(minText: string, maxText: string) {
  const min = minText === "" ? undefined : Number(minText);
  const max = maxText === "" ? undefined : Number(maxText);
  return min === undefined && max === undefined
    ? []
    : [
        {
          ...(min !== undefined ? { min } : {}),
          ...(max !== undefined ? { max } : {}),
        },
      ];
}

function invalidRange(minText: string, maxText: string) {
  return minText !== "" && maxText !== "" && Number(minText) > Number(maxText);
}

function yearsAgo(years: number) {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
}

function buildCriteria(form: FormState) {
  const riskFlags: Record<string, "none"> = {};
  if (form.excludeBusinessAbnormal) riskFlags.businessAbnormal = "none";
  if (form.excludeSevereViolation) riskFlags.severeViolation = "none";
  return {
    ...(form.keyword.trim() ? { keyword: form.keyword.trim() } : {}),
    regions: form.regions.map(({ label, providerValues }) => ({
      label,
      providerValues,
    })),
    industries: form.industries.map(({ label, providerValues }) => ({
      label,
      providerValues,
    })),
    statuses: form.statusNormal ? ["正常"] : [],
    enterpriseTypes: [form.enterpriseType],
    contactRequirements: [
      form.phone ? "phone" : null,
      form.email ? "email" : null,
    ].filter(Boolean),
    actualOperatingOnly: form.actualOperatingOnly,
    qualificationTags:
      form.qualification === "none" ? [] : [form.qualification],
    riskFlags,
    ...(optionalRange(form.capitalMin, form.capitalMax).length
      ? {
          registeredCapitalWan: optionalRange(form.capitalMin, form.capitalMax),
        }
      : {}),
    ...(optionalRange(form.insuredMin, form.insuredMax).length
      ? { insuredCount: optionalRange(form.insuredMin, form.insuredMax) }
      : {}),
    ...(form.establishedYears === "any"
      ? {}
      : {
          establishedBetween: [
            {
              start: "1900-01-01",
              end: yearsAgo(Number(form.establishedYears)),
            },
          ],
        }),
  };
}

function buildListName(form: FormState) {
  const region = form.regions[0]?.label.replaceAll(" · ", "") ?? "全国";
  const industry =
    form.industries[0]?.label.split(" · ").at(-1) ??
    (form.keyword.trim() || "目标企业");
  return `${region} · ${industry}`;
}

function summaryChips(form: FormState) {
  return [
    ...form.regions.map((item) => item.label),
    ...form.industries.map((item) => item.label),
    form.keyword.trim() ? `关键词：${form.keyword.trim()}` : "",
    form.statusNormal ? "正常经营" : "",
    form.actualOperatingOnly ? "实际经营" : "",
    form.phone ? "有电话" : "",
    form.email ? "有邮箱" : "",
    form.establishedYears !== "any"
      ? `成立 ${form.establishedYears} 年以上`
      : "",
    form.qualification !== "none" ? form.qualification : "",
    form.excludeBusinessAbnormal ? "无经营异常" : "",
    form.excludeSevereViolation ? "无严重违法" : "",
  ].filter(Boolean);
}

function summaryText(form: FormState) {
  return summaryChips(form).join("；");
}
