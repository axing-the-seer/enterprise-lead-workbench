import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import type { WorkbenchJobResponse, WorkbenchJobStatus } from "./types";

export type WorkbenchAction =
  | "test_connection"
  | "start_ingestion"
  | "run_ruleset"
  | "start_export";

const acceptedStatuses = new Set<WorkbenchJobStatus>([
  "queued",
  "running",
  "succeeded",
  "partial",
  "failed",
  "cancelled",
]);

export async function runWorkbenchAction(
  action: WorkbenchAction,
  workspaceId: string,
  payload: Record<string, unknown>,
  idempotencyKey = createIdempotencyKey(action),
): Promise<WorkbenchJobResponse> {
  const { data, error } = await getSupabaseClient().functions.invoke(
    "workbench-jobs",
    {
      body: { action, workspaceId, payload, idempotencyKey },
    },
  );

  if (error) {
    const response = (error as { context?: Response }).context;
    const detail = response
      ? await response
          .clone()
          .json()
          .catch(() => null)
      : null;
    const safeMessage =
      detail && typeof detail === "object"
        ? typeof detail.error === "string"
          ? detail.error
          : typeof detail.message === "string"
            ? detail.message
            : typeof detail.code === "string"
              ? detail.code
              : error.message || "无法连接 workbench-jobs"
        : error.message || "无法连接 workbench-jobs";
    throw new Error(`工作台执行服务不可用：${safeMessage}`);
  }

  if (
    !data ||
    typeof data.jobId !== "string" ||
    !acceptedStatuses.has(data.status)
  ) {
    throw new Error("工作台执行服务返回了无法识别的任务状态，请检查后端部署。");
  }

  return data as WorkbenchJobResponse;
}

export async function uploadWorkbenchImport(
  workspaceId: string,
  file: File,
): Promise<string> {
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("文件超过 20 MiB，请拆分后再上传。");
  }

  const client = getSupabaseClient();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) {
    throw new Error("无法确认当前登录账号，文件没有上传。");
  }

  const suffix = file.name.includes(".")
    ? file.name.slice(file.name.lastIndexOf("."))
    : "";
  const storagePath = `${workspaceId}/${authData.user.id}/${crypto.randomUUID()}${suffix}`;
  const { error } = await client.storage
    .from("workbench-imports")
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (error) {
    throw new Error(`文件上传失败：${error.message}`);
  }

  return storagePath;
}

export async function configureSourceConnection(input: {
  workspaceId: string;
  connectionId: string;
  provider: string;
  name: string;
  secretReference: string | null;
  connectionConfig: Record<string, unknown>;
}): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc(
    "configure_source_connection",
    {
      p_workspace_id: input.workspaceId,
      p_connection_id: input.connectionId,
      p_provider: input.provider,
      p_name: input.name,
      p_secret_reference: input.secretReference,
      p_connection_config: input.connectionConfig,
    },
  );

  if (error) {
    throw new Error(`数据源配置未保存：${error.message}`);
  }
  if (typeof data !== "string" || !data) {
    throw new Error("数据源配置服务返回了无法识别的连接标识。");
  }
  return data;
}

export async function configureProviderPriorities(
  workspaceId: string,
  priorities: Record<string, number>,
): Promise<Record<string, number>> {
  const { data, error } = await getSupabaseClient().rpc(
    "configure_provider_priorities",
    {
      p_workspace_id: workspaceId,
      p_priorities: priorities,
    },
  );

  if (error) {
    throw new Error(`数据源优先级未保存：${error.message}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("数据源优先级服务返回了无法识别的配置。");
  }
  const entries = Object.entries(data).filter(
    (entry): entry is [string, number] =>
      typeof entry[1] === "number" && Number.isFinite(entry[1]),
  );
  if (entries.length !== Object.keys(priorities).length) {
    throw new Error("数据源优先级服务返回的配置不完整。");
  }
  return Object.fromEntries(entries);
}

export type SavedRuleTemplate = {
  ruleSetId: string;
  ruleVersionId: string;
  versionNumber: number;
  status: "published";
};

export async function saveRuleTemplate(input: {
  workspaceId: string;
  ruleSetId?: string;
  name: string;
  description: string;
  businessObjective: string;
  ruleDefinition: Record<string, unknown>;
  scoringDefinition: Record<string, unknown>;
  changeNote: string;
}): Promise<SavedRuleTemplate> {
  const { data, error } = await getSupabaseClient().rpc("save_rule_template", {
    p_workspace_id: input.workspaceId,
    p_rule_set_id: input.ruleSetId ?? null,
    p_name: input.name,
    p_description: input.description,
    p_business_objective: input.businessObjective,
    p_rule_definition: input.ruleDefinition,
    p_scoring_definition: input.scoringDefinition,
    p_change_note: input.changeNote,
  });

  if (error) {
    throw new Error(`规则模板未保存：${error.message}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (
    !row ||
    typeof row.rule_set_id !== "string" ||
    typeof row.rule_version_id !== "string" ||
    !Number.isInteger(row.version_number) ||
    row.version_number < 1 ||
    row.status !== "published"
  ) {
    throw new Error("规则保存服务返回了无法识别的版本信息。");
  }
  return {
    ruleSetId: row.rule_set_id,
    ruleVersionId: row.rule_version_id,
    versionNumber: row.version_number,
    status: row.status,
  };
}

export function createIdempotencyKey(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}
