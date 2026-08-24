import {
  allowedMethods,
  API_ROUTES,
  companySearchCriteriaSchema,
  EXPORT_FIELD_NAMES,
  MAX_REQUEST_BYTES,
  matchRoute,
  parseSavedRuleTemplateRpcResult,
  parseJsonRequestBody,
  READ_PROJECTIONS,
  READ_RESOURCES,
  saveRuleTemplateBodySchema,
  sanitizeOutput,
  startExportBodySchema,
  startIngestionQueryBodySchema,
  toExportRpc,
  toIngestionRpc,
  toRuleRunRpc,
  toSaveRuleTemplateRpc,
} from "./contracts.ts";
import { buildOpenApiDocument } from "./openapi.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}

function assertThrows(callback: () => unknown, message: string) {
  try {
    callback();
  } catch {
    return;
  }
  throw new Error(message);
}

const workspaceId = "11111111-1111-4111-8111-111111111111";
const connectionId = "22222222-2222-4222-8222-222222222222";
const ruleVersionId = "33333333-3333-4333-8333-333333333333";
const companyListId = "44444444-4444-4444-8444-444444444444";

Deno.test(
  "REST routes are an exact domain allowlist with four controlled writes",
  () => {
    assertEquals(
      new Set(API_ROUTES.map((route) => route.operationId)).size,
      API_ROUTES.length,
      "operation IDs must be unique",
    );
    assertEquals(
      API_ROUTES.filter((route) => route.method === "POST").map(
        (route) => route.operationId,
      ),
      [
        "startIngestionQuery",
        "saveRuleTemplate",
        "startRuleRun",
        "startExport",
      ],
      "only one atomic rule write and three asynchronous writes are public",
    );
    const forbiddenFragments = [
      "sql",
      "query-table",
      "mutate",
      "source-records",
      "source-snapshots",
      "secrets",
    ];
    for (const route of API_ROUTES) {
      const signature = `${route.operationId}:${route.path}`.toLowerCase();
      for (const forbidden of forbiddenFragments) {
        assert(
          !signature.includes(forbidden),
          `forbidden REST surface found: ${signature}`,
        );
      }
    }
  },
);

Deno.test(
  "router matches only declared paths and rejects arbitrary suffixes",
  () => {
    const match = matchRoute(
      "GET",
      `/workspaces/${workspaceId}/companies/42/evidence`,
    );
    assertEquals(
      match?.operationId,
      "listCompanyEvidence",
      "evidence route mismatch",
    );
    assertEquals(match?.params.companyId, "42", "company path ID mismatch");
    assertEquals(
      allowedMethods(`/workspaces/${workspaceId}/rule-runs`),
      ["GET", "POST"],
      "rule-runs methods mismatch",
    );
    assert(
      matchRoute("GET", `/workspaces/${workspaceId}/tables/companies`) === null,
      "generic table path must not resolve",
    );
    assert(
      matchRoute("POST", `/workspaces/${workspaceId}/companies`) === null,
      "undeclared company writes must not resolve",
    );
  },
);

Deno.test("read resources and projections exclude provider internals", () => {
  for (const forbidden of [
    "source_records",
    "source_snapshots",
    "audit_logs",
    "contacts",
    "deals",
  ]) {
    assert(
      !READ_RESOURCES.includes(forbidden as never),
      `forbidden read resource is public: ${forbidden}`,
    );
  }
  for (const projection of Object.values(READ_PROJECTIONS)) {
    const fields = projection.split(",").map((field) => field.trim());
    for (const forbidden of [
      "secret_reference",
      "raw_payload",
      "input_params",
      "connection_config",
      "error_message",
    ]) {
      assert(
        !fields.includes(forbidden),
        `forbidden selected field: ${forbidden}`,
      );
    }
  }
  assert(
    READ_PROJECTIONS.sourceConnections.includes("has_secret_reference"),
    "credential-presence boolean should remain visible",
  );
});

Deno.test("ingestion query maps to the controlled queue envelope", () => {
  const rpc = toIngestionRpc(workspaceId, {
    sourceConnectionId: connectionId,
    queryKind: "company_detail",
    queryText: "核验这家企业",
    criteria: { searchKey: "企查查科技股份有限公司" },
    idempotencyKey: "rest-query:2026-08-20:001",
  });
  assertEquals(rpc.p_action, "start_ingestion", "ingestion action mismatch");
  assertEquals(
    rpc.p_payload.job_kind,
    "query",
    "only provider queries may be enqueued",
  );
  assert(
    !("input_object_path" in rpc.p_payload),
    "REST query must not expose file paths",
  );
  assertEquals(
    Object.keys(rpc).sort(),
    ["p_action", "p_idempotency_key", "p_payload", "p_workspace_id"],
    "queue envelope must stay narrow",
  );
});

Deno.test(
  "ingestion body accepts company-bound web evidence and rejects unsafe input",
  () => {
    const web = startIngestionQueryBodySchema.parse({
      sourceConnectionId: connectionId,
      queryKind: "web_evidence",
      criteria: {
        companyId: "42",
        claimType: "tender",
        extraKeywords: ["信创"],
        site: "example.test",
        maxResults: 5,
      },
      idempotencyKey: "rest-query:2026-08-20:002",
    });
    assert(
      web.queryKind === "web_evidence",
      "web evidence discriminator mismatch",
    );
    assertEquals(
      web.criteria.companyId,
      "42",
      "web evidence must stay bound to the persisted company id",
    );
    assertThrows(
      () =>
        startIngestionQueryBodySchema.parse({
          sourceConnectionId: connectionId,
          queryKind: "web_evidence",
          criteria: {
            companyId: "42",
            companyName: "不允许客户端覆盖数据库企业名称",
            claimType: "news",
          },
          idempotencyKey: "rest-query:2026-08-20:002b",
        }),
      "web evidence must resolve the company name from the database",
    );
    assertThrows(
      () =>
        startIngestionQueryBodySchema.parse({
          sourceConnectionId: connectionId,
          queryKind: "company_search",
          criteria: { nested: { api_key: "must-not-enter-a-job" } },
          idempotencyKey: "rest-query:2026-08-20:003",
        }),
      "nested credentials must be rejected",
    );
    assertThrows(
      () =>
        startIngestionQueryBodySchema.parse({
          sourceConnectionId: connectionId,
          queryKind: "company_search",
          criteria: {},
          storagePath: `${workspaceId}/file.csv`,
          idempotencyKey: "rest-query:2026-08-20:004",
        }),
      "file import fields must be rejected",
    );
  },
);

Deno.test(
  "获客助手企业筛选契约 validates anchors, ranges, and pagination defaults",
  () => {
    const parsed = companySearchCriteriaSchema.parse({
      keyword: "软件企业",
      enterpriseTypes: ["company"],
      registeredCapitalWan: [{ min: 500, max: 5000 }],
      establishedBetween: [{ start: "2020-01-01", end: "2025-12-31" }],
    });
    assertEquals(parsed.page, 1, "default provider page mismatch");
    assertEquals(parsed.pageSize, 10, "default provider page size mismatch");
    assertThrows(
      () => companySearchCriteriaSchema.parse({ page: 1, pageSize: 10 }),
      "provider search must contain a real business anchor",
    );
    assertThrows(
      () =>
        companySearchCriteriaSchema.parse({
          keyword: "软件企业",
          registeredCapitalWan: [{ min: 5000, max: 500 }],
        }),
      "invalid ranges must be rejected before queueing",
    );
  },
);

Deno.test("request parser rejects invalid JSON and bodies over 128 KiB", () => {
  assertThrows(
    () => parseJsonRequestBody("not-json"),
    "invalid JSON must be rejected",
  );
  assertThrows(
    () => parseJsonRequestBody(`"${"x".repeat(MAX_REQUEST_BYTES)}"`),
    "oversized JSON must be rejected",
  );
});

Deno.test(
  "rule execution pins the production engine and cannot author rules",
  () => {
    const rpc = toRuleRunRpc(workspaceId, {
      ruleVersionId,
      companyListId,
      runMode: "full",
      idempotencyKey: "rest-rules:2026-08-20:001",
    });
    assertEquals(rpc.p_action, "run_rules", "rule action mismatch");
    assertEquals(
      rpc.p_payload.engine_version,
      "lead-rules-v1",
      "engine must be pinned",
    );
    assertEquals(
      rpc.p_payload.run_config,
      {},
      "run configuration must not be injected",
    );
    assertThrows(
      () =>
        toRuleRunRpc(workspaceId, {
          ruleVersionId,
          companyListId,
          ruleDefinition: { root: { combinator: "and", rules: [] } },
          idempotencyKey: "rest-rules:2026-08-20:002",
        }),
      "REST API must not author rule DSL",
    );
  },
);

Deno.test("rule authoring maps only to the atomic RuleTemplate v1 RPC", () => {
  const input = {
    name: "虚构制造业准入",
    description: "仅用于合同测试",
    businessObjective: "筛选参保人数达标的虚构企业",
    ruleDefinition: {
      eligibility: {
        root: {
          id: "root",
          combinator: "and",
          rules: [
            {
              id: "insured-count",
              label: "参保人数不低于 30",
              field: "insuredCount",
              operator: "gte",
              value: 30,
              missingPolicy: "review",
              enabled: true,
            },
          ],
        },
        onNoMatch: "exclude",
        onUnknown: "review",
      },
      rules: [],
      thresholds: { p1: 75, p2: 50, minimumCompleteness: 70 },
    },
    changeNote: "初始版本",
  };
  const rpc = toSaveRuleTemplateRpc(workspaceId, input);
  assertEquals(
    Object.keys(rpc).sort(),
    [
      "p_business_objective",
      "p_change_note",
      "p_description",
      "p_name",
      "p_rule_definition",
      "p_rule_set_id",
      "p_scoring_definition",
      "p_workspace_id",
    ],
    "rule RPC envelope must stay exact",
  );
  assertEquals(rpc.p_rule_set_id, null, "new rule set must use a null id");
  assertEquals(
    rpc.p_scoring_definition,
    { engineVersion: "lead-rules-v1" },
    "rule engine must be pinned",
  );
  assertThrows(
    () =>
      saveRuleTemplateBodySchema.parse({
        ...input,
        ruleDefinition: {
          ...input.ruleDefinition,
          thresholds: { p1: 40, p2: 60, minimumCompleteness: 70 },
        },
      }),
    "P1 below P2 must be rejected",
  );
  assertThrows(
    () =>
      saveRuleTemplateBodySchema.parse({
        ...input,
        ruleDefinition: {
          ...input.ruleDefinition,
          rules: [
            {
              id: "unsafe",
              label: "不安全字段",
              kind: "priority",
              field: "companyName",
              operator: "eq",
              value: { api_key: "must-not-be-stored" },
            },
          ],
        },
      }),
    "secret-like keys must be rejected anywhere in rule JSON",
  );
  assertThrows(
    () =>
      saveRuleTemplateBodySchema.parse({
        ...input,
        ruleDefinition: {
          ...input.ruleDefinition,
          rules: [
            {
              id: "unsafe-generic-token",
              label: "通用凭证字段",
              kind: "priority",
              field: "companyName",
              operator: "eq",
              value: { token: "must-not-be-stored" },
            },
          ],
        },
      }),
    "generic token keys must be rejected anywhere in rule JSON",
  );
});

Deno.test(
  "RuleTemplate v1 counts eligibility depth by groups and validates RPC output",
  () => {
    const condition = {
      id: "leaf",
      label: "叶子条件",
      field: "insuredCount",
      operator: "gte" as const,
      value: 20,
      missingPolicy: "review" as const,
      enabled: true,
    };
    const nestedEligibility = (groupLevels: number) => {
      let node: unknown = condition;
      for (let level = groupLevels; level >= 1; level -= 1) {
        node = {
          id: `group-${level}`,
          combinator: "and",
          rules: [node],
        };
      }
      return { root: node, onNoMatch: "exclude", onUnknown: "review" };
    };
    const request = {
      name: "深度边界规则",
      businessObjective: "验证规则组层级边界",
      ruleDefinition: {
        eligibility: nestedEligibility(5),
        rules: [],
        thresholds: { p1: 75, p2: 50 },
      },
    };
    saveRuleTemplateBodySchema.parse(request);
    assertThrows(
      () =>
        saveRuleTemplateBodySchema.parse({
          ...request,
          ruleDefinition: {
            ...request.ruleDefinition,
            eligibility: nestedEligibility(6),
          },
        }),
      "six eligibility group levels must be rejected",
    );
    let deeplyNestedError: unknown;
    try {
      saveRuleTemplateBodySchema.parse({
        ...request,
        ruleDefinition: {
          ...request.ruleDefinition,
          eligibility: nestedEligibility(2_000),
        },
      });
    } catch (error) {
      deeplyNestedError = error;
    }
    assert(
      deeplyNestedError instanceof Error &&
        deeplyNestedError.name === "ZodError",
      "deep eligibility input must fail as validation, not a stack overflow",
    );

    const saved = parseSavedRuleTemplateRpcResult([
      {
        rule_set_id: "55555555-5555-4555-8555-555555555555",
        rule_version_id: "66666666-6666-4666-8666-666666666666",
        version_number: 2,
        status: "published",
      },
    ]);
    assertEquals(
      saved,
      {
        ruleSetId: "55555555-5555-4555-8555-555555555555",
        ruleVersionId: "66666666-6666-4666-8666-666666666666",
        versionNumber: 2,
        status: "published",
      },
      "RPC result mapping mismatch",
    );
    assertEquals(
      parseSavedRuleTemplateRpcResult([]),
      null,
      "empty RPC responses must fail closed",
    );
    assertEquals(
      parseSavedRuleTemplateRpcResult([
        {
          rule_set_id: "not-a-uuid",
          rule_version_id: "also-invalid",
          version_number: 0,
          status: "draft",
        },
      ]),
      null,
      "schema-drifted RPC responses must fail closed",
    );
  },
);

Deno.test("exports use only the worker field and decision allowlists", () => {
  const rpc = toExportRpc(workspaceId, {
    companyListId,
    format: "xlsx",
    selectedFields: ["companyName", "creditCode", "decision"],
    decisions: ["include", "needs_review"],
    idempotencyKey: "rest-export:2026-08-20:001",
  });
  assertEquals(rpc.p_action, "create_export", "export action mismatch");
  assertEquals(
    rpc.p_payload.filter_definition,
    { decisions: ["include", "needs_review"] },
    "export filter mismatch",
  );
  assert(
    EXPORT_FIELD_NAMES.includes("contact.phoneMasked"),
    "masked contact export should remain available",
  );
  assertThrows(
    () =>
      startExportBodySchema.parse({
        companyListId,
        format: "json",
        selectedFields: ["raw_payload"],
        idempotencyKey: "rest-export:2026-08-20:002",
      }),
    "provider payload fields must not be exportable",
  );
});

Deno.test(
  "OpenAPI operations exactly match runtime routes and declare user Bearer auth",
  () => {
    const document = buildOpenApiDocument(
      "https://example.test/functions/v1/workbench-api",
    ) as Record<string, unknown>;
    const paths = document.paths as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    const documented = Object.entries(paths).flatMap(([path, pathItem]) =>
      Object.entries(pathItem).flatMap(([method, operation]) =>
        method === "get" || method === "post"
          ? [
              {
                method: method.toUpperCase(),
                path,
                operationId: operation.operationId,
              },
            ]
          : [],
      ),
    );
    const implemented = API_ROUTES.map((route) => ({
      method: route.method,
      path: route.path,
      operationId: route.operationId,
    }));
    assertEquals(
      documented,
      implemented,
      "OpenAPI and router must stay in lockstep",
    );

    const components = document.components as Record<
      string,
      Record<string, unknown>
    >;
    const securitySchemes = components.securitySchemes as Record<
      string,
      Record<string, unknown>
    >;
    assertEquals(
      securitySchemes.bearerAuth.type,
      "http",
      "auth scheme type mismatch",
    );
    assertEquals(
      securitySchemes.bearerAuth.scheme,
      "bearer",
      "auth scheme mismatch",
    );
    assertEquals(
      paths["/openapi.json"].get.security,
      [],
      "OpenAPI discovery should be public",
    );
    assertEquals(
      paths[`/workspaces/{workspaceId}/companies`].get.security,
      [{ bearerAuth: [] }],
      "domain reads must require user bearer auth",
    );
  },
);

Deno.test(
  "OpenAPI publishes actual status enums and no generic data operations",
  () => {
    const document = buildOpenApiDocument("https://example.test/api") as Record<
      string,
      unknown
    >;
    const components = document.components as {
      schemas: Record<string, Record<string, unknown>>;
    };
    const ingestion = components.schemas.IngestionJob as {
      properties: Record<string, Record<string, unknown>>;
    };
    assertEquals(
      ingestion.properties.status.enum,
      ["queued", "running", "completed", "partial", "failed", "cancelled"],
      "ingestion states must match the database contract",
    );
    const leadRule = components.schemas.LeadRule as {
      required: string[];
      properties: Record<string, Record<string, unknown>>;
    };
    assertEquals(
      leadRule.required,
      ["id", "label", "kind", "field", "operator"],
      "OpenAPI must not require RuleTemplate fields that runtime defaults",
    );
    assertEquals(
      leadRule.properties.onMatch.default,
      "score",
      "OpenAPI onMatch default must match RuleTemplate v1",
    );
    assertEquals(
      leadRule.properties.missingPolicy.default,
      "review",
      "OpenAPI missingPolicy default must match RuleTemplate v1",
    );
    const thresholds = components.schemas.RuleThresholds as {
      required: string[];
      properties: Record<string, Record<string, unknown>>;
    };
    assertEquals(
      thresholds.required,
      ["p1", "p2"],
      "minimumCompleteness must remain optional with a server default",
    );
    assertEquals(
      thresholds.properties.minimumCompleteness.default,
      60,
      "OpenAPI completeness default mismatch",
    );
    const saveRequest = components.schemas.SaveRuleTemplateRequest as {
      example: unknown;
    };
    saveRuleTemplateBodySchema.parse(saveRequest.example);

    const serialized = JSON.stringify(document).toLowerCase();
    for (const forbidden of [
      "execute_sql",
      "arbitrary sql",
      "source_records",
      "raw_payload",
      "input_params",
    ]) {
      assert(
        !serialized.includes(forbidden),
        `OpenAPI exposes forbidden surface: ${forbidden}`,
      );
    }
  },
);

Deno.test(
  "response sanitizer removes sensitive keys but preserves safe state",
  () => {
    const sanitized = sanitizeOutput({
      id: "safe",
      has_secret_reference: true,
      secret_reference: "env://must-not-leave-server",
      nested: {
        raw_payload: { company: "hidden" },
        input_params: { criteria: "hidden" },
        connection_config: { endpoint: "hidden" },
        client_secret: "hidden",
        token: "hidden",
        secret: "hidden",
        cookie: "hidden",
        credential: "hidden",
        status: "ready",
      },
    });
    assertEquals(
      sanitized,
      {
        id: "safe",
        has_secret_reference: true,
        nested: { status: "ready" },
      },
      "sensitive response keys were not removed",
    );
  },
);
