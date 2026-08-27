import { z } from "zod";
import {
  companySearchCriteriaSchema,
  parseSavedRuleTemplateRpcResult,
  saveRuleTemplateBodySchema,
  sanitizeOutput,
  toSaveRuleTemplateRpc,
  type SavedRuleTemplateResponse,
  type SaveRuleTemplateRpcRequest,
} from "../workbench-api/contracts.ts";

export const READ_TOOL_NAMES = [
  "list_workspaces",
  "list_source_connections",
  "list_source_queries",
  "list_ingestion_jobs",
  "list_company_lists",
  "list_companies",
  "get_company_evidence_and_facts",
  "get_company_report_context",
  "read_company_report_evidence",
  "list_company_reports",
  "list_rule_sets",
  "list_rule_set_versions",
  "list_rule_runs",
  "list_rule_results",
  "list_exports",
] as const;

export const QUEUED_WRITE_TOOL_NAMES = [
  "start_ingestion_query",
  "run_ruleset",
  "start_export",
] as const;

export const WRITE_TOOL_NAMES = [
  "save_rule_template",
  "submit_company_report_analysis",
  ...QUEUED_WRITE_TOOL_NAMES,
] as const;

export const WORKBENCH_MCP_TOOL_NAMES = [
  ...READ_TOOL_NAMES,
  ...WRITE_TOOL_NAMES,
] as const;

export type WorkbenchMcpToolName = (typeof WORKBENCH_MCP_TOOL_NAMES)[number];
export type WorkbenchMcpWriteToolName = (typeof WRITE_TOOL_NAMES)[number];
export type WorkbenchMcpQueuedWriteToolName =
  (typeof QUEUED_WRITE_TOOL_NAMES)[number];

export const READ_RESOURCE_NAMES = [
  "workspaces",
  "source_connections",
  "source_queries",
  "ingestion_jobs",
  "company_lists",
  "company_list_members",
  "companies",
  "company_evidence",
  "company_field_facts",
  "company_reports",
  "rule_sets",
  "rule_set_versions",
  "rule_runs",
  "rule_results",
  "exports",
] as const;

export const READ_PROJECTIONS = {
  workspaces: "id,name,slug,status,created_at,updated_at",
  sourceConnections:
    "id,workspace_id,provider,name,connection_kind,status,has_secret_reference,capabilities,default_mapping_version_id,external_connection_id,last_verified_at,last_error_code,created_at,updated_at",
  sourceQueries:
    "id,workspace_id,source_connection_id,query_kind,query_text,criteria,criteria_hash,status,external_query_id,created_at,updated_at",
  ingestionJobs:
    "id,workspace_id,source_connection_id,source_query_id,mapping_version_id,job_kind,status,result,requested_at,started_at,completed_at,received_count,accepted_count,rejected_count,error_code,error_message,claimed_at,attempt_count,created_at,updated_at",
  companyLists:
    "id,workspace_id,name,description,status,source_query_id,ingestion_job_id,created_via,created_by_agent,agent_provider,created_at,updated_at",
  companies:
    "id,workspace_id,name,unified_social_credit_code,registration_number,organization_code,legal_representative,operating_status,company_type,registered_capital_amount,paid_in_capital_amount,registered_capital_currency,established_on,approved_on,registration_authority,business_scope,province,city,district,region_text,industry_code,industry_name,employee_count,insured_employee_count,personnel_scale_text,address,primary_source,last_verified_at,profile_status,completeness_score,created_at,updated_at",
  companyEvidence:
    "id,workspace_id,company_id,evidence_type,title,source_provider,source_url,excerpt,evidence_fingerprint,evidence_status,observed_at,captured_at,expires_at,created_at",
  companyFacts:
    "id,workspace_id,company_id,field_name,value_json,value_text,value_type,source_provider,evidence_id,confidence,observed_at,valid_from,valid_to,is_current,created_at",
  companyReports:
    "id,workspace_id,company_id,evidence_job_id,source_snapshot_id,revision,status,schema_version,agent_provider,agent_name,analysis,is_current,submitted_at,created_at,updated_at",
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

const DEFAULT_EXPORT_FIELDS = [
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

const uuidSchema = z.string().uuid();
const companyIdSchema = z.string().regex(/^[1-9][0-9]{0,18}$/);
const idempotencyKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
const limitSchema = z.number().int().min(1).max(100).default(50);
const providerSchema = z.enum([
  "qcc",
  "huoke_assistant",
  "file_upload",
  "web_search",
  "other",
]);

const workspaceScopedSchema = z.object({ workspaceId: uuidSchema }).strict();

export const listWorkspacesInputSchema = z.object({}).strict();

export const listSourceConnectionsInputSchema = workspaceScopedSchema
  .extend({
    provider: providerSchema.optional(),
    status: z
      .enum(["draft", "ready", "degraded", "disabled", "error"])
      .optional(),
    limit: limitSchema,
  })
  .strict();

export const listSourceQueriesInputSchema = workspaceScopedSchema
  .extend({
    sourceConnectionId: uuidSchema.optional(),
    status: z
      .enum([
        "draft",
        "pending_approval",
        "approved",
        "running",
        "completed",
        "failed",
        "cancelled",
      ])
      .optional(),
    limit: limitSchema,
  })
  .strict();

export const listIngestionJobsInputSchema = workspaceScopedSchema
  .extend({
    status: z
      .enum([
        "queued",
        "running",
        "completed",
        "partial",
        "failed",
        "cancelled",
      ])
      .optional(),
    jobKind: z
      .enum(["query", "import", "enrich", "refresh", "connection_test"])
      .optional(),
    limit: limitSchema,
  })
  .strict();

export const listCompanyListsInputSchema = workspaceScopedSchema
  .extend({
    status: z.enum(["active", "locked", "archived"]).optional(),
    limit: limitSchema,
  })
  .strict();

export const listCompaniesInputSchema = workspaceScopedSchema
  .extend({
    companyListId: uuidSchema.optional(),
    name: z.string().trim().min(1).max(200).optional(),
    limit: limitSchema,
  })
  .strict();

export const getCompanyEvidenceAndFactsInputSchema = workspaceScopedSchema
  .extend({
    companyId: companyIdSchema,
    currentFactsOnly: z.boolean().default(true),
    evidenceLimit: z.number().int().min(1).max(200).default(100),
    factLimit: z.number().int().min(1).max(500).default(200),
  })
  .strict();

export const getCompanyReportContextInputSchema = workspaceScopedSchema
  .extend({ evidenceJobId: uuidSchema })
  .strict();

export const readCompanyReportEvidenceInputSchema = workspaceScopedSchema
  .extend({
    evidenceJobId: uuidSchema,
    evidenceIds: z
      .array(z.string().regex(/^ev-[0-9]{3}$/))
      .min(1)
      .max(10)
      .refine(
        (values) => new Set(values).size === values.length,
        "证据编号不得重复",
      ),
  })
  .strict();

export const listCompanyReportsInputSchema = workspaceScopedSchema
  .extend({
    companyId: companyIdSchema.optional(),
    evidenceJobId: uuidSchema.optional(),
    currentOnly: z.boolean().default(true),
    limit: limitSchema,
  })
  .strict();

const reportText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) =>
        ![...value].some((character) => {
          const code = character.charCodeAt(0);
          return code < 32 && code !== 9 && code !== 10 && code !== 13;
        }),
      "文本包含控制字符",
    );
const internalReportTokenPattern =
  /(?:\bev-[0-9]{3}\b|\bUSCC\b|\b(?:broad_context|related_entity|exact_company|paid_in(?:_capital)?|paidInCapital|insuredCount|company_detail)\b|tags\.risk|evidenceIds?|\\[_*()[\]{}#])/i;
const customerFacingReportText = (max: number) =>
  reportText(max).refine(
    (value) => !internalReportTokenPattern.test(value),
    "客户可见文字不得包含证据编号、内部字段名、枚举值或转义标记；证据编号只能放在 evidenceIds",
  );
const evidenceIdArray = z
  .array(z.string().regex(/^ev-[0-9]{3}$/))
  .min(1)
  .max(10)
  .refine(
    (values) => new Set(values).size === values.length,
    "证据编号不得重复",
  );
const reportInsightSchema = z
  .object({
    title: customerFacingReportText(120),
    summary: customerFacingReportText(800),
    confidence: z.enum(["high", "medium", "low"]),
    evidenceIds: evidenceIdArray,
    happenedAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export const companyAgentAnalysisSchema = z
  .object({
    schemaVersion: z.literal("company-agent-analysis.v1"),
    title: customerFacingReportText(160).optional(),
    executiveSummary: customerFacingReportText(1200),
    executiveEvidenceIds: evidenceIdArray,
    businessProfile: z.array(reportInsightSchema).max(6),
    growthSignals: z.array(reportInsightSchema).max(6),
    recentEvents: z.array(reportInsightSchema).max(8),
    opportunities: z.array(reportInsightSchema).max(6),
    risks: z.array(reportInsightSchema).max(6),
    recommendedActions: z.array(reportInsightSchema).max(6),
    limitations: z.array(customerFacingReportText(400)).max(6),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      new TextEncoder().encode(JSON.stringify(value)).byteLength >
      12 * 1024
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "分析内容过长，请合并重复判断并精简摘要",
      });
    }
  });

export const submitCompanyReportAnalysisInputSchema = workspaceScopedSchema
  .extend({
    evidenceJobId: uuidSchema,
    agentProvider: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,63}$/),
    agentName: reportText(120),
    analysis: companyAgentAnalysisSchema.describe(
      "紧凑的结构化分析；建议不超过 8 KiB，每个分区只保留 2–4 条最有价值的判断。",
    ),
  })
  .strict();

export const listRuleSetsInputSchema = workspaceScopedSchema
  .extend({
    status: z.enum(["draft", "active", "archived"]).optional(),
    limit: limitSchema,
  })
  .strict();

export const listRuleSetVersionsInputSchema = workspaceScopedSchema
  .extend({
    ruleSetId: uuidSchema,
    status: z.enum(["draft", "published", "retired"]).optional(),
    limit: limitSchema,
  })
  .strict();

export const listRuleRunsInputSchema = workspaceScopedSchema
  .extend({
    companyListId: uuidSchema.optional(),
    ruleVersionId: uuidSchema.optional(),
    status: z
      .enum([
        "queued",
        "running",
        "completed",
        "partial",
        "failed",
        "cancelled",
      ])
      .optional(),
    limit: limitSchema,
  })
  .strict();

export const listRuleResultsInputSchema = workspaceScopedSchema
  .extend({
    ruleRunId: uuidSchema,
    decision: z.enum(["include", "exclude", "needs_review"]).optional(),
    limit: z.number().int().min(1).max(500).default(200),
  })
  .strict();

export const listExportsInputSchema = workspaceScopedSchema
  .extend({
    status: z
      .enum([
        "queued",
        "running",
        "completed",
        "failed",
        "expired",
        "cancelled",
      ])
      .optional(),
    limit: limitSchema,
  })
  .strict();

const lookupCriteriaSchema = z
  .object({
    searchKey: z.string().trim().min(2).max(160).optional(),
    companyName: z.string().trim().min(2).max(160).optional(),
    creditCode: z.string().trim().min(2).max(160).optional(),
  })
  .strict()
  .refine(
    (value) =>
      Boolean(value.searchKey || value.companyName || value.creditCode),
    "需要企业名称或统一社会信用代码",
  );

const webEvidenceCriteriaSchema = z
  .object({
    companyId: companyIdSchema,
    claimType: z.literal("public_report"),
    reportMode: z.literal(true),
    maxResults: z.number().int().min(1).max(8).default(6),
  })
  .strict();

const ingestionQueryCommon = {
  workspaceId: uuidSchema,
  sourceConnectionId: uuidSchema,
  queryText: z.string().trim().min(1).max(2_000).optional(),
  listName: z.string().trim().min(2).max(120).optional(),
  mappingVersionId: uuidSchema.optional(),
  origin: z
    .object({
      channel: z.literal("agent"),
      provider: z
        .string()
        .trim()
        .min(2)
        .max(64)
        .regex(/^[a-z0-9][a-z0-9._-]*$/),
      agentName: z.string().trim().min(2).max(80),
    })
    .strict()
    .optional(),
  idempotencyKey: idempotencyKeySchema,
};

export const startIngestionQueryInputSchema = z.discriminatedUnion(
  "queryKind",
  [
    z
      .object({
        ...ingestionQueryCommon,
        queryKind: z.literal("company_search"),
        listName: z.string().trim().min(2).max(120),
        criteria: companySearchCriteriaSchema,
      })
      .strict(),
    z
      .object({
        ...ingestionQueryCommon,
        queryKind: z.literal("company_detail"),
        criteria: lookupCriteriaSchema,
      })
      .strict(),
    z
      .object({
        ...ingestionQueryCommon,
        queryKind: z.literal("risk_enrichment"),
        criteria: lookupCriteriaSchema,
      })
      .strict(),
    z
      .object({
        ...ingestionQueryCommon,
        queryKind: z.literal("web_evidence"),
        criteria: webEvidenceCriteriaSchema,
      })
      .strict(),
  ],
);

/**
 * MCP tool inputs must expose an object at the root. The authoritative
 * discriminated union above is valid application input, but the MCP SDK cannot
 * normalize a top-level union and otherwise advertises an empty parameter
 * object. This boundary schema keeps the root object-shaped; the enqueue layer
 * still validates the queryKind/criteria pairing with the union above.
 */
export const startIngestionQueryMcpInputSchema = z
  .object({
    ...ingestionQueryCommon,
    queryKind: z
      .enum([
        "company_search",
        "company_detail",
        "risk_enrichment",
        "web_evidence",
      ])
      .describe("查询类型。企业名单检索使用 company_search。"),
    criteria: z
      .union([
        companySearchCriteriaSchema,
        lookupCriteriaSchema,
        webEvidenceCriteriaSchema,
      ])
      .describe("与 queryKind 对应的筛选条件；最终仍按正式查询合同严格校验。"),
  })
  .strict();

export const runRulesetInputSchema = workspaceScopedSchema
  .extend({
    ruleVersionId: uuidSchema,
    companyListId: uuidSchema,
    runMode: z.enum(["sample", "full"]).default("full"),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const saveRuleTemplateInputSchema =
  saveRuleTemplateBodySchema.safeExtend({
    workspaceId: uuidSchema.describe("目标工作空间 UUID。"),
  });

export function toSaveRuleTemplateMcpRpc(
  input: unknown,
): SaveRuleTemplateRpcRequest {
  const parsed = saveRuleTemplateInputSchema.parse(input);
  const { workspaceId, ...body } = parsed;
  return toSaveRuleTemplateRpc(workspaceId, body);
}

export function parseSavedRuleTemplateMcpResult(
  data: unknown,
): SavedRuleTemplateResponse | null {
  return parseSavedRuleTemplateRpcResult(data);
}

/** Keep MCP text and structured output on the same domain redaction policy. */
export function sanitizeMcpOutput(value: unknown): unknown {
  return sanitizeOutput(value);
}

const exportFieldSchema = z.enum(EXPORT_FIELD_NAMES);
const exportDecisionSchema = z.enum([
  "include",
  "exclude",
  "needs_review",
  "unscored",
]);

export const startExportInputSchema = workspaceScopedSchema
  .extend({
    companyListId: uuidSchema.optional(),
    ruleRunId: uuidSchema.optional(),
    format: z.enum(["csv", "xlsx", "json", "html"]),
    selectedFields: z
      .array(exportFieldSchema)
      .min(1)
      .max(EXPORT_FIELD_NAMES.length)
      .refine(
        (fields) => new Set(fields).size === fields.length,
        "导出字段不得重复",
      )
      .optional(),
    decisions: z
      .array(exportDecisionSchema)
      .min(1)
      .max(4)
      .refine(
        (values) => new Set(values).size === values.length,
        "决策筛选值不得重复",
      )
      .optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict()
  .refine(
    (value) => Boolean(value.companyListId || value.ruleRunId),
    "导出必须指定企业名单或规则运行",
  );

export interface EnqueueWorkbenchRpcRequest {
  p_workspace_id: string;
  p_action: "start_ingestion" | "run_rules" | "create_export";
  p_payload: Record<string, unknown>;
  p_idempotency_key: string;
}

export function toEnqueueWorkbenchRpc(
  toolName: WorkbenchMcpQueuedWriteToolName,
  input: unknown,
): EnqueueWorkbenchRpcRequest {
  if (toolName === "start_ingestion_query") {
    const parsed = startIngestionQueryInputSchema.parse(input);
    return {
      p_workspace_id: parsed.workspaceId,
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
          ...(parsed.origin ? { origin: parsed.origin } : {}),
          criteria: parsed.criteria,
        },
      },
      p_idempotency_key: parsed.idempotencyKey,
    };
  }

  if (toolName === "run_ruleset") {
    const parsed = runRulesetInputSchema.parse(input);
    return {
      p_workspace_id: parsed.workspaceId,
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

  const parsed = startExportInputSchema.parse(input);
  return {
    p_workspace_id: parsed.workspaceId,
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
