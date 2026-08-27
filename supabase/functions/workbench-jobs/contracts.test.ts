import { parseWorkbenchAction, toRpcRequest } from "./contracts.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertThrows(
  callback: () => unknown,
  errorType: typeof Error,
  messageIncludes: string,
) {
  try {
    callback();
  } catch (error) {
    if (!(error instanceof errorType)) throw error;
    if (!error.message.includes(messageIncludes)) {
      throw new Error(`Error did not include: ${messageIncludes}`);
    }
    return;
  }
  throw new Error("Expected callback to throw");
}

const workspaceId = "11111111-1111-4111-8111-111111111111";
const connectionId = "22222222-2222-4222-8222-222222222222";
const userId = "55555555-5555-4555-8555-555555555555";

Deno.test("maps a provider query without exposing credentials", () => {
  const parsed = parseWorkbenchAction(
    JSON.stringify({
      workspaceId,
      action: "start_ingestion",
      idempotencyKey: "query:2026-08-20:001",
      payload: {
        sourceConnectionId: connectionId,
        queryKind: "company_search",
        listName: "江苏软件企业",
        criteria: { region: "江苏省", industry: "软件和信息技术服务业" },
      },
    }),
  );
  const rpc = toRpcRequest(parsed);
  assertEquals(rpc.p_action, "start_ingestion");
  assertEquals(rpc.p_payload.job_kind, "query");
});

Deno.test("requires uploaded files to stay inside the workspace prefix", () => {
  const parsed = parseWorkbenchAction(
    JSON.stringify({
      workspaceId,
      action: "start_ingestion",
      idempotencyKey: "import:2026-08-20:001",
      payload: {
        sourceConnectionId: connectionId,
        storagePath: "other-workspace/list.csv",
        fileName: "list.csv",
        mediaType: "text/csv",
      },
    }),
  );
  assertThrows(
    () => toRpcRequest(parsed, userId),
    Error,
    "当前用户的工作空间目录",
  );
});

Deno.test(
  "requires uploaded files to stay inside the authenticated user prefix",
  () => {
    const parsed = parseWorkbenchAction(
      JSON.stringify({
        workspaceId,
        action: "start_ingestion",
        idempotencyKey: "import:2026-08-20:002",
        payload: {
          sourceConnectionId: connectionId,
          storagePath: `${workspaceId}/another-user/list.csv`,
          fileName: "list.csv",
          mediaType: "text/csv",
        },
      }),
    );
    assertThrows(
      () => toRpcRequest(parsed, userId),
      Error,
      "当前用户的工作空间目录",
    );
  },
);

Deno.test("rejects secret-like fields in query criteria", () => {
  assertThrows(
    () =>
      parseWorkbenchAction(
        JSON.stringify({
          workspaceId,
          action: "start_ingestion",
          idempotencyKey: "query:2026-08-20:002",
          payload: {
            sourceConnectionId: connectionId,
            queryKind: "company_search",
            criteria: { api_key: "must-not-enter-a-job-payload" },
          },
        }),
      ),
    Error,
    "凭证字段",
  );
});

Deno.test("requires a user-facing name for every company search", () => {
  assertThrows(
    () =>
      parseWorkbenchAction(
        JSON.stringify({
          workspaceId,
          action: "start_ingestion",
          idempotencyKey: "query:2026-08-20:missing-list-name",
          payload: {
            sourceConnectionId: connectionId,
            queryKind: "company_search",
            criteria: { region: "杭州市", industry: "工业自动化" },
          },
        }),
      ),
    Error,
    "名单名称",
  );
});

Deno.test("maps the public rule action to the database RPC action", () => {
  const parsed = parseWorkbenchAction(
    JSON.stringify({
      workspaceId,
      action: "run_ruleset",
      idempotencyKey: "rules:2026-08-20:001",
      payload: {
        ruleVersionId: "33333333-3333-4333-8333-333333333333",
        companyListId: "44444444-4444-4444-8444-444444444444",
        runMode: "full",
        engineVersion: "rules-v1",
      },
    }),
  );
  const rpc = toRpcRequest(parsed);
  assertEquals(rpc.p_action, "run_rules");
  assertEquals(rpc.p_payload.run_mode, "full");
});
