import { z } from "npm:zod@4.4.3";

const MAX_REQUEST_BYTES = 128 * 1024;
const SECRET_KEY_PATTERN =
  /(^|[_-])(api[_-]?key|token|password|secret|authorization|cloud[_-]?token)($|[_-])/i;

const workspaceIdSchema = z.string().uuid();
const idSchema = z.string().uuid();
const idempotencyKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

const jsonObjectSchema = z
  .record(z.string(), z.unknown())
  .superRefine((value, ctx) => {
    let serialized = "";
    try {
      serialized = JSON.stringify(value);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "必须是可序列化对象",
      });
      return;
    }
    if (new TextEncoder().encode(serialized).byteLength > 64 * 1024) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "对象内容过大" });
    }
    const stack: unknown[] = [value];
    while (stack.length > 0) {
      const current = stack.pop();
      if (Array.isArray(current)) {
        stack.push(...current);
        continue;
      }
      if (!current || typeof current !== "object") continue;
      for (const [key, child] of Object.entries(current)) {
        if (SECRET_KEY_PATTERN.test(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `请求中不得包含凭证字段：${key}`,
          });
        }
        stack.push(child);
      }
    }
  });

const testConnectionSchema = z.object({
  workspaceId: workspaceIdSchema,
  action: z.literal("test_connection"),
  idempotencyKey: idempotencyKeySchema,
  payload: z.object({ connectionId: idSchema }).strict(),
});

const fileIngestionPayloadSchema = z
  .object({
    sourceConnectionId: idSchema,
    storagePath: z.string().min(3).max(1024),
    fileName: z
      .string()
      .min(1)
      .max(255)
      .refine((value) => !/[\\/]/.test(value), "文件名不得包含路径"),
    mediaType: z.enum([
      "text/csv",
      "application/json",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ]),
    mappingVersionId: idSchema.optional(),
  })
  .strict();

const queryIngestionPayloadSchema = z
  .object({
    sourceConnectionId: idSchema,
    queryKind: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9._-]+$/),
    queryText: z.string().trim().min(1).max(2000).optional(),
    listName: z.string().trim().min(2).max(120).optional(),
    criteria: jsonObjectSchema,
    mappingVersionId: idSchema.optional(),
  })
  .strict();

const startIngestionSchema = z.object({
  workspaceId: workspaceIdSchema,
  action: z.literal("start_ingestion"),
  idempotencyKey: idempotencyKeySchema,
  payload: z.union([fileIngestionPayloadSchema, queryIngestionPayloadSchema]),
});

const runRulesetSchema = z.object({
  workspaceId: workspaceIdSchema,
  action: z.literal("run_ruleset"),
  idempotencyKey: idempotencyKeySchema,
  payload: z
    .object({
      ruleVersionId: idSchema,
      companyListId: idSchema,
      runMode: z.enum(["sample", "full"]).default("full"),
      engineVersion: z.string().min(1).max(80),
      runConfig: jsonObjectSchema.optional(),
    })
    .strict(),
});

const startExportSchema = z.object({
  workspaceId: workspaceIdSchema,
  action: z.literal("start_export"),
  idempotencyKey: idempotencyKeySchema,
  payload: z
    .object({
      companyListId: idSchema.optional(),
      ruleRunId: idSchema.optional(),
      format: z.enum(["csv", "xlsx", "json", "html"]),
      selectedFields: z.array(z.string().min(1).max(120)).max(200).optional(),
      filterDefinition: jsonObjectSchema.optional(),
    })
    .strict()
    .refine(
      (value) => Boolean(value.companyListId || value.ruleRunId),
      "导出必须指定企业名单或规则运行",
    ),
});

export const workbenchActionSchema = z.discriminatedUnion("action", [
  testConnectionSchema,
  startIngestionSchema,
  runRulesetSchema,
  startExportSchema,
]);

export type WorkbenchActionRequest = z.infer<typeof workbenchActionSchema>;

export interface RpcRequest {
  p_workspace_id: string;
  p_action:
    | "test_connection"
    | "start_ingestion"
    | "run_rules"
    | "create_export";
  p_payload: Record<string, unknown>;
  p_idempotency_key: string;
}

export function parseWorkbenchAction(rawBody: string): WorkbenchActionRequest {
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    throw new Error("请求体超过 128 KiB 限制");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error("请求体不是有效 JSON");
  }
  return workbenchActionSchema.parse(parsed);
}

export function toRpcRequest(
  request: WorkbenchActionRequest,
  authenticatedUserId?: string,
): RpcRequest {
  const common = {
    p_workspace_id: request.workspaceId,
    p_idempotency_key: request.idempotencyKey,
  };

  if (request.action === "test_connection") {
    return {
      ...common,
      p_action: "test_connection",
      p_payload: { source_connection_id: request.payload.connectionId },
    };
  }

  if (request.action === "start_ingestion") {
    if ("storagePath" in request.payload) {
      const normalizedPath = request.payload.storagePath.replace(/^\/+/, "");
      const requiredPrefix = authenticatedUserId
        ? `${request.workspaceId}/${authenticatedUserId}/`
        : `${request.workspaceId}/`;
      if (
        normalizedPath.includes("..") ||
        !normalizedPath.startsWith(requiredPrefix)
      ) {
        throw new Error("导入文件必须位于当前用户的工作空间目录");
      }
      return {
        ...common,
        p_action: "start_ingestion",
        p_payload: {
          source_connection_id: request.payload.sourceConnectionId,
          job_kind: "import",
          mapping_version_id: request.payload.mappingVersionId,
          input_object_path: normalizedPath,
          input_params: {
            file_name: request.payload.fileName,
            media_type: request.payload.mediaType,
          },
        },
      };
    }
    return {
      ...common,
      p_action: "start_ingestion",
      p_payload: {
        source_connection_id: request.payload.sourceConnectionId,
        job_kind: "query",
        mapping_version_id: request.payload.mappingVersionId,
        input_params: {
          query_kind: request.payload.queryKind,
          query_text: request.payload.queryText,
          list_name: request.payload.listName,
          criteria: request.payload.criteria,
        },
      },
    };
  }

  if (request.action === "run_ruleset") {
    return {
      ...common,
      p_action: "run_rules",
      p_payload: {
        rule_version_id: request.payload.ruleVersionId,
        company_list_id: request.payload.companyListId,
        run_mode: request.payload.runMode,
        engine_version: request.payload.engineVersion,
        run_config: request.payload.runConfig ?? {},
      },
    };
  }

  return {
    ...common,
    p_action: "create_export",
    p_payload: {
      company_list_id: request.payload.companyListId,
      rule_run_id: request.payload.ruleRunId,
      export_format: request.payload.format,
      selected_fields: request.payload.selectedFields ?? [],
      filter_definition: request.payload.filterDefinition ?? {},
    },
  };
}
