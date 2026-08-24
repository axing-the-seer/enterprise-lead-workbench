// Supabase Edge uses version-pinned URL imports for its runtime-only modules.
// deno-lint-ignore-file no-import-prefix no-unversioned-import
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { McpServer } from "npm:@modelcontextprotocol/sdk@1.30.0/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "npm:@modelcontextprotocol/sdk@1.30.0/server/webStandardStreamableHttp.js";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";
import {
  createClient,
  type SupabaseClient,
} from "jsr:@supabase/supabase-js@2.112.3";
import type { z } from "zod";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveWorkbenchPublicOrigin } from "./public-origin.ts";
import {
  renderAgentCompanyReport,
  type CompanyAgentAnalysis,
  type ReportEvidence,
} from "./report.ts";
import {
  getCompanyReportContextInputSchema,
  getCompanyEvidenceAndFactsInputSchema,
  listCompaniesInputSchema,
  listCompanyListsInputSchema,
  listCompanyReportsInputSchema,
  listExportsInputSchema,
  listIngestionJobsInputSchema,
  listRuleResultsInputSchema,
  listRuleRunsInputSchema,
  listRuleSetsInputSchema,
  listRuleSetVersionsInputSchema,
  listSourceConnectionsInputSchema,
  listSourceQueriesInputSchema,
  listWorkspacesInputSchema,
  parseSavedRuleTemplateMcpResult,
  READ_PROJECTIONS,
  readCompanyReportEvidenceInputSchema,
  runRulesetInputSchema,
  saveRuleTemplateInputSchema,
  sanitizeMcpOutput,
  startExportInputSchema,
  startIngestionQueryMcpInputSchema,
  submitCompanyReportAnalysisInputSchema,
  toEnqueueWorkbenchRpc,
  toSaveRuleTemplateMcpRpc,
  type WorkbenchMcpQueuedWriteToolName,
} from "./contracts.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_PUBLISHABLE_KEY =
  Deno.env.get("SB_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_JWT_ISSUER =
  Deno.env.get("SB_JWT_ISSUER") ?? `${SUPABASE_URL}/auth/v1`;
const SUPABASE_JWT_AUDIENCE =
  Deno.env.get("SB_JWT_AUDIENCE") ?? "authenticated";

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is required");
if (!SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("SB_PUBLISHABLE_KEY is required");
}
const WORKBENCH_PUBLIC_ORIGIN = resolveWorkbenchPublicOrigin(
  Deno.env.get("WORKBENCH_PUBLIC_ORIGIN"),
  SUPABASE_URL,
);

const JWKS = createRemoteJWKSet(
  new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
);

interface AuthInfo {
  token: string;
  userId: string;
}

interface DataError {
  code?: string;
}

function getResourceMetadataUrl(): string {
  return `${WORKBENCH_PUBLIC_ORIGIN}/functions/v1/mcp/oauth-protected-resource`;
}

async function validateToken(req: Request): Promise<AuthInfo | null> {
  const authorization = req.headers.get("authorization") ?? "";
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match) return null;

  try {
    const { payload } = await jwtVerify(match[1], JWKS, {
      issuer: SUPABASE_JWT_ISSUER,
      audience: SUPABASE_JWT_AUDIENCE,
    });
    if (!payload.sub) return null;
    if (payload.role !== "authenticated") return null;
    return { token: match[1], userId: payload.sub };
  } catch {
    return null;
  }
}

function createUserClient(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function success(payload: Record<string, unknown>) {
  const safePayload = sanitizeMcpOutput(payload) as Record<string, unknown>;
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(safePayload, null, 2),
      },
    ],
    structuredContent: safePayload,
  };
}

function failure(operation: string, error: DataError | null) {
  const code =
    typeof error?.code === "string" && /^[A-Za-z0-9_.-]{1,32}$/.test(error.code)
      ? error.code
      : "DATA_ACCESS_FAILED";
  console.error("Workbench MCP operation failed", { operation, code });
  return {
    content: [
      {
        type: "text" as const,
        text: `操作失败（${code}）。请检查工作空间权限和记录状态。`,
      },
    ],
    isError: true,
  };
}

function toolFailure(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

async function loadReportContext(
  client: SupabaseClient,
  workspaceId: string,
  evidenceJobId: string,
) {
  const { data: job, error: jobError } = await client
    .from("ingestion_jobs")
    .select(READ_PROJECTIONS.ingestionJobs)
    .eq("workspace_id", workspaceId)
    .eq("id", evidenceJobId)
    .single();
  if (jobError || !job) return { error: jobError ?? { code: "P0002" } };
  const result = objectRecord(job.result);
  const companyId = String(result.company_id ?? "");
  const snapshotId = String(result.source_snapshot_id ?? "");
  if (!/^[1-9][0-9]*$/.test(companyId) || !isUuid(snapshotId)) {
    return { error: { code: "REPORT_EVIDENCE_INCOMPLETE" } };
  }
  const [companyResult, snapshotResult, factsResult] = await Promise.all([
    client
      .from("companies")
      .select(READ_PROJECTIONS.companies)
      .eq("workspace_id", workspaceId)
      .eq("id", companyId)
      .single(),
    client
      .from("source_snapshots")
      .select("id,workspace_id,company_id,normalized_payload,captured_at")
      .eq("workspace_id", workspaceId)
      .eq("id", snapshotId)
      .single(),
    client
      .from("company_field_facts")
      .select(READ_PROJECTIONS.companyFacts)
      .eq("workspace_id", workspaceId)
      .eq("company_id", companyId)
      .eq("is_current", true)
      .order("observed_at", { ascending: false })
      .limit(200),
  ]);
  if (companyResult.error || !companyResult.data) {
    return { error: companyResult.error ?? { code: "P0002" } };
  }
  if (snapshotResult.error || !snapshotResult.data) {
    return { error: snapshotResult.error ?? { code: "P0002" } };
  }
  if (factsResult.error) return { error: factsResult.error };
  const normalized = objectRecord(snapshotResult.data.normalized_payload);
  const evidence = normalizeEvidence(normalized.evidence);
  return {
    job,
    company: companyResult.data,
    facts: factsResult.data ?? [],
    normalized,
    evidence,
  };
}

function normalizeEvidence(
  value: unknown,
): Array<ReportEvidence & Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((entry, index) => {
    const item = objectRecord(entry);
    const url = typeof item.url === "string" ? item.url : "";
    const title = typeof item.title === "string" ? item.title : "";
    if (!/^https?:\/\//i.test(url) || !title) return [];
    return [
      {
        ...item,
        id:
          typeof item.id === "string" && /^ev-[0-9]{3}$/.test(item.id)
            ? item.id
            : `ev-${String(index + 1).padStart(3, "0")}`,
        title,
        url,
        sourceName:
          typeof item.sourceName === "string" ? item.sourceName : "公开网页",
        kind: typeof item.kind === "string" ? item.kind : "other",
        publishedAt:
          typeof item.publishedAt === "string" ? item.publishedAt : null,
        capturedAt:
          typeof normalizedDate(item.retrievedAt) === "string"
            ? normalizedDate(item.retrievedAt)
            : null,
      },
    ];
  });
}

function evidenceIndex(item: ReportEvidence & Record<string, unknown>) {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    sourceName: item.sourceName,
    url: item.url,
    relevance: item.relevance ?? "broad_context",
    publishedAt: item.publishedAt ?? null,
    capturedAt: item.capturedAt ?? null,
  };
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizedDate(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function analysisEvidenceIds(analysis: CompanyAgentAnalysis) {
  const values = [...analysis.executiveEvidenceIds];
  for (const section of [
    analysis.businessProfile,
    analysis.growthSignals,
    analysis.recentEvents,
    analysis.opportunities,
    analysis.risks,
    analysis.recommendedActions,
  ]) {
    for (const item of section) values.push(...item.evidenceIds);
  }
  return [...new Set(values)];
}

function literalSubstringPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

async function enqueue(
  client: SupabaseClient,
  toolName: WorkbenchMcpQueuedWriteToolName,
  input: unknown,
) {
  const request = toEnqueueWorkbenchRpc(toolName, input);
  const { data, error } = await client.rpc("enqueue_workbench_job", request);
  if (error) return failure(toolName, error);
  const row = Array.isArray(data) ? data[0] : data;
  return success({
    jobId: row?.job_id ?? null,
    jobType: row?.job_type ?? null,
    status: row?.status ?? "queued",
  });
}

function createMcpServer(authInfo: AuthInfo): McpServer {
  const server = new McpServer({
    name: "enterprise-lead-workbench",
    version: "1.0.0",
  });
  const client = createUserClient(authInfo.token);

  server.registerTool(
    "list_workspaces",
    {
      title: "列出工作空间",
      description: "列出当前用户有权访问的企业名单工作空间。",
      inputSchema: listWorkspacesInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (_args: z.infer<typeof listWorkspacesInputSchema>) => {
      const { data, error } = await client
        .from("workspaces")
        .select(READ_PROJECTIONS.workspaces)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) return failure("list_workspaces", error);
      return success({ items: data ?? [], count: data?.length ?? 0 });
    },
  );

  server.registerTool(
    "list_source_connections",
    {
      title: "列出数据源连接",
      description:
        "列出工作空间的数据源连接状态和能力；不返回凭证引用或连接秘密。",
      inputSchema: listSourceConnectionsInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args: z.infer<typeof listSourceConnectionsInputSchema>) => {
      let query = client
        .from("source_connections_safe")
        .select(READ_PROJECTIONS.sourceConnections)
        .eq("workspace_id", args.workspaceId)
        .order("updated_at", { ascending: false })
        .limit(args.limit);
      if (args.provider) query = query.eq("provider", args.provider);
      if (args.status) query = query.eq("status", args.status);
      const { data, error } = await query;
      if (error) return failure("list_source_connections", error);
      return success({ items: data ?? [], count: data?.length ?? 0 });
    },
  );

  server.registerTool(
    "list_source_queries",
    {
      title: "列出来源查询",
      description: "列出已保存的数据源查询条件与执行状态。",
      inputSchema: listSourceQueriesInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args: z.infer<typeof listSourceQueriesInputSchema>) => {
      let query = client
        .from("source_queries")
        .select(READ_PROJECTIONS.sourceQueries)
        .eq("workspace_id", args.workspaceId)
        .order("created_at", { ascending: false })
        .limit(args.limit);
      if (args.sourceConnectionId) {
        query = query.eq("source_connection_id", args.sourceConnectionId);
      }
      if (args.status) query = query.eq("status", args.status);
      const { data, error } = await query;
      if (error) return failure("list_source_queries", error);
      return success({ items: data ?? [], count: data?.length ?? 0 });
    },
  );

  server.registerTool(
    "list_ingestion_jobs",
    {
      title: "列出数据处理任务",
      description:
        "查看查询、导入、核验和 Ego Lite 公开信息报告任务状态。返回安全化任务参数和报告元数据，但不返回供应商原始数据或 HTML 正文。",
      inputSchema: listIngestionJobsInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args: z.infer<typeof listIngestionJobsInputSchema>) => {
      let query = client
        .from("ingestion_jobs")
        .select(READ_PROJECTIONS.ingestionJobs)
        .eq("workspace_id", args.workspaceId)
        .order("requested_at", { ascending: false })
        .limit(args.limit);
      if (args.status) query = query.eq("status", args.status);
      if (args.jobKind) query = query.eq("job_kind", args.jobKind);
      const { data, error } = await query;
      if (error) return failure("list_ingestion_jobs", error);
      const items = (data ?? []).map((job) => {
        if (
          !job.result ||
          typeof job.result !== "object" ||
          Array.isArray(job.result)
        ) {
          return job;
        }
        const { report_html: reportHtml, ...safeResult } = job.result as Record<
          string,
          unknown
        >;
        return {
          ...job,
          result: {
            ...safeResult,
            reportAvailable: typeof reportHtml === "string",
          },
        };
      });
      return success({ items, count: items.length });
    },
  );

  server.registerTool(
    "list_company_lists",
    {
      title: "列出企业名单",
      description: "列出工作空间内的企业名单批次。",
      inputSchema: listCompanyListsInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args: z.infer<typeof listCompanyListsInputSchema>) => {
      let query = client
        .from("company_lists")
        .select(READ_PROJECTIONS.companyLists)
        .eq("workspace_id", args.workspaceId)
        .order("updated_at", { ascending: false })
        .limit(args.limit);
      if (args.status) query = query.eq("status", args.status);
      const { data, error } = await query;
      if (error) return failure("list_company_lists", error);
      return success({ items: data ?? [], count: data?.length ?? 0 });
    },
  );

  server.registerTool(
    "list_companies",
    {
      title: "检索企业",
      description: "按工作空间检索规范化企业，可限定企业名单和企业名称。",
      inputSchema: listCompaniesInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args: z.infer<typeof listCompaniesInputSchema>) => {
      if (args.companyListId) {
        let query = client
          .from("company_list_members")
          .select(
            `membership_status,company:companies!company_list_members_company_fkey(${READ_PROJECTIONS.companies})`,
          )
          .eq("workspace_id", args.workspaceId)
          .eq("company_list_id", args.companyListId)
          .order("added_at", { ascending: false })
          .limit(args.limit);
        if (args.name) {
          query = query.ilike(
            "company.name",
            literalSubstringPattern(args.name),
          );
        }
        const { data, error } = await query;
        if (error) return failure("list_companies", error);
        const items = (data ?? []).map((row) => ({
          ...(row.company && typeof row.company === "object"
            ? row.company
            : {}),
          membershipStatus: row.membership_status,
        }));
        return success({ items, count: items.length });
      }

      let query = client
        .from("companies")
        .select(READ_PROJECTIONS.companies)
        .eq("workspace_id", args.workspaceId)
        .order("updated_at", { ascending: false })
        .limit(args.limit);
      if (args.name) {
        query = query.ilike("name", literalSubstringPattern(args.name));
      }
      const { data, error } = await query;
      if (error) return failure("list_companies", error);
      return success({ items: data ?? [], count: data?.length ?? 0 });
    },
  );

  server.registerTool(
    "get_company_evidence_and_facts",
    {
      title: "获取企业证据和字段事实",
      description: "返回企业的规范化字段事实与证据摘要；不返回供应商原始快照。",
      inputSchema: getCompanyEvidenceAndFactsInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args: z.infer<typeof getCompanyEvidenceAndFactsInputSchema>) => {
      let factsQuery = client
        .from("company_field_facts")
        .select(READ_PROJECTIONS.companyFacts)
        .eq("workspace_id", args.workspaceId)
        .eq("company_id", args.companyId)
        .order("observed_at", { ascending: false })
        .limit(args.factLimit);
      if (args.currentFactsOnly) factsQuery = factsQuery.eq("is_current", true);

      const [evidenceResult, factResult] = await Promise.all([
        client
          .from("company_evidence")
          .select(READ_PROJECTIONS.companyEvidence)
          .eq("workspace_id", args.workspaceId)
          .eq("company_id", args.companyId)
          .order("observed_at", { ascending: false })
          .limit(args.evidenceLimit),
        factsQuery,
      ]);
      if (evidenceResult.error) {
        return failure("get_company_evidence_and_facts", evidenceResult.error);
      }
      if (factResult.error) {
        return failure("get_company_evidence_and_facts", factResult.error);
      }
      return success({
        companyId: args.companyId,
        evidence: evidenceResult.data ?? [],
        facts: factResult.data ?? [],
      });
    },
  );

  server.registerTool(
    "get_company_report_context",
    {
      title: "获取企业报告分析上下文",
      description:
        "读取已完成的 Ego Lite 证据任务，返回企业工商概况、字段事实和精简证据目录。先读目录，再按需调用 read_company_report_evidence，避免一次性消耗过多上下文。",
      inputSchema: getCompanyReportContextInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args: z.infer<typeof getCompanyReportContextInputSchema>) => {
      const context = await loadReportContext(
        client,
        args.workspaceId,
        args.evidenceJobId,
      );
      if ("error" in context) {
        return failure(
          "get_company_report_context",
          context.error ?? { code: "DATA_ACCESS_FAILED" },
        );
      }
      return success({
        evidenceJob: {
          id: context.job.id,
          status: context.job.status,
          completedAt: context.job.completed_at,
          coverage: context.normalized.coverage ?? [],
        },
        company: context.company,
        facts: context.facts,
        evidenceIndex: context.evidence.map(evidenceIndex),
        evidenceCount: context.evidence.length,
        nextStep:
          "选择与判断相关的证据编号，通过 read_company_report_evidence 分批读取；完成分析后调用 submit_company_report_analysis。",
      });
    },
  );

  server.registerTool(
    "read_company_report_evidence",
    {
      title: "读取企业报告证据正文",
      description:
        "按证据编号读取 Ego Lite 保存的摘要或正文。一次最多 10 条，只读取形成当前判断所需的材料。",
      inputSchema: readCompanyReportEvidenceInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args: z.infer<typeof readCompanyReportEvidenceInputSchema>) => {
      const context = await loadReportContext(
        client,
        args.workspaceId,
        args.evidenceJobId,
      );
      if ("error" in context) {
        return failure(
          "read_company_report_evidence",
          context.error ?? { code: "DATA_ACCESS_FAILED" },
        );
      }
      const requested = new Set(args.evidenceIds);
      const items = context.evidence.filter((item) => requested.has(item.id));
      if (items.length !== requested.size) {
        return toolFailure(
          "部分证据编号不存在或不属于该报告任务，请重新读取证据目录。",
        );
      }
      return success({
        evidenceJobId: args.evidenceJobId,
        items: items.map((item) => ({
          ...evidenceIndex(item),
          snippet: item.snippet ?? item.excerpt ?? "",
          content: item.content ?? "",
          query: item.query ?? "",
          linkKind: item.linkKind ?? "direct",
        })),
      });
    },
  );

  server.registerTool(
    "list_company_reports",
    {
      title: "列出 Agent 企业报告",
      description:
        "列出已经由 WorkBuddy、Codex 或其他 Agent 完成分析并回写的企业报告。",
      inputSchema: listCompanyReportsInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args: z.infer<typeof listCompanyReportsInputSchema>) => {
      let query = client
        .from("company_reports")
        .select(READ_PROJECTIONS.companyReports)
        .eq("workspace_id", args.workspaceId)
        .order("submitted_at", { ascending: false })
        .limit(args.limit);
      if (args.companyId) query = query.eq("company_id", args.companyId);
      if (args.evidenceJobId)
        query = query.eq("evidence_job_id", args.evidenceJobId);
      if (args.currentOnly) query = query.eq("is_current", true);
      const { data, error } = await query;
      if (error) return failure("list_company_reports", error);
      return success({ items: data ?? [], count: data?.length ?? 0 });
    },
  );

  server.registerTool(
    "submit_company_report_analysis",
    {
      title: "提交企业报告分析",
      description:
        "把 Agent 基于 Ego Lite 证据形成的紧凑结构化分析回写工作台，并生成统一品牌 HTML。所有结论必须通过 evidenceIds 引用该任务中的证据；客户可见文字必须是自然中文，不得包含 ev-NNN、内部字段名或枚举值。分析 JSON 建议不超过 8 KiB，每个分区只保留 2–4 条最有价值的判断。",
      inputSchema: submitCompanyReportAnalysisInputSchema,
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async (args: z.infer<typeof submitCompanyReportAnalysisInputSchema>) => {
      const context = await loadReportContext(
        client,
        args.workspaceId,
        args.evidenceJobId,
      );
      if ("error" in context) {
        return failure(
          "submit_company_report_analysis",
          context.error ?? { code: "DATA_ACCESS_FAILED" },
        );
      }
      const availableEvidence = new Set(
        context.evidence.map((item) => item.id),
      );
      const citedEvidence = analysisEvidenceIds(args.analysis);
      const missingEvidence = citedEvidence.filter(
        (id) => !availableEvidence.has(id),
      );
      if (missingEvidence.length) {
        return toolFailure(
          `分析引用了不属于当前任务的证据：${missingEvidence.join("、")}`,
        );
      }
      const { data, error } = await client.rpc(
        "submit_company_report_analysis",
        {
          p_workspace_id: args.workspaceId,
          p_evidence_job_id: args.evidenceJobId,
          p_agent_provider: args.agentProvider,
          p_agent_name: args.agentName,
          p_analysis: args.analysis,
        },
      );
      if (error) return failure("submit_company_report_analysis", error);
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.report_id) return toolFailure("报告服务没有返回报告标识。");
      const submittedAt = String(row.submitted_at ?? new Date().toISOString());
      const reportHtml = renderAgentCompanyReport({
        reportId: String(row.report_id),
        revision: Number(row.revision) || 1,
        submittedAt,
        agentName: args.agentName,
        company: context.company,
        evidence: context.evidence,
        analysis: args.analysis as CompanyAgentAnalysis,
      });
      const companyName = String(context.company.name ?? "企业").replace(
        /[\\/:*?"<>|]/g,
        "-",
      );
      return success({
        reportId: row.report_id,
        companyId: row.company_id,
        evidenceJobId: args.evidenceJobId,
        revision: row.revision,
        submittedAt,
        reportFileName: `${companyName}-企业调研报告.html`,
        reportHtml,
        deliveryInstruction:
          "将 reportHtml 保存为 reportFileName，再使用当前 Agent 已有的通讯工具发送；工作台不保存飞书或微信凭证，也不会自动发送。",
      });
    },
  );

  server.registerTool(
    "list_rule_sets",
    {
      title: "列出规则集",
      description: "列出工作空间已配置的规则集。",
      inputSchema: listRuleSetsInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args: z.infer<typeof listRuleSetsInputSchema>) => {
      let query = client
        .from("rule_sets")
        .select(READ_PROJECTIONS.ruleSets)
        .eq("workspace_id", args.workspaceId)
        .order("updated_at", { ascending: false })
        .limit(args.limit);
      if (args.status) query = query.eq("status", args.status);
      const { data, error } = await query;
      if (error) return failure("list_rule_sets", error);
      return success({ items: data ?? [], count: data?.length ?? 0 });
    },
  );

  server.registerTool(
    "list_rule_set_versions",
    {
      title: "列出规则版本",
      description:
        "列出某规则集的版本及可审计 JSON 定义；本工具不创建或发布规则。",
      inputSchema: listRuleSetVersionsInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args: z.infer<typeof listRuleSetVersionsInputSchema>) => {
      let query = client
        .from("rule_set_versions")
        .select(READ_PROJECTIONS.ruleSetVersions)
        .eq("workspace_id", args.workspaceId)
        .eq("rule_set_id", args.ruleSetId)
        .order("version_number", { ascending: false })
        .limit(args.limit);
      if (args.status) query = query.eq("status", args.status);
      const { data, error } = await query;
      if (error) return failure("list_rule_set_versions", error);
      return success({ items: data ?? [], count: data?.length ?? 0 });
    },
  );

  server.registerTool(
    "list_rule_runs",
    {
      title: "列出规则运行",
      description: "列出规则运行状态、输入清单摘要和结果计数。",
      inputSchema: listRuleRunsInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args: z.infer<typeof listRuleRunsInputSchema>) => {
      let query = client
        .from("rule_runs")
        .select(READ_PROJECTIONS.ruleRuns)
        .eq("workspace_id", args.workspaceId)
        .order("requested_at", { ascending: false })
        .limit(args.limit);
      if (args.companyListId) {
        query = query.eq("company_list_id", args.companyListId);
      }
      if (args.ruleVersionId) {
        query = query.eq("rule_version_id", args.ruleVersionId);
      }
      if (args.status) query = query.eq("status", args.status);
      const { data, error } = await query;
      if (error) return failure("list_rule_runs", error);
      return success({ items: data ?? [], count: data?.length ?? 0 });
    },
  );

  server.registerTool(
    "list_rule_results",
    {
      title: "列出规则结果",
      description: "列出指定规则运行的企业决策、命中规则、缺失字段和评估轨迹。",
      inputSchema: listRuleResultsInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args: z.infer<typeof listRuleResultsInputSchema>) => {
      let query = client
        .from("rule_results")
        .select(READ_PROJECTIONS.ruleResults)
        .eq("workspace_id", args.workspaceId)
        .eq("rule_run_id", args.ruleRunId)
        .order("evaluated_at", { ascending: false })
        .limit(args.limit);
      if (args.decision) query = query.eq("decision", args.decision);
      const { data, error } = await query;
      if (error) return failure("list_rule_results", error);
      return success({ items: data ?? [], count: data?.length ?? 0 });
    },
  );

  server.registerTool(
    "list_exports",
    {
      title: "列出导出任务",
      description: "列出已提交的导出、生成状态和私有存储路径。",
      inputSchema: listExportsInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args: z.infer<typeof listExportsInputSchema>) => {
      let query = client
        .from("exports")
        .select(READ_PROJECTIONS.exports)
        .eq("workspace_id", args.workspaceId)
        .order("requested_at", { ascending: false })
        .limit(args.limit);
      if (args.status) query = query.eq("status", args.status);
      const { data, error } = await query;
      if (error) return failure("list_exports", error);
      return success({ items: data ?? [], count: data?.length ?? 0 });
    },
  );

  server.registerTool(
    "start_ingestion_query",
    {
      title: "提交企业数据查询",
      description:
        "向已配置的企查查、获客助手或 Ego Lite 提交可审计任务。Ego Lite 公开报告必须绑定已存在企业，使用 web_evidence + public_report，不能作为名单来源。",
      inputSchema: startIngestionQueryMcpInputSchema,
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async (args: z.infer<typeof startIngestionQueryMcpInputSchema>) =>
      await enqueue(client, "start_ingestion_query", args),
  );

  server.registerTool(
    "save_rule_template",
    {
      title: "创建或发布规则模板",
      description:
        "使用与 Web UI 一致的 RuleTemplate v1 合同，原子创建规则集或发布不可变新版本。新建时省略 ruleSetId，追加版本时传现有规则集 UUID；条件组最多 5 层、全树最多 200 个条件。规则不得携带任何凭证，完全相同的重试复用已发布版本。需要工作空间编辑权限。",
      inputSchema: saveRuleTemplateInputSchema,
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async (args: z.infer<typeof saveRuleTemplateInputSchema>) => {
      const { data, error } = await client.rpc(
        "save_rule_template",
        toSaveRuleTemplateMcpRpc(args),
      );
      if (error) return failure("save_rule_template", error);
      const saved = parseSavedRuleTemplateMcpResult(data);
      if (!saved) {
        return failure("save_rule_template", { code: "INVALID_RESPONSE" });
      }
      return success({ ...saved });
    },
  );

  server.registerTool(
    "run_ruleset",
    {
      title: "运行已发布规则",
      description:
        "对企业名单运行已发布的规则版本。可先用 save_rule_template 或 Web UI 发布版本。",
      inputSchema: runRulesetInputSchema,
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async (args: z.infer<typeof runRulesetInputSchema>) =>
      await enqueue(client, "run_ruleset", args),
  );

  server.registerTool(
    "start_export",
    {
      title: "提交正式导出",
      description: "从企业名单或规则运行提交后端导出，仅允许明确白名单字段。",
      inputSchema: startExportInputSchema,
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async (args: z.infer<typeof startExportInputSchema>) =>
      await enqueue(client, "start_export", args),
  );

  return server;
}

function handleProtectedResourceMetadata(_req: Request): Response {
  const baseUrl = WORKBENCH_PUBLIC_ORIGIN;
  return new Response(
    JSON.stringify({
      resource: `${baseUrl}/functions/v1/mcp`,
      authorization_servers: [`${baseUrl}/auth/v1`],
      bearer_methods_supported: ["header"],
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

async function handleMcpRequest(req: Request): Promise<Response> {
  const authInfo = await validateToken(req);
  if (!authInfo) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${getResourceMetadataUrl()}"`,
      },
    });
  }

  const server = createMcpServer(authInfo);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  transport.onclose = () => {
    server.close().catch(() => {});
  };

  try {
    return await transport.handleRequest(req);
  } catch {
    await transport.close();
    await server.close();
    return new Response("Internal Server Error", { status: 500 });
  }
}

function withCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const path = new URL(req.url).pathname;
  if (path.endsWith("/oauth-protected-resource") && req.method === "GET") {
    return withCorsHeaders(handleProtectedResourceMetadata(req));
  }
  if (path.endsWith("/mcp") || path.endsWith("/mcp/")) {
    return withCorsHeaders(await handleMcpRequest(req));
  }
  return withCorsHeaders(new Response("Not Found", { status: 404 }));
});
