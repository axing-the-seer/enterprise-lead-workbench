import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ZodError, type ZodType } from "zod";
import {
  allowedMethods,
  companiesQuerySchema,
  companyEvidenceQuerySchema,
  companyFactsQuerySchema,
  companyListCompaniesQuerySchema,
  companyListPathSchema,
  companyListsQuerySchema,
  companyPathSchema,
  emptyQuerySchema,
  exportsQuerySchema,
  ingestionJobsQuerySchema,
  MAX_REQUEST_BYTES,
  matchRoute,
  parseSavedRuleTemplateRpcResult,
  parseJsonRequestBody,
  READ_PROJECTIONS,
  ruleResultsQuerySchema,
  ruleRunPathSchema,
  ruleRunsQuerySchema,
  ruleSetPathSchema,
  ruleSetsQuerySchema,
  ruleVersionsQuerySchema,
  saveRuleTemplateBodySchema,
  sanitizeOutput,
  searchParamsObject,
  sourceConnectionsQuerySchema,
  sourceQueriesQuerySchema,
  startExportBodySchema,
  startIngestionQueryBodySchema,
  startRuleRunBodySchema,
  toExportRpc,
  toIngestionRpc,
  toRuleRunRpc,
  toSaveRuleTemplateRpc,
  workspacePathSchema,
  workspacesQuerySchema,
  type EnqueueWorkbenchRpcRequest,
  type StartExportBody,
  type StartIngestionQueryBody,
  type StartRuleRunBody,
} from "./contracts.ts";
import { buildOpenApiDocument } from "./openapi.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
};

interface AuthenticatedContext {
  client: SupabaseClient;
  userId: string;
}

interface DataError {
  code?: string;
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues?: Array<{ path: string; message: string }>,
  ) {
    super(message);
  }
}

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(sanitizeOutput(body)), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function apiErrorResponse(
  error: ApiError,
  extraHeaders: Record<string, string> = {},
): Response {
  return jsonResponse(
    error.status,
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.issues ? { issues: error.issues } : {}),
      },
    },
    {
      ...(error.status === 401
        ? { "WWW-Authenticate": 'Bearer realm="workbench-api"' }
        : {}),
      ...extraHeaders,
    },
  );
}

function databaseError(operation: string, error: DataError): ApiError {
  const code =
    typeof error.code === "string" && /^[A-Za-z0-9_.-]{1,32}$/.test(error.code)
      ? error.code
      : "DATA_ACCESS_FAILED";
  let status = 500;
  let publicCode = "DATA_ACCESS_FAILED";
  let message = "数据读取或任务提交失败";
  if (code === "42501" || code === "PGRST301") {
    status = 403;
    publicCode = "WORKSPACE_ACCESS_DENIED";
    message = "没有该工作空间的访问或操作权限";
  } else if (code === "PGRST116" || code === "P0002") {
    status = 404;
    publicCode = "RESOURCE_NOT_FOUND";
    message = "目标记录不存在或不可访问";
  } else if (code === "23503" || code === "23505" || code.startsWith("55")) {
    status = 409;
    publicCode = "RESOURCE_CONFLICT";
    message = "记录状态或幂等约束冲突";
  } else if (code.startsWith("22") || code.startsWith("PGRST1")) {
    status = 400;
    publicCode = "INVALID_DATA_REQUEST";
    message = "数据请求不符合领域约束";
  }
  console.error("Workbench API operation failed", {
    operation,
    databaseCode: code,
    status,
  });
  return new ApiError(status, publicCode, message);
}

function assertNoDataError(operation: string, error: DataError | null): void {
  if (error) throw databaseError(operation, error);
}

function parseQuery<T>(schema: ZodType<T>, url: URL): T {
  return schema.parse(searchParamsObject(url));
}

async function parseRequestJson(req: Request): Promise<unknown> {
  const declaredLength = req.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_REQUEST_BYTES) {
    throw new ApiError(
      413,
      "REQUEST_BODY_TOO_LARGE",
      "请求体超过 128 KiB 限制",
    );
  }
  if (!req.body) return parseJsonRequestBody("");

  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let rawBody = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new ApiError(
        413,
        "REQUEST_BODY_TOO_LARGE",
        "请求体超过 128 KiB 限制",
      );
    }
    rawBody += decoder.decode(value, { stream: true });
  }
  rawBody += decoder.decode();
  return parseJsonRequestBody(rawBody);
}

function normalizeFunctionPath(pathname: string): string {
  const marker = "/workbench-api";
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex < 0) return pathname || "/";
  const suffix = pathname.slice(markerIndex + marker.length);
  return suffix || "/";
}

function functionBaseUrl(req: Request, normalizedPath: string): string {
  const url = new URL(req.url);
  const suffixLength = normalizedPath === "/" ? 1 : normalizedPath.length;
  const basePath = url.pathname.slice(
    0,
    Math.max(0, url.pathname.length - suffixLength),
  );
  url.pathname = basePath.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function decodeJwtClaims(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded));
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function authenticate(req: Request): Promise<AuthenticatedContext> {
  const match = /^Bearer ([^\s]+)$/.exec(
    req.headers.get("authorization") ?? "",
  );
  if (!match) {
    throw new ApiError(
      401,
      "AUTHENTICATION_REQUIRED",
      "需要 Supabase 用户登录令牌",
    );
  }
  const claims = decodeJwtClaims(match[1]);
  if (
    !claims?.sub ||
    claims.role === "service_role" ||
    claims.role === "anon"
  ) {
    throw new ApiError(
      401,
      "USER_TOKEN_REQUIRED",
      "只接受 Supabase 用户登录令牌",
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const publishableKey =
    Deno.env.get("SB_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY") ??
    "";
  if (!supabaseUrl || !publishableKey) {
    throw new ApiError(
      500,
      "API_NOT_CONFIGURED",
      "领域 API 尚未完成运行环境配置",
    );
  }

  const authorization = `Bearer ${match[1]}`;
  const client = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await client.auth.getUser(match[1]);
  if (error || !data.user || data.user.id !== claims.sub) {
    throw new ApiError(401, "INVALID_USER_TOKEN", "用户登录令牌无效或已过期");
  }
  return { client, userId: data.user.id };
}

function listResponse(
  data: unknown[] | null,
  pagination: { limit: number; offset: number },
): Response {
  const items = data ?? [];
  return jsonResponse(200, {
    data: items,
    pagination: {
      limit: pagination.limit,
      offset: pagination.offset,
      returned: items.length,
    },
  });
}

function literalSubstringPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

async function enqueue(
  client: SupabaseClient,
  operation: string,
  request: EnqueueWorkbenchRpcRequest,
): Promise<Response> {
  const { data, error } = await client.rpc("enqueue_workbench_job", request);
  assertNoDataError(operation, error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.job_id || !row?.job_type || !row?.status) {
    throw new ApiError(500, "INVALID_QUEUE_RESPONSE", "任务队列返回了无效结果");
  }
  return jsonResponse(202, {
    data: {
      jobId: row.job_id,
      jobType: row.job_type,
      status: row.status,
    },
  });
}

async function assertSupportedConnection(
  client: SupabaseClient,
  workspaceId: string,
  body: StartIngestionQueryBody,
): Promise<void> {
  const { data, error } = await client
    .from("source_connections")
    .select("provider,status")
    .eq("workspace_id", workspaceId)
    .eq("id", body.sourceConnectionId)
    .maybeSingle();
  assertNoDataError("startIngestionQuery.preflight", error);
  if (!data) {
    throw new ApiError(
      404,
      "SOURCE_CONNECTION_NOT_FOUND",
      "数据源连接不存在或不可访问",
    );
  }
  if (data.status !== "ready" && data.status !== "degraded") {
    throw new ApiError(
      409,
      "SOURCE_CONNECTION_NOT_READY",
      "数据源连接尚未就绪",
    );
  }

  const supported =
    (data.provider === "qcc" && body.queryKind === "company_detail") ||
    (data.provider === "huoke_assistant" &&
      (body.queryKind === "company_search" ||
        body.queryKind === "risk_enrichment")) ||
    (data.provider === "web_search" && body.queryKind === "web_evidence");
  if (!supported) {
    throw new ApiError(
      409,
      "QUERY_KIND_NOT_SUPPORTED",
      "该数据源尚未安装所选查询类型的生产执行器",
    );
  }
}

async function assertPublishedRuleVersion(
  client: SupabaseClient,
  workspaceId: string,
  body: StartRuleRunBody,
): Promise<void> {
  const { data, error } = await client
    .from("rule_set_versions")
    .select("status")
    .eq("workspace_id", workspaceId)
    .eq("id", body.ruleVersionId)
    .maybeSingle();
  assertNoDataError("startRuleRun.preflight", error);
  if (!data) {
    throw new ApiError(
      404,
      "RULE_VERSION_NOT_FOUND",
      "规则版本不存在或不可访问",
    );
  }
  if (data.status !== "published") {
    throw new ApiError(
      409,
      "RULE_VERSION_NOT_PUBLISHED",
      "外部调用只能运行已发布规则版本",
    );
  }
}

async function assertExportScope(
  client: SupabaseClient,
  workspaceId: string,
  body: StartExportBody,
): Promise<void> {
  if (body.companyListId) {
    const { data, error } = await client
      .from("company_lists")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("id", body.companyListId)
      .maybeSingle();
    assertNoDataError("startExport.listPreflight", error);
    if (!data) {
      throw new ApiError(
        404,
        "COMPANY_LIST_NOT_FOUND",
        "企业名单不存在或不可访问",
      );
    }
  }
  if (body.ruleRunId) {
    const { data, error } = await client
      .from("rule_runs")
      .select("company_list_id,status")
      .eq("workspace_id", workspaceId)
      .eq("id", body.ruleRunId)
      .maybeSingle();
    assertNoDataError("startExport.runPreflight", error);
    if (!data) {
      throw new ApiError(404, "RULE_RUN_NOT_FOUND", "规则运行不存在或不可访问");
    }
    if (data.status !== "completed" && data.status !== "partial") {
      throw new ApiError(
        409,
        "RULE_RUN_NOT_COMPLETE",
        "规则运行完成后才能按决策导出",
      );
    }
    if (body.companyListId && data.company_list_id !== body.companyListId) {
      throw new ApiError(
        409,
        "EXPORT_SCOPE_MISMATCH",
        "规则运行与企业名单不属于同一批次",
      );
    }
  }
}

async function handleProtectedOperation(
  req: Request,
  url: URL,
  operationId: string,
  params: Record<string, string>,
  context: AuthenticatedContext,
): Promise<Response> {
  const { client } = context;

  if (operationId === "listWorkspaces") {
    const query = parseQuery(workspacesQuerySchema, url);
    let request = client
      .from("workspaces")
      .select(READ_PROJECTIONS.workspaces)
      .order("updated_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.status) request = request.eq("status", query.status);
    const { data, error } = await request;
    assertNoDataError(operationId, error);
    return listResponse(data, query);
  }

  const { workspaceId } = workspacePathSchema.parse(params);

  if (operationId === "listSourceConnections") {
    const query = parseQuery(sourceConnectionsQuerySchema, url);
    let request = client
      .from("source_connections_safe")
      .select(READ_PROJECTIONS.sourceConnections)
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.provider) request = request.eq("provider", query.provider);
    if (query.status) request = request.eq("status", query.status);
    const { data, error } = await request;
    assertNoDataError(operationId, error);
    return listResponse(data, query);
  }

  if (operationId === "listSourceQueries") {
    const query = parseQuery(sourceQueriesQuerySchema, url);
    let request = client
      .from("source_queries")
      .select(READ_PROJECTIONS.sourceQueries)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.sourceConnectionId) {
      request = request.eq("source_connection_id", query.sourceConnectionId);
    }
    if (query.status) request = request.eq("status", query.status);
    const { data, error } = await request;
    assertNoDataError(operationId, error);
    return listResponse(data, query);
  }

  if (operationId === "listIngestionJobs") {
    const query = parseQuery(ingestionJobsQuerySchema, url);
    let request = client
      .from("ingestion_jobs")
      .select(READ_PROJECTIONS.ingestionJobs)
      .eq("workspace_id", workspaceId)
      .order("requested_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.sourceConnectionId) {
      request = request.eq("source_connection_id", query.sourceConnectionId);
    }
    if (query.status) request = request.eq("status", query.status);
    if (query.jobKind) request = request.eq("job_kind", query.jobKind);
    const { data, error } = await request;
    assertNoDataError(operationId, error);
    const items = (data ?? []).map((job) => {
      const result =
        job.result &&
        typeof job.result === "object" &&
        !Array.isArray(job.result)
          ? (job.result as Record<string, unknown>)
          : null;
      if (!result) return job;
      const { report_html: reportHtml, ...safeResult } = result;
      return {
        ...job,
        result: {
          ...safeResult,
          reportAvailable: typeof reportHtml === "string",
        },
      };
    });
    return listResponse(items, query);
  }

  if (operationId === "startIngestionQuery") {
    parseQuery(emptyQuerySchema, url);
    const body = startIngestionQueryBodySchema.parse(
      await parseRequestJson(req),
    );
    await assertSupportedConnection(client, workspaceId, body);
    return await enqueue(
      client,
      operationId,
      toIngestionRpc(workspaceId, body),
    );
  }

  if (operationId === "listCompanyLists") {
    const query = parseQuery(companyListsQuerySchema, url);
    let request = client
      .from("company_lists")
      .select(READ_PROJECTIONS.companyLists)
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.status) request = request.eq("status", query.status);
    const { data, error } = await request;
    assertNoDataError(operationId, error);
    return listResponse(data, query);
  }

  if (operationId === "listCompanyListCompanies") {
    const path = companyListPathSchema.parse(params);
    const query = parseQuery(companyListCompaniesQuerySchema, url);
    let request = client
      .from("company_list_members")
      .select(
        `membership_status,added_at,company:companies!company_list_members_company_fkey(${READ_PROJECTIONS.companies})`,
      )
      .eq("workspace_id", workspaceId)
      .eq("company_list_id", path.companyListId)
      .order("added_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.membershipStatus) {
      request = request.eq("membership_status", query.membershipStatus);
    }
    const { data, error } = await request;
    assertNoDataError(operationId, error);
    const items = (data ?? []).flatMap((row) => {
      const related = Array.isArray(row.company) ? row.company[0] : row.company;
      if (!related || typeof related !== "object") return [];
      return [
        {
          ...related,
          membership_status: row.membership_status,
          added_at: row.added_at,
        },
      ];
    });
    return listResponse(items, query);
  }

  if (operationId === "listCompanies") {
    const query = parseQuery(companiesQuerySchema, url);
    let request = client
      .from("companies")
      .select(READ_PROJECTIONS.companies)
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.name) {
      request = request.ilike("name", literalSubstringPattern(query.name));
    }
    if (query.profileStatus) {
      request = request.eq("profile_status", query.profileStatus);
    }
    const { data, error } = await request;
    assertNoDataError(operationId, error);
    return listResponse(data, query);
  }

  if (operationId === "getCompany") {
    parseQuery(emptyQuerySchema, url);
    const path = companyPathSchema.parse(params);
    const { data, error } = await client
      .from("companies")
      .select(READ_PROJECTIONS.companies)
      .eq("workspace_id", workspaceId)
      .eq("id", path.companyId)
      .maybeSingle();
    assertNoDataError(operationId, error);
    if (!data) {
      throw new ApiError(404, "COMPANY_NOT_FOUND", "企业不存在或不可访问");
    }
    return jsonResponse(200, { data });
  }

  if (operationId === "listCompanyEvidence") {
    const path = companyPathSchema.parse(params);
    const query = parseQuery(companyEvidenceQuerySchema, url);
    let request = client
      .from("company_evidence")
      .select(READ_PROJECTIONS.companyEvidence)
      .eq("workspace_id", workspaceId)
      .eq("company_id", path.companyId)
      .order("observed_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.status) request = request.eq("evidence_status", query.status);
    if (query.evidenceType) {
      request = request.eq("evidence_type", query.evidenceType);
    }
    const { data, error } = await request;
    assertNoDataError(operationId, error);
    return listResponse(data, query);
  }

  if (operationId === "listCompanyFacts") {
    const path = companyPathSchema.parse(params);
    const query = parseQuery(companyFactsQuerySchema, url);
    let request = client
      .from("company_field_facts")
      .select(READ_PROJECTIONS.companyFacts)
      .eq("workspace_id", workspaceId)
      .eq("company_id", path.companyId)
      .order("observed_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.currentOnly) request = request.eq("is_current", true);
    if (query.fieldName) request = request.eq("field_name", query.fieldName);
    const { data, error } = await request;
    assertNoDataError(operationId, error);
    return listResponse(data, query);
  }

  if (operationId === "listRuleSets") {
    const query = parseQuery(ruleSetsQuerySchema, url);
    let request = client
      .from("rule_sets")
      .select(READ_PROJECTIONS.ruleSets)
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.status) request = request.eq("status", query.status);
    const { data, error } = await request;
    assertNoDataError(operationId, error);
    return listResponse(data, query);
  }

  if (operationId === "saveRuleTemplate") {
    parseQuery(emptyQuerySchema, url);
    const body = saveRuleTemplateBodySchema.parse(await parseRequestJson(req));
    const { data, error } = await client.rpc(
      "save_rule_template",
      toSaveRuleTemplateRpc(workspaceId, body),
    );
    assertNoDataError(operationId, error);
    const saved = parseSavedRuleTemplateRpcResult(data);
    if (!saved) {
      throw new ApiError(
        500,
        "INVALID_RULE_SAVE_RESPONSE",
        "规则发布服务返回了无效结果",
      );
    }
    return jsonResponse(200, { data: saved });
  }

  if (operationId === "listRuleSetVersions") {
    const path = ruleSetPathSchema.parse(params);
    const query = parseQuery(ruleVersionsQuerySchema, url);
    let request = client
      .from("rule_set_versions")
      .select(READ_PROJECTIONS.ruleSetVersions)
      .eq("workspace_id", workspaceId)
      .eq("rule_set_id", path.ruleSetId)
      .order("version_number", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.status) request = request.eq("status", query.status);
    const { data, error } = await request;
    assertNoDataError(operationId, error);
    return listResponse(data, query);
  }

  if (operationId === "listRuleRuns") {
    const query = parseQuery(ruleRunsQuerySchema, url);
    let request = client
      .from("rule_runs")
      .select(READ_PROJECTIONS.ruleRuns)
      .eq("workspace_id", workspaceId)
      .order("requested_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.status) request = request.eq("status", query.status);
    if (query.companyListId) {
      request = request.eq("company_list_id", query.companyListId);
    }
    if (query.ruleVersionId) {
      request = request.eq("rule_version_id", query.ruleVersionId);
    }
    const { data, error } = await request;
    assertNoDataError(operationId, error);
    return listResponse(data, query);
  }

  if (operationId === "startRuleRun") {
    parseQuery(emptyQuerySchema, url);
    const body = startRuleRunBodySchema.parse(await parseRequestJson(req));
    await assertPublishedRuleVersion(client, workspaceId, body);
    return await enqueue(client, operationId, toRuleRunRpc(workspaceId, body));
  }

  if (operationId === "listRuleResults") {
    const path = ruleRunPathSchema.parse(params);
    const query = parseQuery(ruleResultsQuerySchema, url);
    let request = client
      .from("rule_results")
      .select(READ_PROJECTIONS.ruleResults)
      .eq("workspace_id", workspaceId)
      .eq("rule_run_id", path.ruleRunId)
      .order("evaluated_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.decision) request = request.eq("decision", query.decision);
    const { data, error } = await request;
    assertNoDataError(operationId, error);
    return listResponse(data, query);
  }

  if (operationId === "listExports") {
    const query = parseQuery(exportsQuerySchema, url);
    let request = client
      .from("exports")
      .select(READ_PROJECTIONS.exports)
      .eq("workspace_id", workspaceId)
      .order("requested_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.status) request = request.eq("status", query.status);
    const { data, error } = await request;
    assertNoDataError(operationId, error);
    return listResponse(data, query);
  }

  if (operationId === "startExport") {
    parseQuery(emptyQuerySchema, url);
    const body = startExportBodySchema.parse(await parseRequestJson(req));
    await assertExportScope(client, workspaceId, body);
    return await enqueue(client, operationId, toExportRpc(workspaceId, body));
  }

  throw new ApiError(404, "ROUTE_NOT_FOUND", "接口不存在");
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const pathname = normalizeFunctionPath(url.pathname);
  const matched = matchRoute(req.method, pathname);
  if (!matched) {
    const methods = allowedMethods(pathname);
    if (methods.length > 0) {
      return apiErrorResponse(
        new ApiError(405, "METHOD_NOT_ALLOWED", "该接口不支持此 HTTP 方法"),
        { Allow: methods.join(", ") },
      );
    }
    return apiErrorResponse(new ApiError(404, "ROUTE_NOT_FOUND", "接口不存在"));
  }

  if (matched.operationId === "getOpenApi") {
    return jsonResponse(
      200,
      buildOpenApiDocument(functionBaseUrl(req, pathname)),
      { "Cache-Control": "public, max-age=300" },
    );
  }

  if (req.method === "POST") {
    const contentType = req.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (contentType !== "application/json") {
      throw new ApiError(
        415,
        "JSON_CONTENT_TYPE_REQUIRED",
        "POST 请求必须使用 application/json",
      );
    }
  }

  const context = await authenticate(req);
  return await handleProtectedOperation(
    req,
    url,
    matched.operationId,
    matched.params,
    context,
  );
}

Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (error) {
    if (error instanceof ApiError) return apiErrorResponse(error);
    if (error instanceof ZodError) {
      return apiErrorResponse(
        new ApiError(
          400,
          "VALIDATION_FAILED",
          "请求参数不符合接口契约",
          error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        ),
      );
    }
    if (error instanceof Error) {
      const safeMessage =
        error.message.startsWith("查询参数不得重复") ||
        error.message.startsWith("请求体")
          ? error.message
          : "请求处理失败";
      const status = safeMessage === "请求处理失败" ? 500 : 400;
      console.error("Workbench API request failed", {
        errorName: error.name,
        status,
      });
      return apiErrorResponse(
        new ApiError(
          status,
          status === 400 ? "INVALID_REQUEST" : "INTERNAL_ERROR",
          safeMessage,
        ),
      );
    }
    return apiErrorResponse(
      new ApiError(500, "INTERNAL_ERROR", "请求处理失败"),
    );
  }
});
