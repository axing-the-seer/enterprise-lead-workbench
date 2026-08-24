import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { RuleTemplateSchema } from "../../../src/domain";
import { WorkerError } from "./errors";
import {
  mergeLatestLeadSnapshots,
  type PersistedLeadSnapshot,
} from "./lead-merge";
import type {
  ClaimedWorkbenchJob,
  CompletionStatus,
  ExportContext,
  EvidenceCompany,
  LeadRecord,
  PersistedIngestionRecord,
  PersistedWebEvidence,
  PersistIngestionRecordInput,
  PersistWebEvidenceInput,
  RuleResultWrite,
  RuleRunContext,
  SourceConnection,
  WorkbenchStore,
} from "./types";

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value)
    throw new WorkerError(
      "WORKER_CONFIGURATION_MISSING",
      `缺少部署变量 ${name}。`,
    );
  return value;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstRow<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return value ? (value as T) : null;
}

function message(error: { message?: string; code?: string } | null): string {
  return error?.code
    ? `${error.code}: ${error.message ?? "database error"}`
    : (error?.message ?? "database error");
}

export class SupabaseWorkbenchStore implements WorkbenchStore {
  readonly client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client =
      client ??
      createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false, autoRefreshToken: false },
      });
  }

  async claimNext(workerId: string): Promise<ClaimedWorkbenchJob | null> {
    const { data, error } = await this.client.rpc("claim_next_workbench_job", {
      p_worker_id: workerId,
    });
    if (error) throw new WorkerError("JOB_CLAIM_FAILED", message(error));
    const row = firstRow<ClaimedWorkbenchJob>(data);
    return row ? { ...row, payload: asObject(row.payload) } : null;
  }

  async complete(
    job: ClaimedWorkbenchJob,
    status: CompletionStatus,
    result: Record<string, unknown>,
    errorCode?: string,
    errorMessage?: string,
  ): Promise<void> {
    const { error } = await this.client.rpc("complete_workbench_job", {
      p_job_type: job.job_type,
      p_job_id: job.job_id,
      p_status: status,
      p_result: result,
      p_error_code: errorCode ?? null,
      p_error_message: errorMessage ?? null,
    });
    if (error) throw new WorkerError("JOB_COMPLETION_FAILED", message(error));
  }

  async getSourceConnection(
    workspaceId: string,
    connectionId: string,
  ): Promise<SourceConnection> {
    const { data, error } = await this.client
      .from("source_connections")
      .select(
        "id,workspace_id,provider,name,connection_kind,status,secret_reference,connection_config,capabilities",
      )
      .eq("workspace_id", workspaceId)
      .eq("id", connectionId)
      .single();
    if (error || !data) {
      throw new WorkerError(
        "SOURCE_CONNECTION_NOT_FOUND",
        "数据源连接不存在或不属于当前工作空间。",
      );
    }
    return {
      ...(data as Omit<SourceConnection, "connection_config" | "capabilities">),
      connection_config: asObject(data.connection_config),
      capabilities: Array.isArray(data.capabilities)
        ? data.capabilities.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
    };
  }

  async markConnectionChecked(
    connection: SourceConnection,
    result: {
      status: "ready" | "degraded" | "error";
      verifiedAt?: string;
      errorCode?: string;
    },
  ): Promise<void> {
    const { error } = await this.client
      .from("source_connections")
      .update({
        status: result.status,
        last_verified_at: result.verifiedAt ?? null,
        last_error_code: result.errorCode ?? null,
      })
      .eq("workspace_id", connection.workspace_id)
      .eq("id", connection.id);
    if (error)
      throw new WorkerError("SOURCE_CONNECTION_UPDATE_FAILED", message(error));
  }

  async downloadImport(path: string): Promise<Uint8Array> {
    const { data, error } = await this.client.storage
      .from("workbench-imports")
      .download(path);
    if (error || !data)
      throw new WorkerError("IMPORT_DOWNLOAD_FAILED", "无法读取上传文件。");
    return new Uint8Array(await data.arrayBuffer());
  }

  async loadMappingDefinition(
    workspaceId: string,
    mappingVersionId: string | null,
  ): Promise<Record<string, unknown> | null> {
    if (!mappingVersionId) return null;
    const { data, error } = await this.client
      .from("field_mapping_versions")
      .select("mapping_definition")
      .eq("workspace_id", workspaceId)
      .eq("id", mappingVersionId)
      .single();
    if (error || !data)
      throw new WorkerError(
        "MAPPING_VERSION_NOT_FOUND",
        "字段映射版本不存在。",
      );
    return asObject(data.mapping_definition);
  }

  async persistIngestionRecord(
    input: PersistIngestionRecordInput,
  ): Promise<PersistedIngestionRecord> {
    const { data, error } = await this.client.rpc(
      "persist_workbench_ingestion_record",
      {
        p_job_id: input.jobId,
        p_source_record_key: input.sourceRecordKey,
        p_record_kind: input.recordKind,
        p_raw_payload: input.rawPayload,
        p_raw_hash: input.rawHash,
        p_observed_at: input.observedAt,
        p_normalized_payload: input.normalizedPayload,
        p_normalized_hash: input.normalizedHash,
        p_mapping_warnings: input.mappingWarnings,
      },
    );
    if (error)
      throw new WorkerError("INGESTION_PERSIST_FAILED", message(error));
    const row = firstRow<PersistedIngestionRecord>(data);
    if (!row)
      throw new WorkerError(
        "INGESTION_PERSIST_EMPTY",
        "入库服务没有返回记录标识。",
      );
    return row;
  }

  async loadCompanyForEvidence(
    workspaceId: string,
    companyId: number,
  ): Promise<EvidenceCompany> {
    const { data, error } = await this.client
      .from("companies")
      .select("id,name,unified_social_credit_code")
      .eq("workspace_id", workspaceId)
      .eq("id", companyId)
      .single();
    if (error || !data) {
      throw new WorkerError(
        "WEB_EVIDENCE_COMPANY_NOT_FOUND",
        "待补证企业不存在或不属于当前工作空间。",
      );
    }
    return {
      id: Number(data.id),
      name: String(data.name),
      creditCode:
        typeof data.unified_social_credit_code === "string"
          ? data.unified_social_credit_code
          : null,
    };
  }

  async persistWebEvidence(
    input: PersistWebEvidenceInput,
  ): Promise<PersistedWebEvidence> {
    const { data, error } = await this.client.rpc(
      "persist_workbench_web_evidence",
      {
        p_job_id: input.jobId,
        p_company_id: input.companyId,
        p_source_record_key: input.sourceRecordKey,
        p_raw_payload: input.rawPayload,
        p_raw_hash: input.rawHash,
        p_observed_at: input.observedAt,
        p_normalized_payload: input.normalizedPayload,
        p_normalized_hash: input.normalizedHash,
        p_evidence_items: input.evidenceItems,
      },
    );
    if (error) {
      throw new WorkerError("WEB_EVIDENCE_PERSIST_FAILED", message(error));
    }
    const row = firstRow<PersistedWebEvidence>(data);
    if (!row) {
      throw new WorkerError(
        "WEB_EVIDENCE_PERSIST_EMPTY",
        "Web 证据入库服务没有返回记录标识。",
      );
    }
    return row;
  }

  async ensureIngestionList(
    job: ClaimedWorkbenchJob,
    _sourceQueryId: string | null,
    _requestedBy: string | null,
  ): Promise<string> {
    const inputParams =
      job.payload.input_params &&
      typeof job.payload.input_params === "object" &&
      !Array.isArray(job.payload.input_params)
        ? (job.payload.input_params as Record<string, unknown>)
        : {};
    const requestedName =
      typeof inputParams.list_name === "string"
        ? inputParams.list_name.trim().slice(0, 120)
        : "";
    const { data, error } = await this.client.rpc(
      "ensure_ingestion_company_list",
      {
        p_job_id: job.job_id,
        p_name: requestedName || `数据批次 ${job.job_id.slice(0, 8)}`,
      },
    );
    if (error || !data)
      throw new WorkerError("COMPANY_LIST_CREATE_FAILED", message(error));
    return String(data);
  }

  async addCompanyListMember(
    jobId: string,
    workspaceId: string,
    listId: string,
    persisted: PersistedIngestionRecord,
    requestedBy: string | null,
  ): Promise<void> {
    void workspaceId;
    void requestedBy;
    const { error } = await this.client.rpc("add_ingestion_list_member", {
      p_job_id: jobId,
      p_company_list_id: listId,
      p_company_id: persisted.company_id,
      p_source_record_id: persisted.source_record_id,
    });
    if (error)
      throw new WorkerError("COMPANY_LIST_MEMBER_FAILED", message(error));
  }

  async loadRuleRunContext(job: ClaimedWorkbenchJob): Promise<RuleRunContext> {
    const ruleVersionId = String(job.payload.rule_version_id ?? "");
    const companyListId = String(job.payload.company_list_id ?? "");
    const { data, error } = await this.client
      .from("rule_set_versions")
      .select("rule_definition")
      .eq("workspace_id", job.workspace_id)
      .eq("id", ruleVersionId)
      .single();
    if (error || !data)
      throw new WorkerError("RULE_VERSION_NOT_FOUND", "规则版本不存在。");
    const { data: currentManifest, error: manifestError } =
      await this.client.rpc("get_company_list_manifest_hash", {
        p_workspace_id: job.workspace_id,
        p_company_list_id: companyListId,
      });
    if (manifestError)
      throw new WorkerError(
        "RULE_MANIFEST_CHECK_FAILED",
        message(manifestError),
      );
    if (
      String(currentManifest) !== String(job.payload.input_manifest_hash ?? "")
    ) {
      throw new WorkerError(
        "RULE_INPUT_CHANGED",
        "名单在规则任务提交后发生了变化；请重新发起规则运行。",
      );
    }
    return {
      template: RuleTemplateSchema.parse(data.rule_definition),
      records: await this.loadListRecords(job.workspace_id, companyListId),
    };
  }

  async saveRuleResults(rows: RuleResultWrite[]): Promise<void> {
    for (let offset = 0; offset < rows.length; offset += 500) {
      const { error } = await this.client
        .from("rule_results")
        .upsert(rows.slice(offset, offset + 500), {
          onConflict: "workspace_id,rule_run_id,company_id",
        });
      if (error)
        throw new WorkerError("RULE_RESULTS_PERSIST_FAILED", message(error));
    }
  }

  async loadExportContext(job: ClaimedWorkbenchJob): Promise<ExportContext> {
    let companyListId = String(job.payload.company_list_id ?? "");
    const ruleRunId = String(job.payload.rule_run_id ?? "");
    if (!companyListId && ruleRunId) {
      const { data, error } = await this.client
        .from("rule_runs")
        .select("company_list_id")
        .eq("workspace_id", job.workspace_id)
        .eq("id", ruleRunId)
        .single();
      if (error || !data)
        throw new WorkerError(
          "EXPORT_SCOPE_NOT_FOUND",
          "导出关联的规则运行不存在。",
        );
      companyListId = String(data.company_list_id);
    }
    const records = await this.loadListRecords(job.workspace_id, companyListId);
    const decisions = new Map<number, string>();
    if (ruleRunId) {
      let from = 0;
      while (true) {
        const { data, error } = await this.client
          .from("rule_results")
          .select("company_id,decision")
          .eq("workspace_id", job.workspace_id)
          .eq("rule_run_id", ruleRunId)
          .range(from, from + 999);
        if (error)
          throw new WorkerError("EXPORT_RESULTS_LOAD_FAILED", message(error));
        for (const row of data ?? [])
          decisions.set(Number(row.company_id), String(row.decision));
        if (!data || data.length < 1000) break;
        from += 1000;
      }
    }
    return { records, decisions };
  }

  async uploadExport(
    path: string,
    mediaType: string,
    content: Uint8Array,
  ): Promise<void> {
    const { error } = await this.client.storage
      .from("workbench-exports")
      .upload(path, content, { contentType: mediaType, upsert: false });
    if (error) throw new WorkerError("EXPORT_UPLOAD_FAILED", message(error));
  }

  private async loadListRecords(
    workspaceId: string,
    companyListId: string,
  ): Promise<LeadRecord[]> {
    if (!companyListId)
      throw new WorkerError("COMPANY_LIST_REQUIRED", "任务未指定企业名单。");
    const members: { company_id: number; source_record_id: string | null }[] =
      [];
    let from = 0;
    while (true) {
      const { data, error } = await this.client
        .from("company_list_members")
        .select("company_id,source_record_id")
        .eq("workspace_id", workspaceId)
        .eq("company_list_id", companyListId)
        .neq("membership_status", "excluded")
        .order("company_id")
        .range(from, from + 999);
      if (error)
        throw new WorkerError("COMPANY_LIST_LOAD_FAILED", message(error));
      members.push(...((data ?? []) as typeof members));
      if (!data || data.length < 1000) break;
      from += 1000;
    }

    const sourceByCompany = new Map(
      members.map((member) => [
        Number(member.company_id),
        member.source_record_id,
      ]),
    );
    const snapshots: PersistedLeadSnapshot[] = [];
    const companyIds = [...sourceByCompany.keys()];
    for (let offset = 0; offset < companyIds.length; offset += 100) {
      let snapshotFrom = 0;
      while (true) {
        const { data, error } = await this.client
          .from("source_snapshots")
          .select("company_id,captured_at,normalized_payload")
          .eq("workspace_id", workspaceId)
          .in("company_id", companyIds.slice(offset, offset + 100))
          .eq("match_status", "matched")
          .order("captured_at", { ascending: false })
          .range(snapshotFrom, snapshotFrom + 999);
        if (error) {
          throw new WorkerError("SOURCE_SNAPSHOT_LOAD_FAILED", message(error));
        }
        snapshots.push(...((data ?? []) as PersistedLeadSnapshot[]));
        if (!data || data.length < 1_000) break;
        snapshotFrom += 1_000;
      }
    }

    const { data: workspace, error: workspaceError } = await this.client
      .from("workspaces")
      .select("settings")
      .eq("id", workspaceId)
      .single();
    if (workspaceError || !workspace) {
      throw new WorkerError(
        "WORKSPACE_SETTINGS_LOAD_FAILED",
        "无法读取工作空间的数据源合并设置。",
      );
    }
    const configuredPriorities = asObject(
      asObject(workspace.settings).providerPriorities,
    );
    const providerPriorities = Object.fromEntries(
      Object.entries(configuredPriorities).flatMap(([providerId, value]) =>
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= -1_000 &&
        value <= 1_000
          ? [[providerId, value]]
          : [],
      ),
    );
    return mergeLatestLeadSnapshots(
      snapshots,
      sourceByCompany,
      providerPriorities,
    );
  }
}
