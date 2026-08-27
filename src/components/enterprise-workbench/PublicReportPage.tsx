import { useMemo, useRef } from "react";
import DOMPurify from "dompurify";
import {
  ArrowClockwise,
  ArrowLeft,
  Copy,
  DownloadSimple,
  FileHtml,
  Printer,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import { useGetList, useGetOne, useNotify } from "ra-core";
import { Link, useParams } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  renderAgentCompanyReport,
  type CompanyAgentAnalysis,
  type ReportEvidence,
} from "../../../supabase/functions/mcp/report.ts";
import type {
  Company,
  CompanyReport,
  IngestionJob,
  SourceSnapshot,
} from "./types";
import { formatDateTime, getErrorMessage } from "./utils";
import { useWorkspace } from "./workspace";

export function PublicReportPage() {
  const reportFrame = useRef<HTMLIFrameElement>(null);
  const { jobId = "" } = useParams();
  const { workspace } = useWorkspace();
  const notify = useNotify();
  const job = useGetOne<IngestionJob>(
    "ingestion_jobs",
    { id: jobId },
    {
      enabled: Boolean(jobId),
      refetchInterval: (query) =>
        ["queued", "running"].includes(query.state.data?.status ?? "")
          ? 1_500
          : false,
    },
  );
  const reports = useGetList<CompanyReport>(
    "company_reports",
    {
      pagination: { page: 1, perPage: 10 },
      sort: { field: "submitted_at", order: "DESC" },
      filter: {
        workspace_id: workspace?.id,
        evidence_job_id: jobId,
        is_current: true,
      },
    },
    { enabled: Boolean(workspace?.id && jobId) },
  );
  const reportRecord = reports.data?.[0];
  const company = useGetOne<Company>(
    "companies",
    { id: reportRecord?.company_id ? String(reportRecord.company_id) : "" },
    { enabled: Boolean(reportRecord?.company_id) },
  );
  const snapshot = useGetOne<SourceSnapshot>(
    "source_snapshots",
    { id: reportRecord?.source_snapshot_id ?? "" },
    { enabled: Boolean(reportRecord?.source_snapshot_id) },
  );
  const html = useMemo(() => {
    if (!reportRecord || !company.data || !snapshot.data) return "";
    return renderAgentCompanyReport({
      reportId: reportRecord.id,
      revision: reportRecord.revision,
      submittedAt:
        reportRecord.submitted_at ||
        reportRecord.created_at ||
        new Date().toISOString(),
      agentName: reportRecord.agent_name,
      company: company.data as unknown as Record<string, unknown>,
      evidence: reportEvidence(snapshot.data.normalized_payload),
      analysis: reportRecord.analysis as unknown as CompanyAgentAnalysis,
    });
  }, [company.data, reportRecord, snapshot.data]);
  const safeHtml = useMemo(
    () =>
      html
        ? DOMPurify.sanitize(html, {
            WHOLE_DOCUMENT: true,
            ADD_TAGS: ["meta"],
            ADD_ATTR: ["target", "rel"],
          })
        : "",
    [html],
  );
  const collection =
    job.data?.result?.report && typeof job.data.result.report === "object"
      ? (job.data.result.report as Record<string, unknown>)
      : null;
  const companyName =
    company.data?.name ||
    (typeof collection?.companyName === "string"
      ? collection.companyName
      : "企业调研报告");

  const download = () => {
    if (!safeHtml) return;
    const url = URL.createObjectURL(
      new Blob([safeHtml], { type: "text/html;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${companyName.replace(/[\\/:*?"<>|]/g, "-")}-企业调研报告.html`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  if (job.error || reports.error) {
    return (
      <Alert variant="destructive">
        <WarningCircle />
        <AlertTitle>无法读取报告任务</AlertTitle>
        <AlertDescription>
          {getErrorMessage(job.error || reports.error)}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button
            asChild
            variant="ghost"
            className="-ml-3 rounded-full text-slate-500"
          >
            <Link to="/lists">
              <ArrowLeft />
              返回我的名单
            </Link>
          </Button>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
              {companyName}
            </h1>
            <Badge variant="outline" className="rounded-full bg-white">
              {reportRecord ? "报告已完成" : statusLabel(job.data?.status)}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {reportRecord
              ? `由 ${reportRecord.agent_name} 整理 · ${formatDateTime(reportRecord.submitted_at)}`
              : formatDateTime(
                  job.data?.completed_at || job.data?.requested_at,
                )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="rounded-xl bg-white"
            onClick={() => Promise.all([job.refetch(), reports.refetch()])}
          >
            <ArrowClockwise />
            刷新状态
          </Button>
          <Button
            variant="outline"
            className="rounded-xl bg-white"
            onClick={() => reportFrame.current?.contentWindow?.print()}
            disabled={!safeHtml}
          >
            <Printer />
            打印
          </Button>
          <Button
            className="rounded-xl bg-[#0969da]"
            onClick={download}
            disabled={!safeHtml}
          >
            <DownloadSimple />
            下载 HTML
          </Button>
        </div>
      </div>

      {["queued", "running"].includes(job.data?.status ?? "") ? (
        <section className="grid min-h-[520px] place-items-center rounded-[28px] border border-black/[0.06] bg-white p-8 text-center">
          <div>
            <SpinnerGap className="mx-auto size-9 animate-spin text-[#0969da]" />
            <h2 className="mt-5 text-lg font-semibold">正在采集企业资料</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
              Ego Lite
              正在检索官网、招聘与公开新闻。采集过程不调用大模型；完成后可交给
              WorkBuddy 或其他智能助手整理。
            </p>
          </div>
        </section>
      ) : job.data?.status === "failed" ? (
        <Alert variant="destructive">
          <WarningCircle />
          <AlertTitle>资料采集失败</AlertTitle>
          <AlertDescription>
            {job.data.error_message ||
              job.data.error_code ||
              "未获得可公开的错误详情"}
          </AlertDescription>
        </Alert>
      ) : safeHtml ? (
        <section className="overflow-hidden rounded-[24px] border border-black/[0.07] bg-white shadow-[0_16px_50px_rgba(0,0,0,0.06)]">
          <iframe
            ref={reportFrame}
            title={`${companyName}企业调研报告`}
            srcDoc={safeHtml}
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            className="h-[calc(100vh-190px)] min-h-[760px] w-full border-0"
          />
        </section>
      ) : (
        <section className="grid min-h-[480px] place-items-center rounded-[28px] border border-dashed border-black/10 bg-white p-8 text-center">
          <div>
            <FileHtml className="mx-auto size-9 text-slate-300" />
            <h2 className="mt-4 text-lg font-semibold">
              资料已采集，可开始智能分析
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
              在已连接本工作台的 WorkBuddy
              或其他智能助手中粘贴下方请求即可。分析使用该工具的模型能力；本工作台不会自动消耗模型额度。
            </p>
            <Button
              className="mt-5 rounded-full"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(
                  `请读取企业名单工作台中「${companyName}」最新采集的公开资料，整理成企业调研报告并保存回工作台。`,
                );
                notify("分析请求已复制。", { type: "success" });
              }}
            >
              <Copy />
              复制分析请求
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function reportEvidence(payload: Record<string, unknown>): ReportEvidence[] {
  const value = payload.evidence;
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    if (typeof item.title !== "string" || typeof item.url !== "string") {
      return [];
    }
    return [
      {
        id:
          typeof item.id === "string"
            ? item.id
            : `ev-${String(index + 1).padStart(3, "0")}`,
        title: item.title,
        url: item.url,
        sourceName:
          typeof item.sourceName === "string" ? item.sourceName : "公开网页",
        kind: typeof item.kind === "string" ? item.kind : "other",
        publishedAt:
          typeof item.publishedAt === "string" ? item.publishedAt : null,
        capturedAt:
          typeof item.retrievedAt === "string" ? item.retrievedAt : null,
      },
    ];
  });
}

function statusLabel(status?: string) {
  return (
    (
      {
        queued: "排队中",
        running: "采集中",
        completed: "待智能分析",
        partial: "待智能分析",
        failed: "失败",
      } as Record<string, string>
    )[status ?? ""] ?? "读取中"
  );
}
