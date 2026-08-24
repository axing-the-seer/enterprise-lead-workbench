import type { CsvMappingConfig } from "../../../src/providers/csv/adapter";
import {
  adapterContext,
  createCsvAdapter,
  kcAdapter,
  kcRiskAdapter,
  qichachaCliAdapter,
  type AdaptedProviderRecord,
} from "../../../src/providers";
import { WorkerError } from "./errors";
import { searchCompanyPublicInformation, testEgoBrowser } from "./ego-report";
import { parseImportFile } from "./file-import";
import { KcApiClient } from "./kc-api";
import { QccCliClient, type QccCapability } from "./qcc-cli";
import { sha256 } from "./stable-json";
import type {
  ClaimedWorkbenchJob,
  SourceConnection,
  WorkbenchStore,
} from "./types";

const MAX_RAW_RECORD_BYTES = 1024 * 1024;
const SECRET_FIELD =
  /(^|[_-])(api[_-]?key|token|password|secret|authorization)($|[_-])/i;

type PreparedRecord = {
  raw: Record<string, unknown>;
  adapted: AdaptedProviderRecord;
  warnings: string[];
  recordKind: string;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uuidOrNull(value: unknown): string | null {
  const parsed = text(value);
  return parsed && /^[0-9a-f-]{36}$/i.test(parsed) ? parsed : null;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkerError(
      "PROVIDER_RECORD_INVALID",
      "数据源返回的企业记录不是对象。",
    );
  }
  return value as Record<string, unknown>;
}

function rowsFromProviderResponse(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(object);
  const envelope = object(value);
  for (const key of [
    "records",
    "Records",
    "result",
    "Result",
    "data",
    "Data",
  ]) {
    const candidate = envelope[key];
    if (Array.isArray(candidate)) return candidate.map(object);
  }
  return [envelope];
}

function rejectSecretsAndOversize(value: Record<string, unknown>): void {
  const encoded = JSON.stringify(value);
  if (new TextEncoder().encode(encoded).byteLength > MAX_RAW_RECORD_BYTES) {
    throw new WorkerError(
      "SOURCE_RECORD_TOO_LARGE",
      "单条数据源记录超过 1 MiB 限制。",
    );
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
      if (SECRET_FIELD.test(key)) {
        throw new WorkerError(
          "SOURCE_RECORD_CONTAINS_SECRET",
          `源记录包含疑似凭证列“${key}”，已拒绝入库。`,
        );
      }
      stack.push(child);
    }
  }
}

function qccCapability(queryKind: string): QccCapability {
  if (queryKind === "company_detail") return "company_registration";
  throw new WorkerError(
    "QCC_QUERY_KIND_UNSUPPORTED",
    "当前企查查生产映射只开放已用当前账号验收过的工商登记核验。",
  );
}

async function prepareQccRecords(
  connection: SourceConnection,
  inputParams: Record<string, unknown>,
): Promise<PreparedRecord[]> {
  const queryKind = text(inputParams.query_kind) ?? "company_detail";
  const criteria = object(inputParams.criteria ?? {});
  const searchKey =
    text(criteria.searchKey) ??
    text(criteria.companyName) ??
    text(criteria.creditCode);
  if (!searchKey) {
    throw new WorkerError(
      "QCC_SEARCH_KEY_REQUIRED",
      "企查查查询需要企业名称或统一社会信用代码。",
    );
  }
  const executable =
    text(connection.connection_config.executable) ??
    process.env.QCC_CLI_PATH ??
    "qcc";
  const response = await new QccCliClient(executable).query(
    qccCapability(queryKind),
    searchKey,
  );
  const retrievedAt = new Date().toISOString();
  return rowsFromProviderResponse(response).map((raw, sourceIndex) => ({
    raw,
    adapted: qichachaCliAdapter.normalizeRecord(
      raw,
      adapterContext({ retrievedAt }),
      {},
      sourceIndex,
    ),
    warnings: [],
    recordKind: queryKind,
  }));
}

async function prepareKcRecords(
  connection: SourceConnection,
  inputParams: Record<string, unknown>,
): Promise<PreparedRecord[]> {
  const queryKind = text(inputParams.query_kind) ?? "company_search";
  if (queryKind !== "company_search" && queryKind !== "risk_enrichment") {
    throw new WorkerError(
      "KC_QUERY_KIND_UNSUPPORTED",
      "获客助手只支持企业名单搜索或单企风险补充。",
    );
  }
  const criteria = object(inputParams.criteria ?? {});
  const client = new KcApiClient({
    baseUrl: connection.connection_config.baseUrl,
    secretReference: connection.secret_reference,
  });
  const retrievedAt = new Date().toISOString();
  if (queryKind === "risk_enrichment") {
    const searchKey =
      text(criteria.searchKey) ??
      text(criteria.companyName) ??
      text(criteria.creditCode);
    if (!searchKey) {
      throw new WorkerError(
        "KC_SEARCH_KEY_REQUIRED",
        "单企风险补充需要企业全名或统一社会信用代码。",
      );
    }
    const envelope = object(await client.checkRisk(searchKey));
    if (
      !envelope.data ||
      typeof envelope.data !== "object" ||
      Array.isArray(envelope.data)
    ) {
      throw new WorkerError(
        "KC_RISK_REPORT_UNAVAILABLE",
        "工商司法报告返回空；这可能是无数据、未订阅、余额不足或产品禁用，不能解释为企业无风险。",
      );
    }
    const raw = envelope.data as Record<string, unknown>;
    return [
      {
        raw,
        adapted: kcRiskAdapter.normalizeRecord(
          raw,
          adapterContext({ retrievedAt }),
          {},
          0,
        ),
        warnings: [],
        recordKind: queryKind,
      },
    ];
  }
  const response = await client.searchCompanies(criteria);
  return rowsFromProviderResponse(response).map((raw, sourceIndex) => ({
    raw,
    adapted: kcAdapter.normalizeRecord(
      raw,
      adapterContext({ retrievedAt }),
      {},
      sourceIndex,
    ),
    warnings: [],
    recordKind: queryKind,
  }));
}

async function prepareUploadedRecords(
  job: ClaimedWorkbenchJob,
  store: WorkbenchStore,
): Promise<PreparedRecord[]> {
  const inputPath = text(job.payload.input_object_path);
  const inputParams = object(job.payload.input_params ?? {});
  const fileName = text(inputParams.file_name);
  const mediaType = text(inputParams.media_type);
  if (!inputPath || !fileName || !mediaType) {
    throw new WorkerError(
      "IMPORT_JOB_INVALID",
      "文件导入任务缺少文件路径或格式。",
    );
  }
  const imported = await parseImportFile(
    await store.downloadImport(inputPath),
    fileName,
    mediaType,
  );
  const mappingVersionId = uuidOrNull(job.payload.mapping_version_id);
  const mapping = await store.loadMappingDefinition(
    job.workspace_id,
    mappingVersionId,
  );
  const config: CsvMappingConfig = {
    ...(mapping ?? {}),
    providerName: "用户上传文件",
    sourceFileName: fileName,
    retrievedAt: new Date().toISOString(),
  } as CsvMappingConfig;
  const adapter = createCsvAdapter(config);
  const context = adapterContext({
    retrievedAt: config.retrievedAt,
    providerName: config.providerName,
  });
  return imported.rows.map((raw, sourceIndex) => ({
    raw,
    adapted: adapter.normalizeRecord(raw, context, {}, sourceIndex),
    warnings: imported.warnings,
    recordKind: "file_import",
  }));
}

async function processEgoPublicReport(
  job: ClaimedWorkbenchJob,
  connection: SourceConnection,
  store: WorkbenchStore,
): Promise<Record<string, unknown>> {
  const inputParams = object(job.payload.input_params ?? {});
  const criteria = object(inputParams.criteria ?? {});
  const unexpectedCriteria = Object.keys(criteria).filter(
    (key) =>
      !["companyId", "claimType", "reportMode", "maxResults"].includes(key),
  );
  if (
    text(inputParams.query_kind) !== "web_evidence" ||
    text(criteria.claimType) !== "public_report" ||
    criteria.reportMode !== true ||
    unexpectedCriteria.length > 0
  ) {
    throw new WorkerError(
      "WEB_SEARCH_QUERY_INVALID",
      "Ego Lite 只接受绑定已入库企业的公开信息报告任务。",
    );
  }
  const companyId = Number(criteria.companyId);
  if (!Number.isSafeInteger(companyId) || companyId <= 0) {
    throw new WorkerError(
      "EGO_REPORT_COMPANY_REQUIRED",
      "公开信息报告需要已入库的有效企业标识。",
    );
  }
  const maxResults = Math.max(
    1,
    Math.min(8, Number(criteria.maxResults ?? 6) || 6),
  );
  const company = await store.loadCompanyForEvidence(
    job.workspace_id,
    companyId,
  );
  const executable =
    text(connection.connection_config.executable) ??
    process.env.EGO_BROWSER_PATH ??
    "ego-browser";
  const searched = await searchCompanyPublicInformation({
    companyName: company.name,
    maxResults,
    executable,
  });
  const reportEvidence = searched.items.slice(0, 24).map((item, index) => ({
    id: `ev-${String(index + 1).padStart(3, "0")}`,
    ...item,
    retrievedAt: searched.generatedAt,
  }));
  const evidenceItems = reportEvidence.slice(0, 10).map((item) => ({
    url: item.url,
    title: item.title,
    snippet: item.snippet,
    claimType: item.kind,
    usageScope: "link_only",
    confidence: item.kind === "official_website" ? 0.72 : 0.62,
    retrievedAt: item.retrievedAt,
    sourceName: item.sourceName || "百度公开搜索结果",
    query: item.query,
    relevance: item.relevance,
    linkKind: item.linkKind,
    version: "ego-lite-agent-evidence-v2",
    requestId: job.job_id,
  }));
  const rawPayload = {
    Engine: "ego_lite",
    GeneratedAt: searched.generatedAt,
    CompanyName: company.name,
    Coverage: searched.coverage,
    SearchResults: searched.items,
  };
  rejectSecretsAndOversize(rawPayload);
  const normalizedPayload = {
    schemaVersion: "1.0",
    provider: "ego_lite",
    evidencePackageVersion: "2.0",
    companyId,
    companyName: company.name,
    generatedAt: searched.generatedAt,
    coverage: searched.coverage,
    evidence: reportEvidence,
  };
  const persisted = await store.persistWebEvidence({
    jobId: job.job_id,
    companyId,
    sourceRecordKey: `ego-report:${companyId}:${sha256({
      generatedAt: searched.generatedAt,
      items: searched.items.map((item) => [item.kind, item.url]),
    })}`,
    rawPayload,
    rawHash: sha256(rawPayload),
    observedAt: searched.generatedAt,
    normalizedPayload,
    normalizedHash: sha256(normalizedPayload),
    evidenceItems,
  });
  await store.markConnectionChecked(connection, {
    status: "ready",
    verifiedAt: searched.generatedAt,
  });
  const coveragePartial = searched.coverage.some(
    (item) => item.status !== "complete",
  );
  return {
    received_count: evidenceItems.length,
    accepted_count: persisted.evidence_count,
    rejected_count: 0,
    discovered_count: searched.items.length,
    company_id: companyId,
    source_record_id: persisted.source_record_id,
    source_snapshot_id: persisted.source_snapshot_id,
    evidence_count: persisted.evidence_count,
    force_partial: coveragePartial,
    evidence_package_version: "2.0",
    report_stage: "awaiting_agent",
    report: {
      evidenceJobId: job.job_id,
      companyId,
      companyName: company.name,
      creditCode: company.creditCode,
      generatedAt: searched.generatedAt,
      coverage: searched.coverage,
      evidenceCount: searched.items.length,
      collectionMethod: "ego_lite",
      analysisMethod: "external_agent",
      stage: "awaiting_agent",
    },
  };
}

async function testConnection(
  connection: SourceConnection,
  store: WorkbenchStore,
): Promise<Record<string, unknown>> {
  if (connection.provider === "qcc") {
    const executable =
      text(connection.connection_config.executable) ??
      process.env.QCC_CLI_PATH ??
      "qcc";
    const result = await new QccCliClient(executable).testConnection();
    await store.markConnectionChecked(connection, { status: "degraded" });
    return {
      provider: "qcc",
      client_version: result.version,
      verification_scope: "client_only",
      note: "客户端可用；尚未消耗查询额度验证远程授权。第一次真实查询成功后状态会更新为已验证。",
    };
  }
  if (connection.provider === "huoke_assistant") {
    const client = new KcApiClient({
      baseUrl: connection.connection_config.baseUrl,
      secretReference: connection.secret_reference,
    });
    await store.markConnectionChecked(connection, { status: "degraded" });
    return {
      provider: "huoke_assistant",
      ...client.configurationStatus(),
      verification_scope: "configuration_only",
      note: "连接配置有效；尚未消耗查询额度。第一次真实查询成功后状态会更新为已验证。",
    };
  }
  if (connection.provider === "file_upload") {
    const verifiedAt = new Date().toISOString();
    await store.markConnectionChecked(connection, {
      status: "ready",
      verifiedAt,
    });
    return {
      provider: "file_upload",
      verification_scope: "local_storage",
      verified_at: verifiedAt,
    };
  }
  if (connection.provider === "web_search") {
    const result = await testEgoBrowser(
      text(connection.connection_config.executable) ??
        process.env.EGO_BROWSER_PATH ??
        "ego-browser",
    );
    const verifiedAt = new Date().toISOString();
    await store.markConnectionChecked(connection, {
      status: "ready",
      verifiedAt,
    });
    return {
      provider: "web_search",
      engine: "ego_lite",
      ...result,
      verification_scope: "local_browser_runtime",
      verified_at: verifiedAt,
      note: "本机 Ego Lite 已成功打开公开网页；未发起企业报告检索。",
    };
  }
  throw new WorkerError(
    "SOURCE_PROVIDER_UNSUPPORTED",
    "该数据源尚未安装生产执行器。",
  );
}

export async function processIngestionJob(
  job: ClaimedWorkbenchJob,
  store: WorkbenchStore,
): Promise<Record<string, unknown>> {
  const connectionId = text(job.payload.source_connection_id);
  if (!connectionId)
    throw new WorkerError(
      "SOURCE_CONNECTION_REQUIRED",
      "接入任务缺少数据源连接。",
    );
  const connection = await store.getSourceConnection(
    job.workspace_id,
    connectionId,
  );
  const jobKind = text(job.payload.job_kind) ?? "query";
  if (jobKind === "connection_test") return testConnection(connection, store);
  if (connection.provider === "web_search") {
    if (jobKind !== "query" && jobKind !== "enrich") {
      throw new WorkerError(
        "WEB_SEARCH_JOB_KIND_UNSUPPORTED",
        "Web 证据只能作为企业补证任务执行。",
      );
    }
    return processEgoPublicReport(job, connection, store);
  }

  let prepared: PreparedRecord[];
  if (jobKind === "import") {
    if (connection.provider !== "file_upload") {
      throw new WorkerError(
        "IMPORT_SOURCE_MISMATCH",
        "文件任务必须使用文件上传数据源。",
      );
    }
    prepared = await prepareUploadedRecords(job, store);
  } else if (connection.provider === "qcc") {
    prepared = await prepareQccRecords(
      connection,
      object(job.payload.input_params ?? {}),
    );
  } else if (connection.provider === "huoke_assistant") {
    prepared = await prepareKcRecords(
      connection,
      object(job.payload.input_params ?? {}),
    );
  } else {
    throw new WorkerError(
      "SOURCE_PROVIDER_UNSUPPORTED",
      "该数据源尚未安装生产查询执行器。",
    );
  }

  const sourceQueryId = uuidOrNull(job.payload.source_query_id);
  const requestedBy = uuidOrNull(job.payload.requested_by);
  // QCC company_detail enriches an already-managed company. Its independent
  // source facts belong on that company, but the enrichment must not create a
  // synthetic "data batch" in My Lists.
  const inputParams = object(job.payload.input_params ?? {});
  const createsList = !(
    connection.provider === "qcc" &&
    text(inputParams.query_kind) === "company_detail"
  );
  const listId = createsList
    ? await store.ensureIngestionList(job, sourceQueryId, requestedBy)
    : null;
  let accepted = 0;
  const verifiedCompanyIds: number[] = [];
  const rejected: { index: number; code: string }[] = [];
  for (const [index, record] of prepared.entries()) {
    try {
      rejectSecretsAndOversize(record.raw);
      const canonical = record.adapted.canonical;
      const sourceRecordKey =
        canonical.creditCode ?? `${canonical.leadId}:${index}`;
      const persisted = await store.persistIngestionRecord({
        jobId: job.job_id,
        sourceRecordKey,
        recordKind: record.recordKind,
        rawPayload: record.raw,
        rawHash: sha256(record.raw),
        observedAt: record.adapted.provenance[0]?.retrievedAt ?? null,
        normalizedPayload: canonical,
        normalizedHash: sha256(canonical),
        mappingWarnings: record.warnings,
      });
      if (listId) {
        await store.addCompanyListMember(
          job.job_id,
          job.workspace_id,
          listId,
          persisted,
          requestedBy,
        );
      } else {
        verifiedCompanyIds.push(persisted.company_id);
      }
      accepted += 1;
    } catch (error) {
      rejected.push({
        index,
        code:
          error instanceof WorkerError ? error.code : "RECORD_MAPPING_FAILED",
      });
    }
  }

  if (accepted > 0 && connection.provider !== "file_upload") {
    await store.markConnectionChecked(connection, {
      status: "ready",
      verifiedAt: new Date().toISOString(),
    });
  }
  if (accepted === 0) {
    throw new WorkerError(
      "INGESTION_NO_ACCEPTED_RECORDS",
      `本批 ${prepared.length} 条记录均未通过映射；请查看拒绝原因代码。`,
    );
  }
  return {
    received_count: prepared.length,
    accepted_count: accepted,
    rejected_count: rejected.length,
    ...(listId
      ? { company_list_id: listId }
      : { verified_company_ids: [...new Set(verifiedCompanyIds)] }),
    rejected_records: rejected.slice(0, 100),
    truncated_rejections: rejected.length > 100,
  };
}
