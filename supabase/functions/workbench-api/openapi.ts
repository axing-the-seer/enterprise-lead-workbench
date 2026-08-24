import {
  COMPANY_LIST_STATUSES,
  COMPANY_PROFILE_STATUSES,
  EVIDENCE_STATUSES,
  EXPORT_FIELD_NAMES,
  EXPORT_STATUSES,
  INGESTION_JOB_STATUSES,
  RULE_DECISIONS,
  RULE_RUN_STATUSES,
  RULE_SET_STATUSES,
  RULE_VERSION_STATUSES,
  SOURCE_CONNECTION_STATUSES,
  SOURCE_QUERY_STATUSES,
  WORKSPACE_STATUSES,
} from "./contracts.ts";

type JsonSchema = Record<string, unknown>;
type OpenApiOperation = Record<string, unknown>;

const string = { type: "string" };
const nullableString = { type: ["string", "null"] };
const uuid = { type: "string", format: "uuid" };
const nullableUuid = { type: ["string", "null"], format: "uuid" };
const date = { type: ["string", "null"], format: "date" };
const dateTime = { type: ["string", "null"], format: "date-time" };
const requiredDateTime = { type: "string", format: "date-time" };
const integer = { type: "integer" };
const nullableInteger = { type: ["integer", "null"] };
const number = { type: ["number", "null"] };
const jsonValue = {};

function objectSchema(
  properties: Record<string, JsonSchema>,
  required: string[] = Object.keys(properties),
): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required,
  };
}

function enumSchema(values: readonly string[], nullable = false): JsonSchema {
  return nullable
    ? { type: ["string", "null"], enum: [...values, null] }
    : { type: "string", enum: [...values] };
}

function listResponseSchema(itemRef: string): JsonSchema {
  return objectSchema({
    data: { type: "array", items: { $ref: itemRef } },
    pagination: { $ref: "#/components/schemas/Pagination" },
  });
}

const errorResponse = {
  description: "请求失败；错误信息不包含数据库详情或供应商凭证。",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ErrorResponse" },
    },
  },
};

function listResponses(itemSchema: string) {
  return {
    "200": {
      description: "读取成功",
      content: {
        "application/json": {
          schema: listResponseSchema(`#/components/schemas/${itemSchema}`),
        },
      },
    },
    "400": errorResponse,
    "401": errorResponse,
    "500": errorResponse,
  };
}

function detailResponses(itemSchema: string) {
  return {
    "200": {
      description: "读取成功",
      content: {
        "application/json": {
          schema: objectSchema({
            data: { $ref: `#/components/schemas/${itemSchema}` },
          }),
        },
      },
    },
    "400": errorResponse,
    "401": errorResponse,
    "404": errorResponse,
    "500": errorResponse,
  };
}

function enqueueResponses() {
  return {
    "202": {
      description: "任务已进入后台队列；重复的幂等键返回原任务。",
      content: {
        "application/json": {
          schema: objectSchema({
            data: { $ref: "#/components/schemas/EnqueuedJob" },
          }),
        },
      },
    },
    "400": errorResponse,
    "401": errorResponse,
    "403": errorResponse,
    "404": errorResponse,
    "409": errorResponse,
    "413": errorResponse,
    "415": errorResponse,
    "500": errorResponse,
  };
}

const workspaceParameter = {
  name: "workspaceId",
  in: "path",
  required: true,
  schema: uuid,
  description: "工作空间 UUID；数据库 RLS 会再次校验成员权限。",
};

function pathParameter(name: string, schema: JsonSchema, description: string) {
  return { name, in: "path", required: true, schema, description };
}

const paginationParameters = [
  {
    name: "limit",
    in: "query",
    required: false,
    schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
  },
  {
    name: "offset",
    in: "query",
    required: false,
    schema: { type: "integer", minimum: 0, maximum: 100000, default: 0 },
  },
];

function queryEnum(name: string, values: readonly string[]) {
  return {
    name,
    in: "query",
    required: false,
    schema: enumSchema(values),
  };
}

function protectedGet(
  operationId: string,
  summary: string,
  itemSchema: string,
  parameters: unknown[],
): OpenApiOperation {
  return {
    operationId,
    summary,
    security: [{ bearerAuth: [] }],
    parameters,
    responses: listResponses(itemSchema),
  };
}

function protectedPost(
  operationId: string,
  summary: string,
  requestSchema: string,
): OpenApiOperation {
  return {
    operationId,
    summary,
    description:
      "仅创建异步任务。处理过程使用同一领域队列，不在 HTTP 请求中直接调用供应商。",
    security: [{ bearerAuth: [] }],
    parameters: [workspaceParameter],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: `#/components/schemas/${requestSchema}` },
        },
      },
    },
    responses: enqueueResponses(),
  };
}

function protectedDomainPost(
  operationId: string,
  summary: string,
  description: string,
  requestSchema: string,
  responseSchema: string,
): OpenApiOperation {
  return {
    operationId,
    summary,
    description,
    security: [{ bearerAuth: [] }],
    parameters: [workspaceParameter],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: `#/components/schemas/${requestSchema}` },
        },
      },
    },
    responses: {
      "200": {
        description: "保存成功；完全相同的重试返回原版本。",
        content: {
          "application/json": {
            schema: objectSchema({
              data: { $ref: `#/components/schemas/${responseSchema}` },
            }),
          },
        },
      },
      "400": errorResponse,
      "401": errorResponse,
      "403": errorResponse,
      "404": errorResponse,
      "409": errorResponse,
      "413": errorResponse,
      "415": errorResponse,
      "500": errorResponse,
    },
  };
}

const companyProperties: Record<string, JsonSchema> = {
  id: { type: "integer", format: "int64" },
  workspace_id: uuid,
  name: string,
  unified_social_credit_code: nullableString,
  registration_number: nullableString,
  organization_code: nullableString,
  legal_representative: nullableString,
  operating_status: nullableString,
  company_type: nullableString,
  registered_capital_amount: number,
  paid_in_capital_amount: number,
  registered_capital_currency: string,
  established_on: date,
  approved_on: date,
  registration_authority: nullableString,
  business_scope: nullableString,
  province: nullableString,
  city: nullableString,
  district: nullableString,
  region_text: nullableString,
  industry_code: nullableString,
  industry_name: nullableString,
  employee_count: nullableInteger,
  insured_employee_count: nullableInteger,
  personnel_scale_text: nullableString,
  address: nullableString,
  primary_source: nullableString,
  last_verified_at: dateTime,
  profile_status: enumSchema(COMPANY_PROFILE_STATUSES),
  completeness_score: number,
  created_at: requiredDateTime,
  updated_at: requiredDateTime,
};

const numericRangeOpenApi = objectSchema(
  {
    min: { type: "number", minimum: 0 },
    max: { type: "number", minimum: 0 },
  },
  [],
);
const dateRangeOpenApi = objectSchema({
  start: { type: "string", format: "date" },
  end: { type: "string", format: "date" },
});
const catalogSelectionOpenApi = objectSchema({
  label: { type: "string", minLength: 1, maxLength: 120 },
  providerValues: {
    type: "array",
    minItems: 1,
    maxItems: 500,
    items: { type: "string", minLength: 2, maxLength: 120 },
  },
});
const ingestionRequestCommonProperties: Record<string, JsonSchema> = {
  sourceConnectionId: uuid,
  queryText: { type: "string", minLength: 1, maxLength: 2000 },
  mappingVersionId: uuid,
  idempotencyKey: {
    type: "string",
    minLength: 16,
    maxLength: 128,
    pattern: "^[A-Za-z0-9._:-]+$",
  },
};

const schemas: Record<string, JsonSchema> = {
  Pagination: objectSchema({
    limit: { type: "integer", minimum: 1, maximum: 100 },
    offset: { type: "integer", minimum: 0 },
    returned: { type: "integer", minimum: 0, maximum: 100 },
  }),
  ErrorResponse: objectSchema({
    error: objectSchema(
      {
        code: string,
        message: string,
        issues: {
          type: "array",
          items: objectSchema({ path: string, message: string }),
        },
      },
      ["code", "message"],
    ),
  }),
  EnqueuedJob: objectSchema({
    jobId: uuid,
    jobType: enumSchema(["ingestion_job", "rule_run", "export"]),
    status: enumSchema([
      "queued",
      "running",
      "completed",
      "partial",
      "failed",
      "expired",
      "cancelled",
    ]),
  }),
  Workspace: objectSchema({
    id: uuid,
    name: string,
    slug: string,
    status: enumSchema(WORKSPACE_STATUSES),
    created_at: requiredDateTime,
    updated_at: requiredDateTime,
  }),
  SourceConnection: objectSchema({
    id: uuid,
    workspace_id: uuid,
    provider: enumSchema([
      "qcc",
      "huoke_assistant",
      "file_upload",
      "web_search",
      "other",
    ]),
    name: string,
    connection_kind: enumSchema([
      "mcp",
      "api",
      "cli",
      "upload",
      "web_search",
      "other",
    ]),
    status: enumSchema(SOURCE_CONNECTION_STATUSES),
    has_secret_reference: { type: "boolean" },
    capabilities: { type: "array", items: string },
    default_mapping_version_id: nullableUuid,
    external_connection_id: nullableString,
    last_verified_at: dateTime,
    last_error_code: nullableString,
    created_at: requiredDateTime,
    updated_at: requiredDateTime,
  }),
  SourceQuery: objectSchema({
    id: uuid,
    workspace_id: uuid,
    source_connection_id: uuid,
    query_kind: enumSchema([
      "company_search",
      "company_detail",
      "risk_enrichment",
      "qualification_enrichment",
      "tender_search",
      "file_import",
      "web_evidence",
      "other",
    ]),
    query_text: nullableString,
    criteria: { type: "object", additionalProperties: true },
    criteria_hash: string,
    status: enumSchema(SOURCE_QUERY_STATUSES),
    external_query_id: nullableString,
    created_at: requiredDateTime,
    updated_at: requiredDateTime,
  }),
  IngestionJob: objectSchema({
    id: uuid,
    workspace_id: uuid,
    source_connection_id: uuid,
    source_query_id: nullableUuid,
    mapping_version_id: nullableUuid,
    job_kind: enumSchema([
      "query",
      "import",
      "enrich",
      "refresh",
      "connection_test",
    ]),
    status: enumSchema(INGESTION_JOB_STATUSES),
    requested_at: requiredDateTime,
    started_at: dateTime,
    completed_at: dateTime,
    received_count: integer,
    accepted_count: integer,
    rejected_count: integer,
    error_code: nullableString,
    claimed_at: dateTime,
    attempt_count: integer,
    created_at: requiredDateTime,
    updated_at: requiredDateTime,
  }),
  CompanyList: objectSchema({
    id: uuid,
    workspace_id: uuid,
    name: string,
    description: nullableString,
    status: enumSchema(COMPANY_LIST_STATUSES),
    source_query_id: nullableUuid,
    ingestion_job_id: nullableUuid,
    created_at: requiredDateTime,
    updated_at: requiredDateTime,
  }),
  Company: objectSchema(companyProperties),
  CompanyListCompany: objectSchema({
    ...companyProperties,
    membership_status: enumSchema(["included", "excluded", "needs_review"]),
    added_at: requiredDateTime,
  }),
  CompanyEvidence: objectSchema({
    id: uuid,
    workspace_id: uuid,
    company_id: { type: "integer", format: "int64" },
    evidence_type: enumSchema([
      "registration",
      "operation",
      "risk",
      "qualification",
      "tender",
      "web",
      "uploaded_document",
      "manual_note",
      "other",
    ]),
    title: string,
    source_provider: string,
    source_url: nullableString,
    excerpt: nullableString,
    evidence_fingerprint: string,
    evidence_status: enumSchema(EVIDENCE_STATUSES),
    observed_at: dateTime,
    captured_at: requiredDateTime,
    expires_at: dateTime,
    created_at: requiredDateTime,
  }),
  CompanyFact: objectSchema({
    id: uuid,
    workspace_id: uuid,
    company_id: { type: "integer", format: "int64" },
    field_name: string,
    value_json: jsonValue,
    value_text: nullableString,
    value_type: enumSchema([
      "string",
      "number",
      "boolean",
      "date",
      "datetime",
      "money",
      "array",
      "object",
      "null",
    ]),
    source_provider: string,
    evidence_id: nullableUuid,
    confidence: number,
    observed_at: dateTime,
    valid_from: dateTime,
    valid_to: dateTime,
    is_current: { type: "boolean" },
    created_at: requiredDateTime,
  }),
  RuleSet: objectSchema({
    id: uuid,
    workspace_id: uuid,
    name: string,
    description: nullableString,
    business_objective: nullableString,
    status: enumSchema(RULE_SET_STATUSES),
    current_version_number: nullableInteger,
    created_at: requiredDateTime,
    updated_at: requiredDateTime,
  }),
  RuleSetVersion: objectSchema({
    id: uuid,
    workspace_id: uuid,
    rule_set_id: uuid,
    version_number: integer,
    status: enumSchema(RULE_VERSION_STATUSES),
    rule_definition: { type: "object", additionalProperties: true },
    scoring_definition: { type: "object", additionalProperties: true },
    canonical_schema_version: string,
    change_note: nullableString,
    created_at: requiredDateTime,
    published_at: dateTime,
  }),
  RuleOperator: enumSchema([
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
  ]),
  EligibilityCondition: objectSchema(
    {
      id: { type: "string", minLength: 1, maxLength: 120 },
      label: { type: "string", minLength: 1, maxLength: 300 },
      field: { type: "string", minLength: 1, maxLength: 300 },
      operator: { $ref: "#/components/schemas/RuleOperator" },
      value: jsonValue,
      missingPolicy: enumSchema(["review", "pass", "fail"]),
      enabled: { type: "boolean" },
    },
    ["id", "label", "field", "operator", "missingPolicy", "enabled"],
  ),
  EligibilityGroup: objectSchema({
    id: { type: "string", minLength: 1, maxLength: 120 },
    combinator: enumSchema(["and", "or"]),
    rules: {
      type: "array",
      minItems: 1,
      maxItems: 200,
      items: { $ref: "#/components/schemas/EligibilityNode" },
    },
  }),
  EligibilityNode: {
    oneOf: [
      { $ref: "#/components/schemas/EligibilityCondition" },
      { $ref: "#/components/schemas/EligibilityGroup" },
    ],
  },
  EligibilityConfig: {
    ...objectSchema({
      root: { $ref: "#/components/schemas/EligibilityGroup" },
      onNoMatch: { const: "exclude" },
      onUnknown: enumSchema(["review", "exclude", "pass"]),
    }),
    description:
      "可选的硬准入条件树。条件组最多5层，全树最多200个叶子条件，所有组和条件 id 必须唯一。",
  },
  LeadRule: objectSchema(
    {
      id: { type: "string", minLength: 1, maxLength: 120 },
      label: { type: "string", minLength: 1, maxLength: 300 },
      kind: enumSchema(["priority", "risk_gate"]),
      field: { type: "string", minLength: 1, maxLength: 300 },
      operator: { $ref: "#/components/schemas/RuleOperator" },
      value: jsonValue,
      weight: { type: "number", minimum: 0, default: 0 },
      onMatch: {
        ...enumSchema(["score", "review", "block"]),
        default: "score",
      },
      missingPolicy: {
        ...enumSchema(["review", "pass", "fail"]),
        default: "review",
      },
      enabled: { type: "boolean", default: true },
    },
    ["id", "label", "kind", "field", "operator"],
  ),
  RuleThresholds: {
    ...objectSchema(
      {
        p1: { type: "number", minimum: 0, maximum: 100 },
        p2: { type: "number", minimum: 0, maximum: 100 },
        minimumCompleteness: {
          type: "number",
          minimum: 0,
          maximum: 100,
          default: 60,
        },
      },
      ["p1", "p2"],
    ),
    description: "P1 必须大于或等于 P2。",
  },
  RuleTemplateDefinitionV1: {
    ...objectSchema(
      {
        id: {
          type: "string",
          minLength: 1,
          maxLength: 120,
          description: "可省略；保存时由服务端覆盖为真实规则集 UUID。",
        },
        name: {
          type: "string",
          minLength: 1,
          maxLength: 160,
          description: "可省略；保存时由服务端覆盖为请求顶层 name。",
        },
        eligibility: { $ref: "#/components/schemas/EligibilityConfig" },
        rules: {
          type: "array",
          maxItems: 200,
          items: { $ref: "#/components/schemas/LeadRule" },
        },
        thresholds: { $ref: "#/components/schemas/RuleThresholds" },
      },
      ["rules", "thresholds"],
    ),
    description:
      "RuleTemplate v1 发布定义。字段值中不得嵌入 API Key、Token、Cookie 或其他凭证。",
  },
  RuleScoringDefinition: objectSchema({
    engineVersion: { const: "lead-rules-v1" },
  }),
  SaveRuleTemplateRequest: {
    ...objectSchema(
      {
        ruleSetId: {
          ...uuid,
          description:
            "新建时省略；发布新版本时传入同一工作空间内的规则集 UUID。",
        },
        name: { type: "string", minLength: 1, maxLength: 160 },
        description: { type: "string", maxLength: 4000, default: "" },
        businessObjective: {
          type: "string",
          minLength: 1,
          maxLength: 2000,
        },
        ruleDefinition: {
          $ref: "#/components/schemas/RuleTemplateDefinitionV1",
        },
        scoringDefinition: {
          $ref: "#/components/schemas/RuleScoringDefinition",
          default: { engineVersion: "lead-rules-v1" },
          description: "可省略；当前只接受固定引擎 lead-rules-v1。",
        },
        changeNote: {
          type: "string",
          maxLength: 1000,
          default: "通过领域 API 发布。",
        },
      },
      ["name", "businessObjective", "ruleDefinition"],
    ),
    description:
      "原子创建规则集或发布不可变新版本。请求体不得超过128 KiB；完全相同的重试返回已有版本。",
    example: {
      name: "制造业客户分层",
      description: "根据可追溯企业字段进行准入与优先级判定",
      businessObjective: "筛选参保人数达到要求且证据完整的目标企业",
      ruleDefinition: {
        eligibility: {
          root: {
            id: "eligibility-root",
            combinator: "and",
            rules: [
              {
                id: "insured-count",
                label: "参保人数不低于20",
                field: "insuredCount",
                operator: "gte",
                value: 20,
                missingPolicy: "review",
                enabled: true,
              },
            ],
          },
          onNoMatch: "exclude",
          onUnknown: "review",
        },
        rules: [],
        thresholds: { p1: 75, p2: 50, minimumCompleteness: 60 },
      },
      changeNote: "初始版本",
    },
  },
  SavedRuleTemplate: objectSchema({
    ruleSetId: uuid,
    ruleVersionId: uuid,
    versionNumber: { type: "integer", minimum: 1 },
    status: { const: "published" },
  }),
  RuleRun: objectSchema({
    id: uuid,
    workspace_id: uuid,
    rule_version_id: uuid,
    company_list_id: uuid,
    run_mode: enumSchema(["sample", "full"]),
    status: enumSchema(RULE_RUN_STATUSES),
    engine_version: string,
    input_manifest_hash: string,
    requested_at: requiredDateTime,
    started_at: dateTime,
    completed_at: dateTime,
    total_count: integer,
    included_count: integer,
    excluded_count: integer,
    review_count: integer,
    error_code: nullableString,
    claimed_at: dateTime,
    attempt_count: integer,
    created_at: requiredDateTime,
    updated_at: requiredDateTime,
  }),
  RuleResult: objectSchema({
    id: uuid,
    workspace_id: uuid,
    rule_run_id: uuid,
    company_id: { type: "integer", format: "int64" },
    decision: enumSchema(RULE_DECISIONS),
    score: number,
    matched_rules: { type: "array", items: jsonValue },
    failed_rules: { type: "array", items: jsonValue },
    missing_fields: { type: "array", items: string },
    evaluated_values: { type: "object", additionalProperties: true },
    result_hash: string,
    evaluated_at: requiredDateTime,
    created_at: requiredDateTime,
  }),
  Export: objectSchema({
    id: uuid,
    workspace_id: uuid,
    company_list_id: nullableUuid,
    rule_run_id: nullableUuid,
    export_format: enumSchema(["csv", "xlsx", "json", "html"]),
    status: enumSchema(EXPORT_STATUSES),
    selected_fields: { type: "array", items: enumSchema(EXPORT_FIELD_NAMES) },
    storage_bucket: nullableString,
    storage_path: nullableString,
    checksum_sha256: nullableString,
    file_size_bytes: nullableInteger,
    row_count: nullableInteger,
    requested_at: requiredDateTime,
    completed_at: dateTime,
    expires_at: dateTime,
    error_code: nullableString,
    claimed_at: dateTime,
    attempt_count: integer,
    created_at: requiredDateTime,
    updated_at: requiredDateTime,
  }),
  NumericRange: {
    ...numericRangeOpenApi,
    minProperties: 1,
    description: "至少提供 min 或 max；同时提供时 min 不得大于 max。",
  },
  DateRange: dateRangeOpenApi,
  CatalogSelection: catalogSelectionOpenApi,
  KcCompanySearchCriteria: {
    ...objectSchema(
      {
        keyword: { type: "string", minLength: 2, maxLength: 100 },
        page: { type: "integer", minimum: 1, default: 1 },
        pageSize: {
          type: "integer",
          minimum: 1,
          maximum: 10,
          default: 10,
        },
        regions: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: { $ref: "#/components/schemas/CatalogSelection" },
        },
        industries: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: { $ref: "#/components/schemas/CatalogSelection" },
        },
        statuses: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: { type: "string", minLength: 1, maxLength: 30 },
        },
        enterpriseTypes: {
          type: "array",
          minItems: 1,
          maxItems: 2,
          uniqueItems: true,
          items: enumSchema(["individual", "cooperative", "company"]),
        },
        contactRequirements: {
          type: "array",
          minItems: 1,
          maxItems: 2,
          uniqueItems: true,
          items: enumSchema(["phone", "email"]),
        },
        riskFlags: objectSchema(
          {
            businessAbnormal: enumSchema(["has", "none"]),
            equityFreeze: enumSchema(["has", "none"]),
            severeViolation: enumSchema(["has", "none"]),
            administrativePenalty: enumSchema(["has", "none"]),
          },
          [],
        ),
        qualificationTags: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          items: { type: "string", minLength: 1, maxLength: 80 },
        },
        actualOperatingOnly: { type: "boolean" },
        smallBusinessOnly: { type: "boolean" },
        registeredCapitalWan: {
          type: "array",
          minItems: 1,
          maxItems: 10,
          items: { $ref: "#/components/schemas/NumericRange" },
        },
        insuredCount: {
          type: "array",
          minItems: 1,
          maxItems: 10,
          items: { $ref: "#/components/schemas/NumericRange" },
        },
        legalPersonSharePercent: {
          type: "array",
          minItems: 1,
          maxItems: 10,
          items: { $ref: "#/components/schemas/NumericRange" },
        },
        establishedBetween: {
          type: "array",
          minItems: 1,
          maxItems: 10,
          items: { $ref: "#/components/schemas/DateRange" },
        },
        legalChangedBetween: {
          type: "array",
          minItems: 1,
          maxItems: 10,
          items: { $ref: "#/components/schemas/DateRange" },
        },
        legalUnchangedBetween: {
          type: "array",
          minItems: 1,
          maxItems: 10,
          items: { $ref: "#/components/schemas/DateRange" },
        },
      },
      [],
    ),
    anyOf: [
      { required: ["keyword"] },
      { required: ["regions"] },
      { required: ["industries"] },
      { required: ["statuses"] },
      { required: ["enterpriseTypes"] },
      { required: ["contactRequirements"] },
      { required: ["riskFlags"] },
      { required: ["qualificationTags"] },
      {
        required: ["actualOperatingOnly"],
        properties: { actualOperatingOnly: { const: true } },
      },
      {
        required: ["smallBusinessOnly"],
        properties: { smallBusinessOnly: { const: true } },
      },
      { required: ["registeredCapitalWan"] },
      { required: ["insuredCount"] },
      { required: ["legalPersonSharePercent"] },
      { required: ["establishedBetween"] },
      { required: ["legalChangedBetween"] },
      { required: ["legalUnchangedBetween"] },
    ],
  },
  CompanyDetailCriteria: {
    ...objectSchema(
      {
        searchKey: { type: "string", minLength: 2, maxLength: 160 },
        companyName: { type: "string", minLength: 2, maxLength: 160 },
        creditCode: { type: "string", minLength: 2, maxLength: 160 },
      },
      [],
    ),
    anyOf: [
      { required: ["searchKey"] },
      { required: ["companyName"] },
      { required: ["creditCode"] },
    ],
  },
  RiskEnrichmentCriteria: {
    ...objectSchema(
      {
        searchKey: { type: "string", minLength: 2, maxLength: 100 },
        companyName: { type: "string", minLength: 2, maxLength: 100 },
        creditCode: { type: "string", minLength: 2, maxLength: 100 },
      },
      [],
    ),
    anyOf: [
      { required: ["searchKey"] },
      { required: ["companyName"] },
      { required: ["creditCode"] },
    ],
  },
  WebEvidenceCriteria: objectSchema(
    {
      companyId: {
        type: "string",
        pattern: "^[1-9][0-9]{0,18}$",
        description: "已存在且属于当前工作空间的企业 ID",
      },
      claimType: {
        type: "string",
        enum: [
          "official_website",
          "product",
          "award",
          "tender",
          "recruiting",
          "news",
          "other",
        ],
      },
      extraKeywords: {
        type: "array",
        maxItems: 8,
        items: { type: "string", minLength: 1, maxLength: 40 },
      },
      site: {
        type: "string",
        maxLength: 253,
        description: "可选的单一站点域名，不包含协议或路径",
      },
      maxResults: {
        type: "integer",
        minimum: 1,
        maximum: 10,
        default: 10,
      },
    },
    ["companyId", "claimType"],
  ),
  StartCompanySearchRequest: objectSchema(
    {
      ...ingestionRequestCommonProperties,
      queryKind: { const: "company_search" },
      criteria: { $ref: "#/components/schemas/KcCompanySearchCriteria" },
    },
    ["sourceConnectionId", "queryKind", "criteria", "idempotencyKey"],
  ),
  StartCompanyDetailRequest: objectSchema(
    {
      ...ingestionRequestCommonProperties,
      queryKind: { const: "company_detail" },
      criteria: { $ref: "#/components/schemas/CompanyDetailCriteria" },
    },
    ["sourceConnectionId", "queryKind", "criteria", "idempotencyKey"],
  ),
  StartRiskEnrichmentRequest: objectSchema(
    {
      ...ingestionRequestCommonProperties,
      queryKind: { const: "risk_enrichment" },
      criteria: { $ref: "#/components/schemas/RiskEnrichmentCriteria" },
    },
    ["sourceConnectionId", "queryKind", "criteria", "idempotencyKey"],
  ),
  StartWebEvidenceRequest: objectSchema(
    {
      ...ingestionRequestCommonProperties,
      queryKind: { const: "web_evidence" },
      criteria: { $ref: "#/components/schemas/WebEvidenceCriteria" },
    },
    ["sourceConnectionId", "queryKind", "criteria", "idempotencyKey"],
  ),
  StartIngestionQueryRequest: {
    oneOf: [
      { $ref: "#/components/schemas/StartCompanySearchRequest" },
      { $ref: "#/components/schemas/StartCompanyDetailRequest" },
      { $ref: "#/components/schemas/StartRiskEnrichmentRequest" },
      { $ref: "#/components/schemas/StartWebEvidenceRequest" },
    ],
    discriminator: {
      propertyName: "queryKind",
      mapping: {
        company_search: "#/components/schemas/StartCompanySearchRequest",
        company_detail: "#/components/schemas/StartCompanyDetailRequest",
        risk_enrichment: "#/components/schemas/StartRiskEnrichmentRequest",
        web_evidence: "#/components/schemas/StartWebEvidenceRequest",
      },
    },
  },
  StartRuleRunRequest: objectSchema(
    {
      ruleVersionId: uuid,
      companyListId: uuid,
      runMode: { type: "string", enum: ["sample", "full"], default: "full" },
      idempotencyKey: {
        type: "string",
        minLength: 16,
        maxLength: 128,
        pattern: "^[A-Za-z0-9._:-]+$",
      },
    },
    ["ruleVersionId", "companyListId", "idempotencyKey"],
  ),
  StartExportRequest: {
    ...objectSchema(
      {
        companyListId: uuid,
        ruleRunId: uuid,
        format: enumSchema(["csv", "xlsx", "json", "html"]),
        selectedFields: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: enumSchema(EXPORT_FIELD_NAMES),
        },
        decisions: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          uniqueItems: true,
          items: enumSchema(["include", "exclude", "needs_review", "unscored"]),
        },
        idempotencyKey: {
          type: "string",
          minLength: 16,
          maxLength: 128,
          pattern: "^[A-Za-z0-9._:-]+$",
        },
      },
      ["format", "idempotencyKey"],
    ),
    anyOf: [{ required: ["companyListId"] }, { required: ["ruleRunId"] }],
  },
};

export function buildOpenApiDocument(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "企业名单工作台领域 API",
      version: "1.0.0",
      description:
        "供 Web UI、自动化系统和 AI 客户端调用的安全领域接口。读取受工作空间 RLS 保护，规则模板通过原子服务版本化发布，供应商查询、规则运行和导出走受控队列。",
    },
    servers: [{ url: serverUrl.replace(/\/+$/, "") }],
    security: [{ bearerAuth: [] }],
    paths: {
      "/openapi.json": {
        get: {
          operationId: "getOpenApi",
          summary: "读取本接口定义",
          security: [],
          responses: {
            "200": {
              description: "OpenAPI 3.1 文档",
              content: {
                "application/json": { schema: { type: "object" } },
              },
            },
          },
        },
      },
      "/workspaces": {
        get: protectedGet(
          "listWorkspaces",
          "列出当前用户可访问的工作空间",
          "Workspace",
          [...paginationParameters, queryEnum("status", WORKSPACE_STATUSES)],
        ),
      },
      "/workspaces/{workspaceId}/source-connections": {
        get: protectedGet(
          "listSourceConnections",
          "列出安全的数据源连接摘要",
          "SourceConnection",
          [
            workspaceParameter,
            ...paginationParameters,
            queryEnum("provider", [
              "qcc",
              "huoke_assistant",
              "file_upload",
              "web_search",
              "other",
            ]),
            queryEnum("status", SOURCE_CONNECTION_STATUSES),
          ],
        ),
      },
      "/workspaces/{workspaceId}/source-queries": {
        get: protectedGet(
          "listSourceQueries",
          "列出可审计的数据源查询",
          "SourceQuery",
          [
            workspaceParameter,
            ...paginationParameters,
            {
              name: "sourceConnectionId",
              in: "query",
              required: false,
              schema: uuid,
            },
            queryEnum("status", SOURCE_QUERY_STATUSES),
          ],
        ),
      },
      "/workspaces/{workspaceId}/ingestion-jobs": {
        get: protectedGet(
          "listIngestionJobs",
          "列出数据接入任务状态",
          "IngestionJob",
          [
            workspaceParameter,
            ...paginationParameters,
            {
              name: "sourceConnectionId",
              in: "query",
              required: false,
              schema: uuid,
            },
            queryEnum("status", INGESTION_JOB_STATUSES),
            queryEnum("jobKind", [
              "query",
              "import",
              "enrich",
              "refresh",
              "connection_test",
            ]),
          ],
        ),
      },
      "/workspaces/{workspaceId}/ingestion-queries": {
        post: protectedPost(
          "startIngestionQuery",
          "提交企查查、获客助手或已存在企业的 Web 证据任务",
          "StartIngestionQueryRequest",
        ),
      },
      "/workspaces/{workspaceId}/company-lists": {
        get: protectedGet("listCompanyLists", "列出企业名单", "CompanyList", [
          workspaceParameter,
          ...paginationParameters,
          queryEnum("status", COMPANY_LIST_STATUSES),
        ]),
      },
      "/workspaces/{workspaceId}/company-lists/{companyListId}/companies": {
        get: protectedGet(
          "listCompanyListCompanies",
          "列出指定名单内的企业",
          "CompanyListCompany",
          [
            workspaceParameter,
            pathParameter("companyListId", uuid, "企业名单 UUID"),
            ...paginationParameters,
            queryEnum("membershipStatus", [
              "included",
              "excluded",
              "needs_review",
            ]),
          ],
        ),
      },
      "/workspaces/{workspaceId}/companies": {
        get: protectedGet("listCompanies", "检索规范化企业", "Company", [
          workspaceParameter,
          ...paginationParameters,
          {
            name: "name",
            in: "query",
            required: false,
            schema: { type: "string", minLength: 1, maxLength: 200 },
          },
          queryEnum("profileStatus", COMPANY_PROFILE_STATUSES),
        ]),
      },
      "/workspaces/{workspaceId}/companies/{companyId}": {
        get: {
          operationId: "getCompany",
          summary: "读取一条规范化企业记录",
          security: [{ bearerAuth: [] }],
          parameters: [
            workspaceParameter,
            pathParameter(
              "companyId",
              { type: "string", pattern: "^[1-9][0-9]{0,18}$" },
              "企业 bigint ID",
            ),
          ],
          responses: detailResponses("Company"),
        },
      },
      "/workspaces/{workspaceId}/companies/{companyId}/evidence": {
        get: protectedGet(
          "listCompanyEvidence",
          "列出企业证据摘要",
          "CompanyEvidence",
          [
            workspaceParameter,
            pathParameter(
              "companyId",
              { type: "string", pattern: "^[1-9][0-9]{0,18}$" },
              "企业 bigint ID",
            ),
            ...paginationParameters,
            queryEnum("status", EVIDENCE_STATUSES),
            queryEnum("evidenceType", [
              "registration",
              "operation",
              "risk",
              "qualification",
              "tender",
              "web",
              "uploaded_document",
              "manual_note",
              "other",
            ]),
          ],
        ),
      },
      "/workspaces/{workspaceId}/companies/{companyId}/facts": {
        get: protectedGet(
          "listCompanyFacts",
          "列出企业的可追溯字段事实",
          "CompanyFact",
          [
            workspaceParameter,
            pathParameter(
              "companyId",
              { type: "string", pattern: "^[1-9][0-9]{0,18}$" },
              "企业 bigint ID",
            ),
            ...paginationParameters,
            {
              name: "currentOnly",
              in: "query",
              required: false,
              schema: { type: "boolean", default: true },
            },
            {
              name: "fieldName",
              in: "query",
              required: false,
              schema: { type: "string", minLength: 1, maxLength: 160 },
            },
          ],
        ),
      },
      "/workspaces/{workspaceId}/rule-sets": {
        get: protectedGet("listRuleSets", "列出规则集", "RuleSet", [
          workspaceParameter,
          ...paginationParameters,
          queryEnum("status", RULE_SET_STATUSES),
        ]),
        post: protectedDomainPost(
          "saveRuleTemplate",
          "创建或发布 RuleTemplate v1 新版本",
          "需要工作空间所有者、管理员或编辑者权限。同一原子操作同时更新模板元数据并发布不可变版本；完全相同的重试复用已发布版本。",
          "SaveRuleTemplateRequest",
          "SavedRuleTemplate",
        ),
      },
      "/workspaces/{workspaceId}/rule-sets/{ruleSetId}/versions": {
        get: protectedGet(
          "listRuleSetVersions",
          "列出版本化规则定义",
          "RuleSetVersion",
          [
            workspaceParameter,
            pathParameter("ruleSetId", uuid, "规则集 UUID"),
            ...paginationParameters,
            queryEnum("status", RULE_VERSION_STATUSES),
          ],
        ),
      },
      "/workspaces/{workspaceId}/rule-runs": {
        get: protectedGet("listRuleRuns", "列出规则运行", "RuleRun", [
          workspaceParameter,
          ...paginationParameters,
          queryEnum("status", RULE_RUN_STATUSES),
          { name: "companyListId", in: "query", required: false, schema: uuid },
          { name: "ruleVersionId", in: "query", required: false, schema: uuid },
        ]),
        post: protectedPost(
          "startRuleRun",
          "运行一个已发布的规则版本",
          "StartRuleRunRequest",
        ),
      },
      "/workspaces/{workspaceId}/rule-runs/{ruleRunId}/results": {
        get: protectedGet("listRuleResults", "列出规则决策结果", "RuleResult", [
          workspaceParameter,
          pathParameter("ruleRunId", uuid, "规则运行 UUID"),
          ...paginationParameters,
          queryEnum("decision", RULE_DECISIONS),
        ]),
      },
      "/workspaces/{workspaceId}/exports": {
        get: protectedGet("listExports", "列出正式导出任务", "Export", [
          workspaceParameter,
          ...paginationParameters,
          queryEnum("status", EXPORT_STATUSES),
        ]),
        post: protectedPost(
          "startExport",
          "提交正式导出任务",
          "StartExportRequest",
        ),
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "Supabase user JWT",
          description:
            "使用 Supabase 登录会话的用户 access token。匿名密钥和服务角色密钥均不是用户令牌。",
        },
      },
      schemas,
    },
  };
}
