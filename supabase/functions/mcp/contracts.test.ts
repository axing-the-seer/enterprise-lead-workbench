import { z } from "zod";
import {
  EXPORT_FIELD_NAMES,
  parseSavedRuleTemplateMcpResult,
  READ_PROJECTIONS,
  READ_RESOURCE_NAMES,
  READ_TOOL_NAMES,
  saveRuleTemplateInputSchema,
  sanitizeMcpOutput,
  startExportInputSchema,
  startIngestionQueryInputSchema,
  startIngestionQueryMcpInputSchema,
  submitCompanyReportAnalysisInputSchema,
  toEnqueueWorkbenchRpc,
  toSaveRuleTemplateMcpRpc,
  WORKBENCH_MCP_TOOL_NAMES,
  WRITE_TOOL_NAMES,
} from "./contracts.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(
        actual,
      )}`,
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
  "MCP tool registry is an exact enterprise-workbench allowlist",
  () => {
    assertEquals(
      WORKBENCH_MCP_TOOL_NAMES.length,
      20,
      "tool count must stay bounded",
    );
    assertEquals(
      new Set(WORKBENCH_MCP_TOOL_NAMES).size,
      WORKBENCH_MCP_TOOL_NAMES.length,
      "tool names must be unique",
    );
    assertEquals(
      WORKBENCH_MCP_TOOL_NAMES,
      [...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES],
      "registry must be composed only from explicit read/write allowlists",
    );

    const forbidden = [
      "query",
      "mutate",
      "get_schema",
      "display_task_list",
      "complete_task",
      "execute_sql",
      "create_rule",
      "publish_rule",
    ];
    for (const toolName of forbidden) {
      assert(
        !WORKBENCH_MCP_TOOL_NAMES.includes(toolName as never),
        `forbidden MCP tool is registered: ${toolName}`,
      );
    }
  },
);

Deno.test(
  "Agent report analysis requires structured evidence citations",
  () => {
    const parsed = submitCompanyReportAnalysisInputSchema.parse({
      workspaceId,
      evidenceJobId: connectionId,
      agentProvider: "workbuddy",
      agentName: "WorkBuddy",
      analysis: {
        schemaVersion: "company-agent-analysis.v1",
        executiveSummary: "企业近期存在公开招聘和业务发展信号。",
        executiveEvidenceIds: ["ev-001"],
        businessProfile: [],
        growthSignals: [
          {
            title: "招聘信号",
            summary: "公开招聘材料显示企业正在补充相关岗位。",
            confidence: "medium",
            evidenceIds: ["ev-002"],
          },
        ],
        recentEvents: [],
        opportunities: [],
        risks: [],
        recommendedActions: [],
        limitations: ["部分招聘网站需要登录，覆盖不完整。"],
      },
    });
    assertEquals(parsed.agentProvider, "workbuddy", "agent provider mismatch");
    assertThrows(
      () =>
        submitCompanyReportAnalysisInputSchema.parse({
          ...parsed,
          analysis: { ...parsed.analysis, executiveEvidenceIds: [] },
        }),
      "executive summary must cite at least one evidence item",
    );
    const oversizedInsights = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        title: `需要合并的分析 ${index + 1}`,
        summary: "重复摘要".repeat(125),
        confidence: "low" as const,
        evidenceIds: ["ev-001"],
      }));
    assertThrows(
      () =>
        submitCompanyReportAnalysisInputSchema.parse({
          ...parsed,
          analysis: {
            ...parsed.analysis,
            businessProfile: oversizedInsights(6),
            growthSignals: oversizedInsights(6),
            recentEvents: oversizedInsights(8),
            opportunities: oversizedInsights(6),
            risks: oversizedInsights(6),
            recommendedActions: oversizedInsights(6),
          },
        }),
      "oversized report analysis must be rejected",
    );
    for (const leakedText of [
      "结论来自 ev-001。",
      "主体的 USCC 已核验。",
      "该材料属于 broad_context。",
      "主档 paid_in_capital 为空。",
      "字段 insuredCount 为 20。",
      "风险来自 tags.risk。",
      "文字仍含有 broad\\_context 转义。",
    ]) {
      assertThrows(
        () =>
          submitCompanyReportAnalysisInputSchema.parse({
            ...parsed,
            analysis: { ...parsed.analysis, executiveSummary: leakedText },
          }),
        `internal report token must be rejected: ${leakedText}`,
      );
    }
  },
);

Deno.test(
  "read resources and projections exclude raw and credential surfaces",
  () => {
    const forbiddenResources = [
      "contacts",
      "deals",
      "tasks",
      "source_records",
      "source_snapshots",
      "audit_logs",
    ];
    for (const resource of forbiddenResources) {
      assert(
        !READ_RESOURCE_NAMES.includes(resource as never),
        `forbidden resource is readable: ${resource}`,
      );
    }

    for (const projection of Object.values(READ_PROJECTIONS)) {
      const fields = projection.split(",").map((field) => field.trim());
      assert(
        !fields.includes("secret_reference"),
        "secret_reference must not be selected",
      );
      assert(
        !fields.includes("raw_payload"),
        "raw_payload must not be selected",
      );
      assert(
        !fields.includes("input_params"),
        "job input_params must not be selected",
      );
    }
    assert(
      READ_PROJECTIONS.sourceConnections.includes("has_secret_reference"),
      "clients may see whether a secret reference exists",
    );
  },
);

Deno.test("query ingestion maps only to the controlled enqueue RPC", () => {
  const rpc = toEnqueueWorkbenchRpc("start_ingestion_query", {
    workspaceId,
    sourceConnectionId: connectionId,
    queryKind: "company_search",
    queryText: "查找北京软件企业",
    criteria: {
      regions: [{ label: "北京市", providerValues: ["北京市"] }],
      industries: [
        {
          label: "软件和信息技术服务业",
          providerValues: ["软件和信息技术服务业"],
        },
      ],
      page: 1,
      pageSize: 10,
    },
    origin: {
      channel: "agent",
      provider: "workbuddy",
      agentName: "WorkBuddy",
    },
    idempotencyKey: "mcp-query:2026-08-20:001",
  });

  assertEquals(rpc.p_action, "start_ingestion", "RPC action mismatch");
  assertEquals(
    rpc.p_payload.job_kind,
    "query",
    "MCP must only enqueue query jobs",
  );
  assert(
    !("input_object_path" in rpc.p_payload),
    "MCP query tool must not accept file import paths",
  );
  assertEquals(
    (rpc.p_payload.input_params as Record<string, unknown>).origin,
    { channel: "agent", provider: "workbuddy", agentName: "WorkBuddy" },
    "Agent source must remain traceable on the ingestion job",
  );
  assertEquals(
    Object.keys(rpc).sort(),
    ["p_action", "p_idempotency_key", "p_payload", "p_workspace_id"],
    "RPC envelope must stay narrow",
  );
});

Deno.test("query ingestion advertises a non-empty MCP object schema", () => {
  const jsonSchema = z.toJSONSchema(startIngestionQueryMcpInputSchema) as {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
  assertEquals(jsonSchema.type, "object", "MCP input root must be an object");
  for (const field of [
    "workspaceId",
    "sourceConnectionId",
    "queryKind",
    "criteria",
    "idempotencyKey",
  ]) {
    assert(
      Boolean(jsonSchema.properties?.[field]),
      `MCP input schema must advertise ${field}`,
    );
    assert(
      jsonSchema.required?.includes(field),
      `MCP input schema must require ${field}`,
    );
  }
});

Deno.test(
  "query ingestion rejects files, unknown fields, and nested credentials",
  () => {
    assertThrows(
      () =>
        startIngestionQueryInputSchema.parse({
          workspaceId,
          sourceConnectionId: connectionId,
          queryKind: "company_search",
          criteria: {},
          storagePath: `${workspaceId}/file.csv`,
          idempotencyKey: "mcp-query:2026-08-20:002",
        }),
      "file import fields must be rejected",
    );
    assertThrows(
      () =>
        startIngestionQueryInputSchema.parse({
          workspaceId,
          sourceConnectionId: connectionId,
          queryKind: "company_search",
          criteria: { nested: { api_key: "must-not-enter-job-payload" } },
          idempotencyKey: "mcp-query:2026-08-20:003",
        }),
      "secret-like criteria fields must be rejected",
    );
    assertThrows(
      () =>
        startIngestionQueryInputSchema.parse({
          workspaceId,
          sourceConnectionId: connectionId,
          queryKind: "tender_search",
          criteria: {},
          idempotencyKey: "mcp-query:2026-08-20:004",
        }),
      "unimplemented query kinds must not be advertised",
    );
    const web = startIngestionQueryInputSchema.parse({
      workspaceId,
      sourceConnectionId: connectionId,
      queryKind: "web_evidence",
      criteria: {
        companyId: "42",
        claimType: "news",
        maxResults: 5,
      },
      idempotencyKey: "mcp-query:2026-08-20:005",
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
        startIngestionQueryInputSchema.parse({
          workspaceId,
          sourceConnectionId: connectionId,
          queryKind: "web_evidence",
          criteria: {
            companyId: "42",
            companyName: "客户端不得覆盖数据库名称",
            claimType: "news",
          },
          idempotencyKey: "mcp-query:2026-08-20:006",
        }),
      "web evidence must resolve the company from the database",
    );
  },
);

Deno.test(
  "rule execution is fixed to the production engine and cannot author DSL",
  () => {
    const rpc = toEnqueueWorkbenchRpc("run_ruleset", {
      workspaceId,
      ruleVersionId,
      companyListId,
      runMode: "full",
      idempotencyKey: "mcp-rules:2026-08-20:001",
    });
    assertEquals(rpc.p_action, "run_rules", "rule RPC action mismatch");
    assertEquals(
      rpc.p_payload.engine_version,
      "lead-rules-v1",
      "MCP must pin the production rule engine",
    );
    assertEquals(
      rpc.p_payload.run_config,
      {},
      "MCP must not inject run configuration",
    );
    assertThrows(
      () =>
        toEnqueueWorkbenchRpc("run_ruleset", {
          workspaceId,
          ruleVersionId,
          companyListId,
          runMode: "full",
          ruleDefinition: { eligibility: { combinator: "and", rules: [] } },
          idempotencyKey: "mcp-rules:2026-08-20:002",
        }),
      "rule DSL authoring must be rejected",
    );
  },
);

Deno.test(
  "rule authoring uses the shared atomic RuleTemplate v1 contract",
  () => {
    const input = {
      workspaceId,
      name: "虚构服务业规则",
      businessObjective: "对虚构企业按参保人数分层",
      ruleDefinition: {
        eligibility: {
          root: {
            id: "root",
            combinator: "and",
            rules: [
              {
                id: "insured-count",
                label: "参保人数不低于 20",
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
        thresholds: { p1: 75, p2: 50, minimumCompleteness: 70 },
      },
      changeNote: "MCP 初始版本",
    };
    const parsed = saveRuleTemplateInputSchema.parse(input);
    assertEquals(
      parsed.workspaceId,
      workspaceId,
      "workspace must stay explicit",
    );
    const rpc = toSaveRuleTemplateMcpRpc(input);
    assertEquals(rpc.p_workspace_id, workspaceId, "RPC workspace mismatch");
    assertEquals(rpc.p_rule_set_id, null, "new rule set must use null id");
    assertEquals(
      rpc.p_scoring_definition,
      { engineVersion: "lead-rules-v1" },
      "MCP rule engine must be pinned",
    );
    assertThrows(
      () =>
        saveRuleTemplateInputSchema.parse({
          ...input,
          ruleDefinition: {
            ...input.ruleDefinition,
            rules: [
              {
                id: "unsafe",
                label: "不安全条件",
                kind: "priority",
                field: "companyName",
                operator: "eq",
                value: { access_token: "must-not-be-stored" },
              },
            ],
          },
        }),
      "MCP rule values must reject secret-like keys",
    );
  },
);

Deno.test(
  "MCP rule authoring shares group-depth, RPC-output, and redaction contracts",
  () => {
    const nestedEligibility = (groupLevels: number) => {
      let node: unknown = {
        id: "leaf",
        label: "叶子条件",
        field: "insuredCount",
        operator: "gte",
        value: 20,
        missingPolicy: "review",
        enabled: true,
      };
      for (let level = groupLevels; level >= 1; level -= 1) {
        node = {
          id: `group-${level}`,
          combinator: "and",
          rules: [node],
        };
      }
      return { root: node, onNoMatch: "exclude", onUnknown: "review" };
    };
    const input = {
      workspaceId,
      name: "MCP 深度边界规则",
      businessObjective: "验证 MCP 与 REST 使用同一规则契约",
      ruleDefinition: {
        eligibility: nestedEligibility(5),
        rules: [],
        thresholds: { p1: 75, p2: 50 },
      },
    };
    saveRuleTemplateInputSchema.parse(input);
    const advertisedInput = JSON.stringify(
      z.toJSONSchema(saveRuleTemplateInputSchema, { io: "input" }),
    );
    assert(
      advertisedInput.includes('"workspaceId"') &&
        advertisedInput.includes('"eligibility"') &&
        advertisedInput.includes('"combinator"'),
      "MCP must advertise the structured recursive RuleTemplate input",
    );
    assertThrows(
      () =>
        saveRuleTemplateInputSchema.parse({
          ...input,
          ruleDefinition: {
            ...input.ruleDefinition,
            eligibility: nestedEligibility(6),
          },
        }),
      "MCP must reject six nested eligibility groups",
    );
    assertEquals(
      parseSavedRuleTemplateMcpResult([
        {
          rule_set_id: "55555555-5555-4555-8555-555555555555",
          rule_version_id: "66666666-6666-4666-8666-666666666666",
          version_number: 1,
          status: "published",
        },
      ]),
      {
        ruleSetId: "55555555-5555-4555-8555-555555555555",
        ruleVersionId: "66666666-6666-4666-8666-666666666666",
        versionNumber: 1,
        status: "published",
      },
      "MCP RPC response mapping mismatch",
    );
    assertEquals(
      sanitizeMcpOutput({
        status: "published",
        connection_config: { token: "hidden" },
        nested: {
          input_params: { criteria: "hidden" },
          client_secret: "hidden",
          token: "hidden",
          secret: "hidden",
          cookie: "hidden",
          credential: "hidden",
          safe: true,
        },
      }),
      { status: "published", nested: { safe: true } },
      "MCP output must use the domain redaction policy",
    );
  },
);

Deno.test("exports accept only the worker-supported field allowlist", () => {
  const rpc = toEnqueueWorkbenchRpc("start_export", {
    workspaceId,
    companyListId,
    format: "xlsx",
    selectedFields: ["companyName", "creditCode", "decision"],
    decisions: ["include", "needs_review"],
    idempotencyKey: "mcp-export:2026-08-20:001",
  });
  assertEquals(rpc.p_action, "create_export", "export RPC action mismatch");
  assertEquals(
    rpc.p_payload.filter_definition,
    { decisions: ["include", "needs_review"] },
    "export filter must stay on the decision allowlist",
  );
  assert(
    EXPORT_FIELD_NAMES.includes("contact.phoneMasked"),
    "masked contact export remains available",
  );
  assertThrows(
    () =>
      startExportInputSchema.parse({
        workspaceId,
        companyListId,
        format: "json",
        selectedFields: ["raw_payload"],
        idempotencyKey: "mcp-export:2026-08-20:002",
      }),
    "raw fields must not be exportable",
  );
});

Deno.test(
  "write tools cannot map to connection tests or arbitrary actions",
  () => {
    const actions = [
      toEnqueueWorkbenchRpc("start_ingestion_query", {
        workspaceId,
        sourceConnectionId: connectionId,
        queryKind: "company_detail",
        criteria: { companyName: "测试企业" },
        idempotencyKey: "mcp-query:2026-08-20:004",
      }).p_action,
      toEnqueueWorkbenchRpc("run_ruleset", {
        workspaceId,
        ruleVersionId,
        companyListId,
        idempotencyKey: "mcp-rules:2026-08-20:003",
      }).p_action,
      toEnqueueWorkbenchRpc("start_export", {
        workspaceId,
        ruleRunId: "55555555-5555-4555-8555-555555555555",
        format: "csv",
        idempotencyKey: "mcp-export:2026-08-20:003",
      }).p_action,
    ];
    assertEquals(
      actions,
      ["start_ingestion", "run_rules", "create_export"],
      "only controlled queue actions may be mapped",
    );
  },
);
