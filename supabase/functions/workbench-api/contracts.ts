import { z } from "zod";

export const MAX_REQUEST_BYTES = 128 * 1024;

export const WORKSPACE_STATUSES = ["active", "suspended", "archived"] as const;
export const SOURCE_CONNECTION_STATUSES = [
  "draft",
  "ready",
  "degraded",
  "disabled",
  "error",
] as const;
export const SOURCE_QUERY_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export const INGESTION_JOB_STATUSES = [
  "queued",
  "running",
  "completed",
  "partial",
  "failed",
  "cancelled",
] as const;
export const COMPANY_LIST_STATUSES = ["active", "locked", "archived"] as const;
export const COMPANY_PROFILE_STATUSES = [
  "unverified",
  "verified",
  "conflicted",
  "merged",
  "archived",
] as const;
export const EVIDENCE_STATUSES = [
  "unverified",
  "verified",
  "stale",
  "rejected",
] as const;
export const RULE_SET_STATUSES = ["draft", "active", "archived"] as const;
export const RULE_VERSION_STATUSES = ["draft", "published", "retired"] as const;
export const RULE_RUN_STATUSES = INGESTION_JOB_STATUSES;
export const RULE_DECISIONS = ["include", "exclude", "needs_review"] as const;
export const EXPORT_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "expired",
  "cancelled",
] as const;

export const READ_RESOURCES = [
  "workspaces",
  "source_connections",
  "source_queries",
  "ingestion_jobs",
  "company_lists",
  "company_list_members",
  "companies",
  "company_evidence",
  "company_field_facts",
  "rule_sets",
  "rule_set_versions",
  "rule_runs",
  "rule_results",
  "exports",
] as const;

/**
 * Every database read in the public domain API must use one of these fixed
 * projections. In particular, provider payloads, job input parameters,
 * connection configuration and credential references are not selectable.
 */
export const READ_PROJECTIONS = {
  workspaces: "id,name,slug,status,created_at,updated_at",
  sourceConnections:
    "id,workspace_id,provider,name,connection_kind,status,has_secret_reference,capabilities,default_mapping_version_id,external_connection_id,last_verified_at,last_error_code,created_at,updated_at",
  sourceQueries:
    "id,workspace_id,source_connection_id,query_kind,query_text,criteria,criteria_hash,status,external_query_id,created_at,updated_at",
  ingestionJobs:
    "id,workspace_id,source_connection_id,source_query_id,mapping_version_id,job_kind,status,result,requested_at,started_at,completed_at,received_count,accepted_count,rejected_count,error_code,claimed_at,attempt_count,created_at,updated_at",
  companyLists:
    "id,workspace_id,name,description,status,source_query_id,ingestion_job_id,created_via,created_by_agent,agent_provider,created_at,updated_at",
  companies:
    "id,workspace_id,name,unified_social_credit_code,registration_number,organization_code,legal_representative,operating_status,company_type,registered_capital_amount,paid_in_capital_amount,registered_capital_currency,established_on,approved_on,registration_authority,business_scope,province,city,district,region_text,industry_code,industry_name,employee_count,insured_employee_count,personnel_scale_text,address,primary_source,last_verified_at,profile_status,completeness_score,created_at,updated_at",
  companyEvidence:
    "id,workspace_id,company_id,evidence_type,title,source_provider,source_url,excerpt,evidence_fingerprint,evidence_status,observed_at,captured_at,expires_at,created_at",
  companyFacts:
    "id,workspace_id,company_id,field_name,value_json,value_text,value_type,source_provider,evidence_id,confidence,observed_at,valid_from,valid_to,is_current,created_at",
  ruleSets:
    "id,workspace_id,name,description,business_objective,status,current_version_number,created_at,updated_at",
  ruleSetVersions:
    "id,workspace_id,rule_set_id,version_number,status,rule_definition,scoring_definition,canonical_schema_version,change_note,created_at,published_at",
  ruleRuns:
    "id,workspace_id,rule_version_id,company_list_id,run_mode,status,engine_version,input_manifest_hash,requested_at,started_at,completed_at,total_count,included_count,excluded_count,review_count,error_code,claimed_at,attempt_count,created_at,updated_at",
  ruleResults:
    "id,workspace_id,rule_run_id,company_id,decision,score,matched_rules,failed_rules,missing_fields,evaluated_values,result_hash,evaluated_at,created_at",
  exports:
    "id,workspace_id,company_list_id,rule_run_id,export_format,status,selected_fields,storage_bucket,storage_path,checksum_sha256,file_size_bytes,row_count,requested_at,completed_at,expires_at,error_code,claimed_at,attempt_count,created_at,updated_at",
} as const;

export const EXPORT_FIELD_NAMES = [
  "companyName",
  "creditCode",
  "legalPerson",
  "status.raw",
  "companyType",
  "registeredCapital.valueWan",
  "paidInCapital.valueWan",
  "establishedDate",
  "approvedDate",
  "registrationAuthority",
  "industry.l2",
  "insuredCount",
  "region.raw",
  "region.province",
  "region.city",
  "region.district",
  "personnelScale.raw",
  "registeredAddress",
  "businessScope",
  "contact.phoneMasked",
  "contact.emailMasked",
  "tags.qualifications",
  "tags.risk",
  "tags.operational",
  "riskSnapshot.severity",
  "decision",
] as const;

export const DEFAULT_EXPORT_FIELDS = [
  "companyName",
  "creditCode",
  "status.raw",
  "companyType",
  "registeredCapital.valueWan",
  "establishedDate",
  "industry.l2",
  "insuredCount",
  "registeredAddress",
  "decision",
] as const;

export const API_ROUTES = [
  {
    operationId: "getOpenApi",
    method: "GET",
    path: "/openapi.json",
    authenticated: false,
  },
  {
    operationId: "listWorkspaces",
    method: "GET",
    path: "/workspaces",
    authenticated: true,
  },
  {
    operationId: "listSourceConnections",
    method: "GET",
    path: "/workspaces/{workspaceId}/source-connections",
    authenticated: true,
  },
  {
    operationId: "listSourceQueries",
    method: "GET",
    path: "/workspaces/{workspaceId}/source-queries",
    authenticated: true,
  },
  {
    operationId: "listIngestionJobs",
    method: "GET",
    path: "/workspaces/{workspaceId}/ingestion-jobs",
    authenticated: true,
  },
  {
    operationId: "startIngestionQuery",
    method: "POST",
    path: "/workspaces/{workspaceId}/ingestion-queries",
    authenticated: true,
  },
  {
    operationId: "listCompanyLists",
    method: "GET",
    path: "/workspaces/{workspaceId}/company-lists",
    authenticated: true,
  },
  {
    operationId: "listCompanyListCompanies",
    method: "GET",
    path: "/workspaces/{workspaceId}/company-lists/{companyListId}/companies",
    authenticated: true,
  },
  {
    operationId: "listCompanies",
    method: "GET",
    path: "/workspaces/{workspaceId}/companies",
    authenticated: true,
  },
  {
    operationId: "getCompany",
    method: "GET",
    path: "/workspaces/{workspaceId}/companies/{companyId}",
    authenticated: true,
  },
  {
    operationId: "listCompanyEvidence",
    method: "GET",
    path: "/workspaces/{workspaceId}/companies/{companyId}/evidence",
    authenticated: true,
  },
  {
    operationId: "listCompanyFacts",
    method: "GET",
    path: "/workspaces/{workspaceId}/companies/{companyId}/facts",
    authenticated: true,
  },
  {
    operationId: "listRuleSets",
    method: "GET",
    path: "/workspaces/{workspaceId}/rule-sets",
    authenticated: true,
  },
  {
    operationId: "saveRuleTemplate",
    method: "POST",
    path: "/workspaces/{workspaceId}/rule-sets",
    authenticated: true,
  },
  {
    operationId: "listRuleSetVersions",
    method: "GET",
    path: "/workspaces/{workspaceId}/rule-sets/{ruleSetId}/versions",
    authenticated: true,
  },
  {
    operationId: "listRuleRuns",
    method: "GET",
    path: "/workspaces/{workspaceId}/rule-runs",
    authenticated: true,
  },
  {
    operationId: "startRuleRun",
    method: "POST",
    path: "/workspaces/{workspaceId}/rule-runs",
    authenticated: true,
  },
  {
    operationId: "listRuleResults",
    method: "GET",
    path: "/workspaces/{workspaceId}/rule-runs/{ruleRunId}/results",
    authenticated: true,
  },
  {
    operationId: "listExports",
    method: "GET",
    path: "/workspaces/{workspaceId}/exports",
    authenticated: true,
  },
  {
    operationId: "startExport",
    method: "POST",
    path: "/workspaces/{workspaceId}/exports",
    authenticated: true,
  },
] as const;

export type ApiOperationId = (typeof API_ROUTES)[number]["operationId"];
export type ApiMethod = (typeof API_ROUTES)[number]["method"];

export interface MatchedRoute {
  operationId: ApiOperationId;
  authenticated: boolean;
  params: Record<string, string>;
}

function decodePathSegments(pathname: string): string[] | null {
  try {
    const normalized =
      pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
    return normalized.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
}

function matchTemplate(
  template: string,
  pathname: string,
): Record<string, string> | null {
  const expected = decodePathSegments(template);
  const actual = decodePathSegments(pathname);
  if (!expected || !actual || expected.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < expected.length; index += 1) {
    const templatePart = expected[index];
    const actualPart = actual[index];
    if (templatePart.startsWith("{") && templatePart.endsWith("}")) {
      params[templatePart.slice(1, -1)] = actualPart;
      continue;
    }
    if (templatePart !== actualPart) return null;
  }
  return params;
}

export function matchRoute(
  method: string,
  pathname: string,
): MatchedRoute | null {
  const normalizedMethod = method.toUpperCase();
  for (const route of API_ROUTES) {
    if (route.method !== normalizedMethod) continue;
    const params = matchTemplate(route.path, pathname);
    if (params) {
      return {
        operationId: route.operationId,
        authenticated: route.authenticated,
        params,
      };
    }
  }
  return null;
}

export function allowedMethods(pathname: string): ApiMethod[] {
  return API_ROUTES.flatMap((route) =>
    matchTemplate(route.path, pathname) ? [route.method] : [],
  );
}

const uuidSchema = z.string().uuid();
const companyIdSchema = z.string().regex(/^[1-9][0-9]{0,18}$/);
const idempotencyKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

const paginationShape = {
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
};

export const workspacePathSchema = z
  .object({ workspaceId: uuidSchema })
  .strict();
export const companyPathSchema = workspacePathSchema
  .extend({
    companyId: companyIdSchema,
  })
  .strict();
export const companyListPathSchema = workspacePathSchema
  .extend({
    companyListId: uuidSchema,
  })
  .strict();
export const ruleSetPathSchema = workspacePathSchema
  .extend({
    ruleSetId: uuidSchema,
  })
  .strict();
export const ruleRunPathSchema = workspacePathSchema
  .extend({
    ruleRunId: uuidSchema,
  })
  .strict();

export const workspacesQuerySchema = z
  .object({
    ...paginationShape,
    status: z.enum(WORKSPACE_STATUSES).optional(),
  })
  .strict();
export const sourceConnectionsQuerySchema = z
  .object({
    ...paginationShape,
    provider: z
      .enum(["qcc", "huoke_assistant", "file_upload", "web_search", "other"])
      .optional(),
    status: z.enum(SOURCE_CONNECTION_STATUSES).optional(),
  })
  .strict();
export const sourceQueriesQuerySchema = z
  .object({
    ...paginationShape,
    sourceConnectionId: uuidSchema.optional(),
    status: z.enum(SOURCE_QUERY_STATUSES).optional(),
  })
  .strict();
export const ingestionJobsQuerySchema = z
  .object({
    ...paginationShape,
    sourceConnectionId: uuidSchema.optional(),
    status: z.enum(INGESTION_JOB_STATUSES).optional(),
    jobKind: z
      .enum(["query", "import", "enrich", "refresh", "connection_test"])
      .optional(),
  })
  .strict();
export const companyListsQuerySchema = z
  .object({
    ...paginationShape,
    status: z.enum(COMPANY_LIST_STATUSES).optional(),
  })
  .strict();
export const companyListCompaniesQuerySchema = z
  .object({
    ...paginationShape,
    membershipStatus: z
      .enum(["included", "excluded", "needs_review"])
      .optional(),
  })
  .strict();
export const companiesQuerySchema = z
  .object({
    ...paginationShape,
    name: z.string().trim().min(1).max(200).optional(),
    profileStatus: z.enum(COMPANY_PROFILE_STATUSES).optional(),
  })
  .strict();
export const companyEvidenceQuerySchema = z
  .object({
    ...paginationShape,
    status: z.enum(EVIDENCE_STATUSES).optional(),
    evidenceType: z
      .enum([
        "registration",
        "operation",
        "risk",
        "qualification",
        "tender",
        "web",
        "uploaded_document",
        "manual_note",
        "other",
      ])
      .optional(),
  })
  .strict();
export const companyFactsQuerySchema = z
  .object({
    ...paginationShape,
    currentOnly: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    fieldName: z.string().trim().min(1).max(160).optional(),
  })
  .strict();
export const ruleSetsQuerySchema = z
  .object({
    ...paginationShape,
    status: z.enum(RULE_SET_STATUSES).optional(),
  })
  .strict();
export const ruleVersionsQuerySchema = z
  .object({
    ...paginationShape,
    status: z.enum(RULE_VERSION_STATUSES).optional(),
  })
  .strict();
export const ruleRunsQuerySchema = z
  .object({
    ...paginationShape,
    status: z.enum(RULE_RUN_STATUSES).optional(),
    companyListId: uuidSchema.optional(),
    ruleVersionId: uuidSchema.optional(),
  })
  .strict();
export const ruleResultsQuerySchema = z
  .object({
    ...paginationShape,
    decision: z.enum(RULE_DECISIONS).optional(),
  })
  .strict();
export const exportsQuerySchema = z
  .object({
    ...paginationShape,
    status: z.enum(EXPORT_STATUSES).optional(),
  })
  .strict();
export const emptyQuerySchema = z.object({}).strict();

const ruleOperatorSchema = z.enum([
  "eq",
  "not_eq",
  "gte",
  "lte",
  "contains",
  "not_contains",
  "in",
  "not_in",
  "present",
  "absent",
  "intersects",
]);
const ruleMissingPolicySchema = z.enum(["review", "pass", "fail"]);
const eligibilityConditionSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(300),
    field: z.string().trim().min(1).max(300),
    operator: ruleOperatorSchema,
    value: z.unknown().optional(),
    missingPolicy: ruleMissingPolicySchema,
    enabled: z.boolean(),
  })
  .strict();
const eligibilityGroupSchema: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      id: z.string().trim().min(1).max(120),
      combinator: z.enum(["and", "or"]),
      rules: z
        .array(z.union([eligibilityConditionSchema, eligibilityGroupSchema]))
        .min(1)
        .max(200),
    })
    .strict(),
);
const leadRuleSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(300),
    kind: z.enum(["priority", "risk_gate"]),
    field: z.string().trim().min(1).max(300),
    operator: ruleOperatorSchema,
    value: z.unknown().optional(),
    weight: z.number().finite().nonnegative().default(0),
    onMatch: z.enum(["score", "review", "block"]).default("score"),
    missingPolicy: ruleMissingPolicySchema.default("review"),
    enabled: z.boolean().default(true),
  })
  .strict();

function validateEligibilityTree(
  value: unknown,
  context: z.RefinementCtx,
): void {
  if (!value || typeof value !== "object") return;
  const eligibility = (value as Record<string, unknown>).eligibility;
  if (!eligibility || typeof eligibility !== "object") return;
  const root = (eligibility as Record<string, unknown>).root;
  const identifiers = new Set<string>();
  let maximumDepth = 0;
  let conditionCount = 0;
  const visit = (node: unknown, depth: number) => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (typeof record.id === "string") {
      if (identifiers.has(record.id)) {
        context.addIssue({
          code: "custom",
          path: ["ruleDefinition", "eligibility", "root"],
          message: `准入条件树 ID 不得重复：${record.id}`,
        });
      }
      identifiers.add(record.id);
    }
    if (!Array.isArray(record.rules)) {
      conditionCount += 1;
      return;
    }
    // RuleTemplate v1 defines depth as nested condition groups. A condition
    // below a fifth-level group does not become a sixth group level.
    maximumDepth = Math.max(maximumDepth, depth);
    for (const child of record.rules) visit(child, depth + 1);
  };
  visit(root, 1);
  if (maximumDepth > 5) {
    context.addIssue({
      code: "custom",
      path: ["ruleDefinition", "eligibility", "root"],
      message: "准入条件树最多允许 5 层",
    });
  }
  if (conditionCount > 200) {
    context.addIssue({
      code: "custom",
      path: ["ruleDefinition", "eligibility", "root"],
      message: "准入条件树最多允许 200 个条件",
    });
  }
}

const forbiddenRuleJsonKey =
  /(^|[_-])(api[_-]?key|token|access[_-]?token|refresh[_-]?token|cloud[_-]?token|secret|client[_-]?secret|secret[_-]?reference|password|authorization|private[_-]?key|credential|cookie)($|[_-])/i;

function validateRuleJson(value: unknown, context: z.RefinementCtx): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let nodeCount = 0;
  while (stack.length > 0) {
    const current = stack.pop()!;
    nodeCount += 1;
    if (nodeCount > 5_000 || current.depth > 20) {
      context.addIssue({ code: "custom", message: "规则 JSON 结构过于复杂" });
      return;
    }
    if (Array.isArray(current.value)) {
      for (const child of current.value) {
        stack.push({ value: child, depth: current.depth + 1 });
      }
      continue;
    }
    if (!current.value || typeof current.value !== "object") continue;
    for (const [key, child] of Object.entries(current.value)) {
      if (forbiddenRuleJsonKey.test(key)) {
        context.addIssue({
          code: "custom",
          message: `规则中不得包含凭证字段：${key}`,
        });
      }
      stack.push({ value: child, depth: current.depth + 1 });
    }
  }

  // Only stringify after the iterative guard. This keeps deeply nested MCP
  // objects and accidental cyclic values from exhausting the JS call stack.
  let serialized = "";
  try {
    serialized = JSON.stringify(value);
  } catch {
    context.addIssue({ code: "custom", message: "规则必须是可序列化 JSON" });
    return;
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_REQUEST_BYTES) {
    context.addIssue({
      code: "custom",
      message: "规则模板超过 128 KiB 接口限制",
    });
  }
}

function preflightRuleTemplateDefinition(
  value: unknown,
  context: z.RefinementCtx,
): unknown {
  if (!value || typeof value !== "object") return value;
  const eligibility = (value as Record<string, unknown>).eligibility;
  if (!eligibility || typeof eligibility !== "object") return value;
  const root = (eligibility as Record<string, unknown>).root;
  const stack: Array<{ node: unknown; groupDepth: number }> = [
    { node: root, groupDepth: 1 },
  ];
  let visited = 0;
  while (stack.length > 0) {
    const { node, groupDepth } = stack.pop()!;
    visited += 1;
    if (visited > 5_000) {
      context.addIssue({
        code: "custom",
        path: ["eligibility", "root"],
        message: "准入条件树结构过于复杂",
      });
      return null;
    }
    if (!node || typeof node !== "object") continue;
    const rules = (node as Record<string, unknown>).rules;
    if (!Array.isArray(rules)) continue;
    if (groupDepth > 5) {
      context.addIssue({
        code: "custom",
        path: ["eligibility", "root"],
        message: "准入条件树最多允许 5 层",
      });
      // Returning a non-object prevents the recursive schema from traversing
      // the already-invalid tree after this preflight issue.
      return null;
    }
    for (const child of rules) {
      const childRules =
        child && typeof child === "object"
          ? (child as Record<string, unknown>).rules
          : undefined;
      stack.push({
        node: child,
        groupDepth: Array.isArray(childRules) ? groupDepth + 1 : groupDepth,
      });
    }
  }
  return value;
}

export const ruleTemplateDefinitionSchema = z
  .preprocess(
    preflightRuleTemplateDefinition,
    z
      .object({
        id: z.string().trim().min(1).max(120).optional(),
        name: z.string().trim().min(1).max(160).optional(),
        eligibility: z
          .object({
            root: eligibilityGroupSchema,
            onNoMatch: z.literal("exclude"),
            onUnknown: z.enum(["review", "exclude", "pass"]),
          })
          .strict()
          .optional(),
        rules: z.array(leadRuleSchema).max(200),
        thresholds: z
          .object({
            p1: z.number().finite().min(0).max(100),
            p2: z.number().finite().min(0).max(100),
            minimumCompleteness: z
              .number()
              .finite()
              .min(0)
              .max(100)
              .default(60),
          })
          .strict()
          .refine((thresholds) => thresholds.p1 >= thresholds.p2, {
            message: "P1 阈值不能低于 P2 阈值",
          }),
      })
      .strict(),
  )
  .describe(
    "RuleTemplate v1 定义；id/name 可省略且会由服务端覆盖，eligibility 条件组最多 5 层、全树最多 200 个条件。",
  );

export const saveRuleTemplateBodySchema = z
  .object({
    ruleSetId: uuidSchema
      .optional()
      .describe("新建时省略；发布新版本时传入现有规则集 UUID。"),
    name: z.string().trim().min(1).max(160).describe("规则模板显示名称。"),
    description: z
      .string()
      .trim()
      .max(4_000)
      .default("")
      .describe("规则模板说明。"),
    businessObjective: z
      .string()
      .trim()
      .min(1)
      .max(2_000)
      .describe("规则适用的业务目标、行业和排除边界。"),
    ruleDefinition: ruleTemplateDefinitionSchema,
    scoringDefinition: z
      .object({ engineVersion: z.literal("lead-rules-v1") })
      .strict()
      .default({ engineVersion: "lead-rules-v1" })
      .describe("固定为 lead-rules-v1；可省略。"),
    changeNote: z
      .string()
      .trim()
      .max(1_000)
      .default("通过领域 API 发布。")
      .describe("本次不可变版本的变更说明。"),
  })
  .strict()
  .superRefine((value, context) => {
    validateEligibilityTree(value.ruleDefinition, context);
    validateRuleJson(value, context);
  })
  .describe("原子创建规则集或发布新版本；完整相同的重试复用现有已发布版本。");

export function searchParamsObject(url: URL): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (Object.hasOwn(result, key)) {
      throw new Error(`查询参数不得重复：${key}`);
    }
    result[key] = value;
  }
  return result;
}

const numericRangeSchema = z
  .object({
    min: z.number().finite().nonnegative().optional(),
    max: z.number().finite().nonnegative().optional(),
  })
  .strict()
  .refine((value) => value.min !== undefined || value.max !== undefined, {
    message: "区间至少填写一个边界",
  })
  .refine(
    (value) =>
      value.min === undefined ||
      value.max === undefined ||
      value.min <= value.max,
    { message: "区间下限不能大于上限" },
  );

const dateRangeSchema = z
  .object({ start: z.iso.date(), end: z.iso.date() })
  .strict()
  .refine((value) => value.start <= value.end, {
    message: "日期起点不能晚于终点",
  });

const catalogSelectionSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    providerValues: z.array(z.string().trim().min(2).max(120)).min(1).max(500),
  })
  .strict();

export const companySearchCriteriaSchema = z
  .object({
    keyword: z.string().trim().min(2).max(100).optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(10).default(10),
    regions: z.array(catalogSelectionSchema).max(20).optional(),
    industries: z.array(catalogSelectionSchema).max(100).optional(),
    statuses: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
    enterpriseTypes: z
      .array(z.enum(["individual", "cooperative", "company"]))
      .max(2)
      .refine((value) => new Set(value).size === value.length, {
        message: "企业类型不能重复",
      })
      .optional(),
    contactRequirements: z
      .array(z.enum(["phone", "email"]))
      .max(2)
      .refine((value) => new Set(value).size === value.length, {
        message: "联系方式条件不能重复",
      })
      .optional(),
    riskFlags: z
      .object({
        businessAbnormal: z.enum(["has", "none"]).optional(),
        equityFreeze: z.enum(["has", "none"]).optional(),
        severeViolation: z.enum(["has", "none"]).optional(),
        administrativePenalty: z.enum(["has", "none"]).optional(),
      })
      .strict()
      .optional(),
    qualificationTags: z
      .array(z.string().trim().min(1).max(80))
      .max(50)
      .optional(),
    actualOperatingOnly: z.boolean().optional(),
    smallBusinessOnly: z.boolean().optional(),
    registeredCapitalWan: z.array(numericRangeSchema).max(10).optional(),
    insuredCount: z.array(numericRangeSchema).max(10).optional(),
    legalPersonSharePercent: z.array(numericRangeSchema).max(10).optional(),
    establishedBetween: z.array(dateRangeSchema).max(10).optional(),
    legalChangedBetween: z.array(dateRangeSchema).max(10).optional(),
    legalUnchangedBetween: z.array(dateRangeSchema).max(10).optional(),
  })
  .strict()
  .refine(
    (value) =>
      Boolean(
        value.keyword ||
          value.regions?.length ||
          value.industries?.length ||
          value.statuses?.length ||
          value.enterpriseTypes?.length ||
          value.contactRequirements?.length ||
          value.riskFlags ||
          value.qualificationTags?.length ||
          value.actualOperatingOnly ||
          value.smallBusinessOnly ||
          value.registeredCapitalWan?.length ||
          value.insuredCount?.length ||
          value.legalPersonSharePercent?.length ||
          value.establishedBetween?.length ||
          value.legalChangedBetween?.length ||
          value.legalUnchangedBetween?.length,
      ),
    { message: "至少需要一个明确的企业筛选条件" },
  );

function companyLookupCriteriaSchema(maxLength: number) {
  const lookupText = z.string().trim().min(2).max(maxLength);
  return z
    .object({
      searchKey: lookupText.optional(),
      companyName: lookupText.optional(),
      creditCode: lookupText.optional(),
    })
    .strict()
    .refine(
      (value) =>
        Boolean(value.searchKey || value.companyName || value.creditCode),
      { message: "需要企业名称或统一社会信用代码" },
    );
}

export const webEvidenceCriteriaSchema = z
  .object({
    companyId: companyIdSchema,
    claimType: z.enum([
      "official_website",
      "product",
      "award",
      "tender",
      "recruiting",
      "news",
      "public_report",
      "other",
    ]),
    reportMode: z.boolean().optional(),
    extraKeywords: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
    site: z
      .string()
      .trim()
      .max(253)
      .regex(
        /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i,
      )
      .optional(),
    maxResults: z.number().int().min(1).max(10).default(10),
  })
  .strict();

const ingestionRequestCommon = {
  sourceConnectionId: uuidSchema,
  queryText: z.string().trim().min(1).max(2_000).optional(),
  listName: z.string().trim().min(2).max(120).optional(),
  mappingVersionId: uuidSchema.optional(),
  idempotencyKey: idempotencyKeySchema,
};

export const startIngestionQueryBodySchema = z.discriminatedUnion("queryKind", [
  z
    .object({
      ...ingestionRequestCommon,
      queryKind: z.literal("company_search"),
      criteria: companySearchCriteriaSchema,
    })
    .strict(),
  z
    .object({
      ...ingestionRequestCommon,
      queryKind: z.literal("company_detail"),
      criteria: companyLookupCriteriaSchema(160),
    })
    .strict(),
  z
    .object({
      ...ingestionRequestCommon,
      queryKind: z.literal("risk_enrichment"),
      criteria: companyLookupCriteriaSchema(100),
    })
    .strict(),
  z
    .object({
      ...ingestionRequestCommon,
      queryKind: z.literal("web_evidence"),
      criteria: webEvidenceCriteriaSchema,
    })
    .strict(),
]);

export const startRuleRunBodySchema = z
  .object({
    ruleVersionId: uuidSchema,
    companyListId: uuidSchema,
    runMode: z.enum(["sample", "full"]).default("full"),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const startExportBodySchema = z
  .object({
    companyListId: uuidSchema.optional(),
    ruleRunId: uuidSchema.optional(),
    format: z.enum(["csv", "xlsx", "json", "html"]),
    selectedFields: z
      .array(z.enum(EXPORT_FIELD_NAMES))
      .min(1)
      .max(EXPORT_FIELD_NAMES.length)
      .refine((fields) => new Set(fields).size === fields.length, {
        message: "导出字段不得重复",
      })
      .optional(),
    decisions: z
      .array(z.enum(["include", "exclude", "needs_review", "unscored"]))
      .min(1)
      .max(4)
      .refine((values) => new Set(values).size === values.length, {
        message: "决策筛选值不得重复",
      })
      .optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict()
  .refine((value) => Boolean(value.companyListId || value.ruleRunId), {
    message: "导出必须指定企业名单或规则运行",
  });

export type StartIngestionQueryBody = z.infer<
  typeof startIngestionQueryBodySchema
>;
export type StartRuleRunBody = z.infer<typeof startRuleRunBodySchema>;
export type StartExportBody = z.infer<typeof startExportBodySchema>;
export type SaveRuleTemplateBody = z.infer<typeof saveRuleTemplateBodySchema>;

export interface SaveRuleTemplateRpcRequest {
  p_workspace_id: string;
  p_rule_set_id: string | null;
  p_name: string;
  p_description: string;
  p_business_objective: string;
  p_rule_definition: Record<string, unknown>;
  p_scoring_definition: Record<string, unknown>;
  p_change_note: string;
}

const savedRuleTemplateRpcRowSchema = z
  .object({
    rule_set_id: uuidSchema,
    rule_version_id: uuidSchema,
    version_number: z.number().int().positive(),
    status: z.literal("published"),
  })
  .strict();

export interface SavedRuleTemplateResponse {
  ruleSetId: string;
  ruleVersionId: string;
  versionNumber: number;
  status: "published";
}

/**
 * PostgREST returns table-valued RPCs as an array. Keeping the object form as a
 * supported input also makes contract tests independent from the transport,
 * while still rejecting empty/multi-row and schema-drifted responses.
 */
export function parseSavedRuleTemplateRpcResult(
  data: unknown,
): SavedRuleTemplateResponse | null {
  const row = Array.isArray(data) ? (data.length === 1 ? data[0] : null) : data;
  const parsed = savedRuleTemplateRpcRowSchema.safeParse(row);
  if (!parsed.success) return null;
  return {
    ruleSetId: parsed.data.rule_set_id,
    ruleVersionId: parsed.data.rule_version_id,
    versionNumber: parsed.data.version_number,
    status: parsed.data.status,
  };
}

export function toSaveRuleTemplateRpc(
  workspaceId: string,
  input: unknown,
): SaveRuleTemplateRpcRequest {
  const parsed = saveRuleTemplateBodySchema.parse(input);
  return {
    p_workspace_id: workspaceId,
    p_rule_set_id: parsed.ruleSetId ?? null,
    p_name: parsed.name,
    p_description: parsed.description,
    p_business_objective: parsed.businessObjective,
    p_rule_definition: parsed.ruleDefinition,
    p_scoring_definition: parsed.scoringDefinition,
    p_change_note: parsed.changeNote,
  };
}

export interface EnqueueWorkbenchRpcRequest {
  p_workspace_id: string;
  p_action: "start_ingestion" | "run_rules" | "create_export";
  p_payload: Record<string, unknown>;
  p_idempotency_key: string;
}

export function toIngestionRpc(
  workspaceId: string,
  input: unknown,
): EnqueueWorkbenchRpcRequest {
  const parsed = startIngestionQueryBodySchema.parse(input);
  return {
    p_workspace_id: workspaceId,
    p_action: "start_ingestion",
    p_payload: {
      source_connection_id: parsed.sourceConnectionId,
      job_kind: "query",
      ...(parsed.mappingVersionId
        ? { mapping_version_id: parsed.mappingVersionId }
        : {}),
      input_params: {
        query_kind: parsed.queryKind,
        ...(parsed.queryText ? { query_text: parsed.queryText } : {}),
        ...(parsed.listName ? { list_name: parsed.listName } : {}),
        criteria: parsed.criteria,
      },
    },
    p_idempotency_key: parsed.idempotencyKey,
  };
}

export function toRuleRunRpc(
  workspaceId: string,
  input: unknown,
): EnqueueWorkbenchRpcRequest {
  const parsed = startRuleRunBodySchema.parse(input);
  return {
    p_workspace_id: workspaceId,
    p_action: "run_rules",
    p_payload: {
      rule_version_id: parsed.ruleVersionId,
      company_list_id: parsed.companyListId,
      run_mode: parsed.runMode,
      engine_version: "lead-rules-v1",
      run_config: {},
    },
    p_idempotency_key: parsed.idempotencyKey,
  };
}

export function toExportRpc(
  workspaceId: string,
  input: unknown,
): EnqueueWorkbenchRpcRequest {
  const parsed = startExportBodySchema.parse(input);
  return {
    p_workspace_id: workspaceId,
    p_action: "create_export",
    p_payload: {
      ...(parsed.companyListId
        ? { company_list_id: parsed.companyListId }
        : {}),
      ...(parsed.ruleRunId ? { rule_run_id: parsed.ruleRunId } : {}),
      export_format: parsed.format,
      selected_fields: parsed.selectedFields ?? [...DEFAULT_EXPORT_FIELDS],
      filter_definition: parsed.decisions
        ? { decisions: parsed.decisions }
        : {},
    },
    p_idempotency_key: parsed.idempotencyKey,
  };
}

export function parseJsonRequestBody(rawBody: string): unknown {
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    throw new Error("请求体超过 128 KiB 限制");
  }
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new Error("请求体不是有效 JSON");
  }
}

const blockedOutputKey =
  /^(secret|secret_reference|raw_payload|input_params|connection_config|api[_-]?key|token|access[_-]?token|refresh[_-]?token|cloud[_-]?token|client[_-]?secret|password|authorization|private[_-]?key|credential|cookie)$/i;

export function sanitizeOutput(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeOutput);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (blockedOutputKey.test(key)) continue;
    result[key] = sanitizeOutput(child);
  }
  return result;
}
