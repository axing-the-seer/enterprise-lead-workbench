import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Globe2,
  Loader2,
  Search,
  ShieldQuestion,
  X,
} from "lucide-react";
import { useCreate, useGetList, useNotify, useUpdate } from "ra-core";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { DataBoundary, EmptyState, PageHeader } from "./components";
import type {
  Company,
  CompanyEvidence,
  CompanyFieldFact,
  ManualReview,
  RuleResult,
  RuleRun,
  SourceConnection,
  WorkbenchJobResponse,
} from "./types";
import { formatDateTime, getErrorMessage } from "./utils";
import { useWorkspace } from "./workspace";
import { createIdempotencyKey, runWorkbenchAction } from "./workbenchActions";
import { displayFact, factLabels, providerLabel } from "./factPresentation";
import { operatingStatusLabel } from "./companyPresentation";
import {
  buildWebEvidenceCriteria,
  buildWebEvidenceJobPayload,
  isReadyWebEvidenceSource,
  type WebEvidenceClaimType,
} from "./webEvidence";

const decisionLabels: Record<string, string> = {
  include: "入选",
  exclude: "排除",
  needs_review: "待核验",
};

const webEvidenceClaimLabels: Record<WebEvidenceClaimType, string> = {
  official_website: "官方网站",
  product: "产品与服务",
  award: "资质与奖项",
  tender: "招投标",
  recruiting: "招聘动态",
  news: "新闻报道",
  other: "其他证据",
};

export function EnterpriseReviewPage() {
  const { workspace } = useWorkspace();
  const runs = useGetList<RuleRun>("rule_runs", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "requested_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });
  const [selectedRunId, setSelectedRunId] = useState("");
  const [search, setSearch] = useState("");
  const [decision, setDecision] = useState("all");
  const [selectedResult, setSelectedResult] = useState<RuleResult | null>(null);
  const results = useGetList<RuleResult>(
    "rule_results",
    {
      pagination: { page: 1, perPage: 500 },
      sort: { field: "score", order: "DESC" },
      filter: {
        workspace_id: workspace?.id,
        rule_run_id: selectedRunId,
        ...(decision === "all" ? {} : { decision }),
      },
    },
    { enabled: Boolean(selectedRunId) },
  );
  const companies = useGetList<Company>("companies", {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: "updated_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });

  const companyMap = useMemo(
    () =>
      new Map(
        (companies.data ?? []).map((company) => [String(company.id), company]),
      ),
    [companies.data],
  );
  const filteredResults = useMemo(
    () =>
      (results.data ?? []).filter((result) => {
        if (!search.trim()) return true;
        const company = companyMap.get(String(result.company_id));
        const keyword = search.trim().toLowerCase();
        return [
          company?.name,
          company?.unified_social_credit_code,
          company?.legal_representative,
        ].some((value) => value?.toLowerCase().includes(keyword));
      }),
    [companyMap, results.data, search],
  );

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="人工审阅"
        title="企业审阅"
        description="逐家查看规则结论、缺失字段和来源证据。人工决定会单独记录，不覆盖企查查、获客助手或用户文件中的原始事实。"
      />

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>选择规则执行</CardTitle>
          <CardDescription>
            企业审阅必须绑定到一次确定的规则版本与不可变企业批次。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[minmax(240px,1fr)_minmax(180px,240px)_minmax(220px,1fr)]">
          <div className="space-y-2">
            <Label>规则执行任务</Label>
            <Select value={selectedRunId} onValueChange={setSelectedRunId}>
              <SelectTrigger className="w-full" aria-label="规则执行任务">
                <SelectValue placeholder="选择已执行任务" />
              </SelectTrigger>
              <SelectContent>
                {runs.data?.map((run) => (
                  <SelectItem key={run.id} value={run.id}>
                    {run.run_mode === "sample" ? "样本试算" : "整批执行"} ·{" "}
                    {formatDateTime(run.requested_at)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>结论</Label>
            <Select value={decision} onValueChange={setDecision}>
              <SelectTrigger className="w-full" aria-label="结论筛选">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部结论</SelectItem>
                <SelectItem value="include">入选</SelectItem>
                <SelectItem value="needs_review">待核验</SelectItem>
                <SelectItem value="exclude">排除</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-search">搜索企业</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                id="company-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="名称、信用代码或法人"
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {!selectedRunId ? (
        <EmptyState
          title="请选择一次真实规则执行"
          description="只有后端已经产生规则结果后，才能进入企业级审阅。这里不会展示虚构示例。"
          actionLabel="查看执行任务"
          actionTo="/runs"
        />
      ) : (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>企业结论</CardTitle>
            <CardDescription>
              当前加载 {filteredResults.length}{" "}
              条；点击企业查看字段事实和证据链。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataBoundary
              isPending={results.isPending || companies.isPending}
              error={results.error || companies.error}
              title="无法读取企业审阅结果"
            >
              {filteredResults.length === 0 ? (
                <EmptyState
                  title="当前条件下没有企业结果"
                  description="请确认规则任务已经完成，或调整结论与企业搜索条件。"
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>企业</TableHead>
                      <TableHead>经营状态</TableHead>
                      <TableHead>规则结论</TableHead>
                      <TableHead>评分</TableHead>
                      <TableHead>缺失字段</TableHead>
                      <TableHead className="text-right">审阅</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResults.map((result) => {
                      const company = companyMap.get(String(result.company_id));
                      return (
                        <TableRow key={result.id}>
                          <TableCell>
                            <p className="font-medium">
                              {company?.name ?? `企业 ID ${result.company_id}`}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {company?.unified_social_credit_code ??
                                "信用代码未知"}
                            </p>
                          </TableCell>
                          <TableCell>
                            {operatingStatusLabel(company?.operating_status)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                result.decision === "exclude"
                                  ? "secondary"
                                  : result.decision === "needs_review"
                                    ? "outline"
                                    : "default"
                              }
                            >
                              {decisionLabels[result.decision ?? ""] ??
                                result.decision ??
                                "未知"}
                            </Badge>
                          </TableCell>
                          <TableCell>{result.score ?? "—"}</TableCell>
                          <TableCell>
                            {(result.missing_fields?.length ?? 0) > 0 ? (
                              <span className="text-amber-700">
                                {result.missing_fields!.slice(0, 2).join("、")}
                                {result.missing_fields!.length > 2 ? "…" : ""}
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedResult(result)}
                            >
                              查看证据
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </DataBoundary>
          </CardContent>
        </Card>
      )}

      <CompanyEvidenceDialog
        result={selectedResult}
        company={
          selectedResult
            ? companyMap.get(String(selectedResult.company_id))
            : undefined
        }
        workspaceId={workspace!.id}
        onOpenChange={(open) => {
          if (!open) setSelectedResult(null);
        }}
      />
    </div>
  );
}

function CompanyEvidenceDialog({
  result,
  company,
  workspaceId,
  onOpenChange,
}: {
  result: RuleResult | null;
  company?: Company;
  workspaceId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const notify = useNotify();
  const enabled = Boolean(result);
  const facts = useGetList<CompanyFieldFact>(
    "company_field_facts",
    {
      pagination: { page: 1, perPage: 500 },
      sort: { field: "observed_at", order: "DESC" },
      filter: {
        workspace_id: workspaceId,
        company_id: result?.company_id,
        is_current: true,
      },
    },
    { enabled },
  );
  const evidence = useGetList<CompanyEvidence>(
    "company_evidence",
    {
      pagination: { page: 1, perPage: 200 },
      sort: { field: "captured_at", order: "DESC" },
      filter: { workspace_id: workspaceId, company_id: result?.company_id },
    },
    { enabled },
  );
  const reviews = useGetList<ManualReview>(
    "manual_reviews",
    {
      pagination: { page: 1, perPage: 10 },
      sort: { field: "reviewed_at", order: "DESC" },
      filter: {
        workspace_id: workspaceId,
        rule_result_id: result?.id,
        is_current: true,
      },
    },
    { enabled },
  );
  const [create] = useCreate<ManualReview>();
  const [update] = useUpdate<ManualReview>();
  const [reviewDecision, setReviewDecision] = useState("needs_information");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [webEvidenceOpen, setWebEvidenceOpen] = useState(false);
  const currentReview = reviews.data?.[0];

  const saveReview = async () => {
    if (!result) return;
    setIsSaving(true);
    try {
      const data = {
        workspace_id: workspaceId,
        rule_result_id: result.id,
        company_id: result.company_id,
        decision: reviewDecision,
        note: note.trim() || null,
        is_current: true,
        reviewed_at: new Date().toISOString(),
      };
      if (currentReview) {
        await update(
          "manual_reviews",
          { id: currentReview.id, data, previousData: currentReview },
          { returnPromise: true },
        );
      } else {
        await create("manual_reviews", { data }, { returnPromise: true });
      }
      notify("人工审阅结论已保存，原始事实没有被改写。", { type: "success" });
      await reviews.refetch();
    } catch (error) {
      notify(getErrorMessage(error), { type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Dialog
        open={enabled}
        onOpenChange={(open) => {
          if (!open) setWebEvidenceOpen(false);
          onOpenChange(open);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{company?.name ?? "企业证据"}</DialogTitle>
            <DialogDescription>
              {company?.unified_social_credit_code ?? "统一社会信用代码未知"} ·
              规则结论：
              {decisionLabels[result?.decision ?? ""] ??
                result?.decision ??
                "未知"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-2 lg:grid-cols-2">
            <section>
              <h3 className="mb-3 text-sm font-semibold">当前字段事实</h3>
              <DataBoundary
                isPending={facts.isPending}
                error={facts.error}
                title="无法读取字段事实"
              >
                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {facts.data?.map((fact) => (
                    <div
                      key={fact.id}
                      className="rounded-lg border p-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {factLabels[fact.field_name] ?? fact.field_name}
                        </span>
                        <Badge variant="outline">
                          {providerLabel(fact.source_provider)}
                        </Badge>
                      </div>
                      <p className="mt-2 break-words text-muted-foreground">
                        {displayFact(fact)}
                      </p>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        观测时间：{formatDateTime(fact.observed_at)}
                        {typeof fact.confidence === "number"
                          ? ` · 置信度 ${Math.round(fact.confidence * 100)}%`
                          : ""}
                      </p>
                    </div>
                  ))}
                  {(facts.data?.length ?? 0) === 0 ? (
                    <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                      暂无字段事实
                    </p>
                  ) : null}
                </div>
              </DataBoundary>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">证据链</h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setWebEvidenceOpen(true)}
                >
                  <Globe2 />
                  补充 Web 证据
                </Button>
              </div>
              <DataBoundary
                isPending={evidence.isPending}
                error={evidence.error}
                title="无法读取企业证据"
              >
                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {evidence.data?.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border p-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{item.title}</span>
                        <Badge variant="outline">
                          {providerLabel(item.source_provider)}
                        </Badge>
                      </div>
                      {item.excerpt ? (
                        <p className="mt-2 line-clamp-3 text-muted-foreground">
                          {item.excerpt}
                        </p>
                      ) : null}
                      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{formatDateTime(item.captured_at)}</span>
                        {item.source_url ? (
                          <a
                            href={item.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            打开来源
                            <ExternalLink className="size-3" />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {(evidence.data?.length ?? 0) === 0 ? (
                    <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                      暂无可追溯证据
                    </p>
                  ) : null}
                </div>
              </DataBoundary>
            </section>
          </div>

          {(result?.missing_fields?.length ?? 0) > 0 ? (
            <Alert className="border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30">
              <AlertTriangle />
              <AlertTitle>缺失字段</AlertTitle>
              <AlertDescription>
                {result!.missing_fields!.join("、")}
              </AlertDescription>
            </Alert>
          ) : null}

          <section className="space-y-4 rounded-xl border p-4">
            <div>
              <h3 className="text-sm font-semibold">人工审阅结论</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                审阅决定作为单独记录保存，可追溯到账号与时间。
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
              <div className="space-y-2">
                <Label>决定</Label>
                <Select
                  value={reviewDecision}
                  onValueChange={setReviewDecision}
                >
                  <SelectTrigger className="w-full" aria-label="人工审阅决定">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approve">
                      <Check className="size-4" />
                      通过
                    </SelectItem>
                    <SelectItem value="reject">
                      <X className="size-4" />
                      拒绝
                    </SelectItem>
                    <SelectItem value="needs_information">
                      <ShieldQuestion className="size-4" />
                      需要补充信息
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="review-note">审阅说明</Label>
                <Textarea
                  id="review-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="记录决定依据或需要补充的证据"
                  rows={3}
                />
              </div>
            </div>
          </section>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
            <Button onClick={saveReview} disabled={isSaving}>
              {isSaving ? <Loader2 className="animate-spin" /> : null}
              保存人工结论
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <WebEvidenceDialog
        open={enabled && webEvidenceOpen}
        onOpenChange={setWebEvidenceOpen}
        workspaceId={workspaceId}
        companyId={result?.company_id ?? null}
        companyName={company?.name}
      />
    </>
  );
}

export function WebEvidenceDialog({
  open,
  onOpenChange,
  workspaceId,
  companyId,
  companyName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  companyId: string | number | null;
  companyName?: string;
}) {
  const notify = useNotify();
  const sources = useGetList<SourceConnection>(
    "source_connections_safe",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "name", order: "ASC" },
      filter: { workspace_id: workspaceId, provider: "web_search" },
    },
    { enabled: open },
  );
  const readySources = useMemo(
    () => (sources.data ?? []).filter(isReadyWebEvidenceSource),
    [sources.data],
  );
  const [sourceId, setSourceId] = useState("");
  const [claimType, setClaimType] =
    useState<WebEvidenceClaimType>("official_website");
  const [extraKeywordsText, setExtraKeywordsText] = useState("");
  const [site, setSite] = useState("");
  const [maxResults, setMaxResults] = useState("5");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<WorkbenchJobResponse | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const selectedSource = readySources.find((source) => source.id === sourceId);

  const resetSubmission = () => {
    setReceipt(null);
    idempotencyKeyRef.current = null;
  };

  useEffect(() => {
    if (!open) {
      setSourceId("");
      setClaimType("official_website");
      setExtraKeywordsText("");
      setSite("");
      setMaxResults("5");
      setReceipt(null);
      idempotencyKeyRef.current = null;
    }
  }, [open]);

  const submit = async () => {
    if (companyId === null) {
      notify("缺少已入库企业标识，不能发起 Web 证据检索。", {
        type: "error",
      });
      return;
    }
    if (!selectedSource) {
      notify("请选择状态为 ready 或 degraded 的 Web 证据数据源。", {
        type: "warning",
      });
      return;
    }

    let criteria;
    try {
      criteria = buildWebEvidenceCriteria({
        companyId,
        claimType,
        extraKeywordsText,
        site,
        maxResults: Number(maxResults),
      });
    } catch (error) {
      notify(getErrorMessage(error), { type: "error" });
      return;
    }

    setIsSubmitting(true);
    setReceipt(null);
    try {
      const idempotencyKey =
        idempotencyKeyRef.current ?? createIdempotencyKey("web-evidence");
      idempotencyKeyRef.current = idempotencyKey;
      const job = await runWorkbenchAction(
        "start_ingestion",
        workspaceId,
        buildWebEvidenceJobPayload(selectedSource.id, criteria),
        idempotencyKey,
      );
      setReceipt(job);
      notify(`Web 证据任务已提交（${job.status}）`, {
        type: "success",
      });
    } catch (error) {
      notify(getErrorMessage(error), { type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>补充 Web 证据</DialogTitle>
          <DialogDescription>
            本次检索只补充到已入库企业“
            {companyName ?? `ID ${companyId ?? "缺失"}`}
            ”，不会从网页创建新企业。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <Alert className="border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30">
            <AlertTriangle />
            <AlertTitle>提交后将消耗腾讯云 WSA 搜索额度</AlertTitle>
            <AlertDescription>
              数据源页的“检查配置”不搜索、不计费；只有此处提交真实检索才会消耗额度。
            </AlertDescription>
          </Alert>

          {sources.error ? (
            <Alert variant="destructive">
              <AlertTitle>无法读取 Web 证据数据源</AlertTitle>
              <AlertDescription>
                {getErrorMessage(sources.error)}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="web-evidence-source">Web 证据数据源</Label>
            <Select
              value={sourceId}
              onValueChange={(value) => {
                setSourceId(value);
                resetSubmission();
              }}
              disabled={sources.isPending}
            >
              <SelectTrigger id="web-evidence-source" className="w-full">
                <SelectValue
                  placeholder={
                    sources.isPending ? "正在读取连接" : "选择已配置连接"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {readySources.map((source) => (
                  <SelectItem key={source.id} value={source.id}>
                    {source.name}（{source.status}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              只列出 provider=web_search 且状态为 ready 或 degraded 的连接。
            </p>
          </div>

          {!sources.isPending && !sources.error && readySources.length === 0 ? (
            <Alert>
              <AlertTitle>没有可用的 Web 证据连接</AlertTitle>
              <AlertDescription>
                请先到“数据源”开启服务器腾讯云 WSA
                凭证引用，然后执行“检查配置”。
              </AlertDescription>
            </Alert>
          ) : null}

          {selectedSource?.status === "degraded" ? (
            <Alert>
              <AlertTitle>当前连接为 degraded</AlertTitle>
              <AlertDescription>
                本次真实检索会同时验证远程授权，仍会消耗搜索额度。
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>证据类型</Label>
              <Select
                value={claimType}
                onValueChange={(value) => {
                  setClaimType(value as WebEvidenceClaimType);
                  resetSubmission();
                }}
              >
                <SelectTrigger className="w-full" aria-label="证据类型">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(webEvidenceClaimLabels).map(
                    ([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>结果数</Label>
              <Select
                value={maxResults}
                onValueChange={(value) => {
                  setMaxResults(value);
                  resetSubmission();
                }}
              >
                <SelectTrigger className="w-full" aria-label="证据结果数">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, index) => index + 1).map(
                    (count) => (
                      <SelectItem key={count} value={String(count)}>
                        {count} 条
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="web-evidence-keywords">额外关键词（可选）</Label>
            <Textarea
              id="web-evidence-keywords"
              value={extraKeywordsText}
              onChange={(event) => {
                setExtraKeywordsText(event.target.value);
                resetSubmission();
              }}
              placeholder="多个关键词可用逗号或换行分隔"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="web-evidence-site">限定站点（可选）</Label>
            <Input
              id="web-evidence-site"
              value={site}
              onChange={(event) => {
                setSite(event.target.value);
                resetSubmission();
              }}
              placeholder="例如官网域名"
            />
          </div>

          {receipt ? (
            <Alert>
              <AlertTitle>Web 证据任务：{receipt.status}</AlertTitle>
              <AlertDescription>
                任务 ID：{receipt.jobId}。完成后证据会按已有企业 ID 归档。
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={submit}
            disabled={
              companyId === null ||
              !selectedSource ||
              isSubmitting ||
              Boolean(receipt)
            }
          >
            {isSubmitting ? <Loader2 className="animate-spin" /> : <Globe2 />}
            确认消耗额度并提交
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
