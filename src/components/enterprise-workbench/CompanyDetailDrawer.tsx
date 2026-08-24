import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowSquareOut,
  Buildings,
  CheckCircle,
  FileHtml,
  GlobeHemisphereWest,
  IdentificationCard,
  Info,
  SpinnerGap,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  Company,
  CompanyEvidence,
  CompanyFieldFact,
  CompanyReport,
  IngestionJob,
  SourceConnection,
} from "./types";
import { formatDateTime, getErrorMessage } from "./utils";
import { createIdempotencyKey, runWorkbenchAction } from "./workbenchActions";
import {
  displayCompanyRegion,
  formatCapitalWan,
  operatingStatusLabel,
} from "./companyPresentation";
import { displayFact, factLabels, providerLabel } from "./factPresentation";

export function CompanyDetailDrawer({
  company,
  open,
  onOpenChange,
  workspaceId,
  listName,
  sources,
  jobs,
  defaultTab = "profile",
  onJobsChanged,
}: {
  company: Company | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  listName: string;
  sources: SourceConnection[];
  jobs: IngestionJob[];
  defaultTab?: "profile" | "sources" | "report";
  onJobsChanged: () => void | Promise<void>;
}) {
  const notify = useNotify();
  const navigate = useNavigate();
  const [tab, setTab] = useState(defaultTab);
  const [running, setRunning] = useState<"qcc" | "report" | null>(null);
  const [qccConfirmOpen, setQccConfirmOpen] = useState(false);
  const refreshedJobSignature = useRef("");
  const enabled = open && Boolean(company);
  useEffect(() => {
    if (open) setTab(defaultTab);
  }, [defaultTab, open, company?.id]);
  const facts = useGetList<CompanyFieldFact>(
    "company_field_facts",
    {
      pagination: { page: 1, perPage: 500 },
      sort: { field: "observed_at", order: "DESC" },
      filter: {
        workspace_id: workspaceId,
        company_id: company?.id,
        is_current: true,
      },
    },
    { enabled },
  );
  const evidence = useGetList<CompanyEvidence>(
    "company_evidence",
    {
      pagination: { page: 1, perPage: 300 },
      sort: { field: "captured_at", order: "DESC" },
      filter: { workspace_id: workspaceId, company_id: company?.id },
    },
    { enabled },
  );
  const agentReports = useGetList<CompanyReport>(
    "company_reports",
    {
      pagination: { page: 1, perPage: 50 },
      sort: { field: "submitted_at", order: "DESC" },
      filter: {
        workspace_id: workspaceId,
        company_id: company?.id,
        is_current: true,
      },
    },
    { enabled },
  );
  const groupedFacts = useMemo(() => {
    const map = new Map<string, CompanyFieldFact[]>();
    for (const fact of facts.data ?? []) {
      map.set(fact.field_name, [...(map.get(fact.field_name) ?? []), fact]);
    }
    return [...map.entries()];
  }, [facts.data]);
  const reportJobs = useMemo(
    () =>
      jobs
        .filter((job) => reportCompanyId(job) === String(company?.id))
        .sort((a, b) =>
          String(b.requested_at ?? "").localeCompare(
            String(a.requested_at ?? ""),
          ),
        ),
    [company?.id, jobs],
  );
  const latestReport = reportJobs[0];
  const latestAgentReport = agentReports.data?.[0];
  const completedJobSignature = jobs
    .filter(
      (job) =>
        reportCompanyId(job) === String(company?.id) &&
        ["completed", "partial", "failed"].includes(job.status),
    )
    .map((job) => `${job.id}:${job.completed_at ?? job.status}`)
    .sort()
    .join("|");
  useEffect(() => {
    if (
      !enabled ||
      !completedJobSignature ||
      completedJobSignature === refreshedJobSignature.current
    )
      return;
    refreshedJobSignature.current = completedJobSignature;
    void Promise.all([facts.refetch(), evidence.refetch()]);
  }, [completedJobSignature, enabled, evidence, facts]);
  const qcc = sources.find(
    (source) =>
      source.provider === "qcc" &&
      ["ready", "degraded"].includes(source.status),
  );
  const ego = sources.find(
    (source) =>
      source.provider === "web_search" &&
      ["ready", "degraded"].includes(source.status),
  );

  const openLatestReport = () => {
    const evidenceJobId =
      latestAgentReport?.evidence_job_id || latestReport?.id;
    if (!evidenceJobId) return;
    onOpenChange(false);
    window.setTimeout(() => navigate(`/reports/${evidenceJobId}`), 0);
  };

  const verifyQcc = async () => {
    if (!company || !qcc) {
      notify("企查查当前不可用，请先完成配置。", { type: "warning" });
      return;
    }
    setQccConfirmOpen(false);
    setRunning("qcc");
    try {
      await runWorkbenchAction(
        "start_ingestion",
        workspaceId,
        {
          sourceConnectionId: qcc.id,
          queryKind: "company_detail",
          queryText: `核验 ${company.name} 工商登记信息`,
          listName,
          criteria: {
            searchKey: company.unified_social_credit_code || company.name,
          },
        },
        createIdempotencyKey("qcc-verify"),
      );
      notify("企查查核验已提交；完成后会保留来源差异。", { type: "info" });
      await onJobsChanged();
    } catch (error) {
      notify(getErrorMessage(error), { type: "error" });
    } finally {
      setRunning(null);
    }
  };

  const generateReport = async () => {
    if (!company || !ego) {
      notify("Ego Lite 公开信息报告能力当前不可用，请先完成配置检查。", {
        type: "warning",
      });
      return;
    }
    setRunning("report");
    try {
      await runWorkbenchAction(
        "start_ingestion",
        workspaceId,
        {
          sourceConnectionId: ego.id,
          queryKind: "web_evidence",
          queryText: `为 ${company.name} 生成公开信息报告`,
          criteria: {
            companyId: Number(company.id),
            claimType: "public_report",
            reportMode: true,
            maxResults: 6,
          },
        },
        createIdempotencyKey("ego-report"),
      );
      notify(
        "企业资料采集任务已提交。Ego Lite 完成后，请交给 WorkBuddy 或其他 Agent 分析。",
        { type: "info" },
      );
      await onJobsChanged();
    } catch (error) {
      notify(getErrorMessage(error), { type: "error" });
    } finally {
      setRunning(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[min(96vw,760px)] gap-0 overflow-y-auto border-l-black/5 bg-[#f5f5f7] p-0 sm:max-w-[760px]">
        <SheetHeader className="border-b border-black/[0.06] bg-white px-6 py-6 pr-14 sm:px-8">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#eef5ff] text-[#0969da]">
              <Buildings className="size-6" />
            </span>
            <div className="min-w-0">
              <SheetTitle className="text-xl leading-7 tracking-[-0.025em]">
                {company?.name ?? "企业详情"}
              </SheetTitle>
              <SheetDescription className="mt-1">
                {company?.unified_social_credit_code ??
                  "统一社会信用代码尚未获取"}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as typeof tab)}
          className="p-5 sm:p-7"
        >
          <TabsList className="grid h-11 w-full grid-cols-3 rounded-xl bg-black/[0.05] p-1">
            <TabsTrigger value="profile" className="rounded-lg">
              企业信息
            </TabsTrigger>
            <TabsTrigger value="sources" className="rounded-lg">
              来源与冲突
            </TabsTrigger>
            <TabsTrigger value="report" className="rounded-lg">
              企业报告
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-5 space-y-4">
            <section className="rounded-2xl border border-black/[0.06] bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">工商与经营概览</h3>
                <Badge variant="outline" className="rounded-full">
                  {operatingStatusLabel(company?.operating_status)}
                </Badge>
              </div>
              <dl className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2">
                <Detail
                  label="法定代表人"
                  value={company?.legal_representative}
                />
                <Detail label="注册资本" value={formatCapital(company)} />
                <Detail label="成立日期" value={company?.established_on} />
                <Detail
                  label="参保人数"
                  value={
                    company?.insured_employee_count == null
                      ? null
                      : `${company.insured_employee_count} 人`
                  }
                />
                <Detail label="行业" value={company?.industry_name} />
                <Detail label="地区" value={displayCompanyRegion(company)} />
                <div className="sm:col-span-2">
                  <Detail label="注册地址" value={company?.address} />
                </div>
                <Detail
                  label="联系电话"
                  value={company?.phone || company?.phone_number}
                />
                <Detail label="官网" value={company?.website} />
              </dl>
            </section>
            <Alert>
              <Info />
              <AlertTitle>字段缺失不等于不存在</AlertTitle>
              <AlertDescription>
                “—”仅表示当前数据源没有提供。企查查核验会新增来源事实，不会覆盖原始值。
              </AlertDescription>
            </Alert>
            <Button
              onClick={() => setQccConfirmOpen(true)}
              disabled={!qcc || running !== null}
              className="h-11 rounded-full bg-[#0969da] px-5"
            >
              {running === "qcc" ? (
                <SpinnerGap className="animate-spin" />
              ) : (
                <IdentificationCard />
              )}
              用企查查继续核验
            </Button>
          </TabsContent>

          <TabsContent value="sources" className="mt-5 space-y-4">
            {groupedFacts.length ? (
              groupedFacts.map(([field, values]) => {
                const uniqueValues = new Set(
                  values.map((fact) => displayFact(fact)),
                );
                const providerCount = new Set(
                  values.map((fact) => fact.source_provider),
                ).size;
                return (
                  <section
                    key={field}
                    className="rounded-2xl border border-black/[0.06] bg-white p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold">
                        {factLabels[field] ?? field}
                      </h3>
                      {uniqueValues.size > 1 ? (
                        <Badge className="border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-50">
                          来源不一致
                        </Badge>
                      ) : providerCount > 1 ? (
                        <Badge variant="outline">多源一致</Badge>
                      ) : (
                        <Badge variant="outline">单一来源</Badge>
                      )}
                    </div>
                    <div className="mt-3 space-y-2">
                      {values.slice(0, 8).map((fact) => (
                        <div
                          key={fact.id}
                          className="grid gap-1 rounded-xl bg-slate-50 px-3 py-2.5 sm:grid-cols-[130px_1fr_auto] sm:items-center"
                        >
                          <span className="text-xs font-medium text-slate-500">
                            {providerLabel(fact.source_provider)}
                          </span>
                          <span className="text-sm">{displayFact(fact)}</span>
                          <span className="text-[11px] text-slate-400">
                            {formatDateTime(fact.observed_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })
            ) : (
              <EmptyNotice
                title="还没有字段级来源记录"
                description="完成真实数据源查询后，这里会展示每个字段的来源、时间与差异。"
              />
            )}
            {(evidence.data ?? []).length ? (
              <section className="rounded-2xl border border-black/[0.06] bg-white p-4">
                <h3 className="text-sm font-semibold">证据记录</h3>
                <div className="mt-3 space-y-2">
                  {(evidence.data ?? []).slice(0, 10).map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-black/[0.05] p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        {item.source_url ? (
                          <a
                            href={item.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-medium text-[#0b5eb7] underline-offset-4 hover:underline"
                          >
                            {item.title}
                            <ArrowSquareOut className="ml-1 inline size-3.5" />
                          </a>
                        ) : (
                          <p className="text-sm font-medium">{item.title}</p>
                        )}
                        <span className="shrink-0 text-right text-[11px] text-slate-400">
                          {providerLabel(item.source_provider)}
                          <br />
                          {formatDateTime(item.captured_at)}
                        </span>
                      </div>
                      {item.excerpt ? (
                        <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-500">
                          {item.excerpt}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </TabsContent>

          <TabsContent value="report" className="mt-5 space-y-4">
            <section className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
              <div className="border-b border-black/[0.05] p-5">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-[#eef5ff] text-[#0969da]">
                    <FileHtml className="size-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">
                      Agent 企业调研报告
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Ego Lite 负责采集官网、招聘和新闻证据；WorkBuddy 或其他
                      Agent 负责理解、判断并回写统一格式的报告。
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-5">
                {latestReport || latestAgentReport ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
                      <div>
                        <p className="text-sm font-medium">最新报告</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDateTime(
                            latestAgentReport?.submitted_at ||
                              latestReport?.requested_at,
                          )}{" "}
                          ·{" "}
                          {latestAgentReport
                            ? `${latestAgentReport.agent_name} 已完成分析`
                            : ["completed", "partial"].includes(
                                  latestReport?.status ?? "",
                                )
                              ? "等待 Agent 分析"
                              : jobLabel(latestReport?.status)}
                        </p>
                      </div>
                      {latestAgentReport ||
                      latestReport?.status === "completed" ||
                      latestReport?.status === "partial" ? (
                        <Button
                          onClick={openLatestReport}
                          className="rounded-full"
                        >
                          <ArrowSquareOut />
                          打开报告
                        </Button>
                      ) : (
                        <Badge variant="outline">
                          {jobLabel(latestReport.status)}
                        </Badge>
                      )}
                    </div>
                    {latestReport?.status === "failed" ? (
                      <Alert variant="destructive">
                        <WarningCircle />
                        <AlertTitle>报告生成失败</AlertTitle>
                        <AlertDescription>
                          {latestReport?.error_message ||
                            latestReport?.error_code ||
                            "执行器未返回可公开错误详情"}
                        </AlertDescription>
                      </Alert>
                    ) : null}
                  </div>
                ) : (
                  <EmptyNotice
                    title="还没有企业报告"
                    description="从单家企业按需采集资料，再交给已连接的 Agent 分析，不会在前端静默调用大模型。"
                  />
                )}
                <Button
                  onClick={generateReport}
                  disabled={
                    !ego ||
                    running !== null ||
                    ["queued", "running"].includes(latestReport?.status ?? "")
                  }
                  className="mt-4 h-11 rounded-full bg-[#0969da] px-5"
                >
                  {running === "report" ? (
                    <SpinnerGap className="animate-spin" />
                  ) : (
                    <GlobeHemisphereWest />
                  )}
                  {latestReport ? "重新采集资料" : "采集报告资料"}
                </Button>
              </div>
            </section>
            <Alert className="border-amber-200 bg-amber-50/70">
              <WarningCircle />
              <AlertTitle>覆盖范围说明</AlertTitle>
              <AlertDescription>
                招聘站或新闻站如要求登录、出现验证码或禁止访问，系统会停止深入抓取并在报告中标注“覆盖不完整”，不会绕过限制。
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>
        <Dialog open={qccConfirmOpen} onOpenChange={setQccConfirmOpen}>
          <DialogContent className="rounded-[24px]">
            <DialogHeader>
              <DialogTitle>确认查询企查查</DialogTitle>
              <DialogDescription>
                将按“{company?.unified_social_credit_code || company?.name}”核验
                1 家企业的工商登记信息。
              </DialogDescription>
            </DialogHeader>
            <Alert className="border-amber-200 bg-amber-50/70">
              <IdentificationCard />
              <AlertTitle>本次预计调用 1 次</AlertTitle>
              <AlertDescription>
                查询可能消耗企查查积分。返回结果会作为独立来源保存，不直接覆盖获客助手原值。
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => setQccConfirmOpen(false)}
              >
                取消
              </Button>
              <Button className="rounded-full bg-[#0969da]" onClick={verifyQcc}>
                确认并开始核验
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1.5 break-words text-sm font-medium">{value || "—"}</dd>
    </div>
  );
}

function EmptyNotice({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-black/10 bg-white p-7 text-center">
      <CheckCircle className="mx-auto size-7 text-slate-300" />
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function formatCapital(company: Company | null) {
  return formatCapitalWan(
    company?.registered_capital_amount,
    company?.registered_capital_currency ?? "CNY",
  );
}

function reportCompanyId(job: IngestionJob) {
  const criteria = job.input_params?.criteria;
  if (criteria && typeof criteria === "object" && "companyId" in criteria) {
    return String((criteria as Record<string, unknown>).companyId);
  }
  const result = job.result;
  if (result && "company_id" in result && result.company_id != null) {
    return String(result.company_id);
  }
  return null;
}

function jobLabel(status: string) {
  return (
    (
      {
        queued: "排队中",
        running: "检索中",
        completed: "已完成",
        partial: "部分完成",
        failed: "失败",
      } as Record<string, string>
    )[status] ?? status
  );
}
