import { afterEach, describe, expect, it, vi } from "vitest";
import type { EgoSearchResult } from "./ego-report";
import type {
  ClaimedWorkbenchJob,
  SourceConnection,
  WorkbenchStore,
} from "./types";

const searchCompanyPublicInformation = vi.hoisted(() => vi.fn());
const qccQuery = vi.hoisted(() => vi.fn());

vi.mock("./ego-report", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return { ...original, searchCompanyPublicInformation };
});

vi.mock("./qcc-cli", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    QccCliClient: class {
      async query(capability: string, searchKey: string) {
        return qccQuery(capability, searchKey);
      }

      async testConnection() {
        return { version: "1.0.10" };
      }
    },
  };
});

import { processIngestionJob } from "./ingestion";

afterEach(() => {
  vi.clearAllMocks();
});

function webJob(criteria: Record<string, unknown>): ClaimedWorkbenchJob {
  return {
    job_type: "ingestion_job",
    job_id: "22222222-2222-4222-8222-222222222222",
    workspace_id: "11111111-1111-4111-8111-111111111111",
    payload: {
      source_connection_id: "33333333-3333-4333-8333-333333333333",
      job_kind: "enrich",
      input_params: { query_kind: "web_evidence", criteria },
    },
  };
}

const connection: SourceConnection = {
  id: "33333333-3333-4333-8333-333333333333",
  workspace_id: "11111111-1111-4111-8111-111111111111",
  provider: "web_search",
  name: "Ego Lite 公开信息报告",
  connection_kind: "web_search",
  status: "ready",
  secret_reference: null,
  connection_config: { engine: "ego_lite" },
  capabilities: ["web_evidence", "public_report", "html_report"],
};

const qccConnection: SourceConnection = {
  id: "66666666-6666-4666-8666-666666666666",
  workspace_id: "11111111-1111-4111-8111-111111111111",
  provider: "qcc",
  name: "企查查",
  connection_kind: "cli",
  status: "degraded",
  secret_reference: null,
  connection_config: { executable: "qcc" },
  capabilities: ["company_registration"],
};

const fileConnection: SourceConnection = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  workspace_id: "11111111-1111-4111-8111-111111111111",
  provider: "file_upload",
  name: "用户上传",
  connection_kind: "file_upload",
  status: "ready",
  secret_reference: null,
  connection_config: {},
  capabilities: ["file_import"],
};

const egoResult: EgoSearchResult = {
  generatedAt: "2026-08-24T02:30:00.000Z",
  engine: "ego_lite",
  companyName: "某某测试有限公司",
  coverage: [
    {
      kind: "official_website",
      query: "某某测试有限公司官网",
      status: "complete",
      note: "已读取公开搜索结果页；未绕过登录或访问限制。",
      count: 1,
    },
    {
      kind: "recruiting",
      query: "某某测试有限公司招聘",
      status: "partial",
      note: "没有提取到可引用结果。",
      count: 0,
    },
    {
      kind: "news",
      query: "某某测试有限公司新闻",
      status: "complete",
      note: "已读取公开搜索结果页；未绕过登录或访问限制。",
      count: 0,
    },
  ],
  items: [
    {
      kind: "official_website",
      query: "某某测试有限公司官网",
      title: "某某测试有限公司官网",
      url: "https://example.test/company",
      snippet: "用于单元测试的公开摘要",
      sourceName: "测试站点",
      relevance: "exact_company",
      linkKind: "direct",
    },
  ],
};

describe("Ego Lite public report ingestion", () => {
  it("resolves the persisted company and stores a numbered evidence package for Agent analysis", async () => {
    searchCompanyPublicInformation.mockResolvedValue(egoResult);
    const persistWebEvidence = vi.fn().mockResolvedValue({
      source_record_id: "44444444-4444-4444-8444-444444444444",
      source_snapshot_id: "55555555-5555-4555-8555-555555555555",
      evidence_count: 1,
    });
    const ensureIngestionList = vi.fn();
    const store = {
      getSourceConnection: vi.fn().mockResolvedValue(connection),
      loadCompanyForEvidence: vi.fn().mockResolvedValue({
        id: 42,
        name: "某某测试有限公司",
        creditCode: "91110000123456789X",
      }),
      persistWebEvidence,
      markConnectionChecked: vi.fn().mockResolvedValue(undefined),
      ensureIngestionList,
    } as unknown as WorkbenchStore;

    const result = await processIngestionJob(
      webJob({
        companyId: "42",
        claimType: "public_report",
        reportMode: true,
        maxResults: 6,
      }),
      store,
    );

    expect(result).toEqual(
      expect.objectContaining({
        accepted_count: 1,
        company_id: 42,
        evidence_count: 1,
        force_partial: true,
        evidence_package_version: "2.0",
        report_stage: "awaiting_agent",
        report: expect.objectContaining({
          companyName: "某某测试有限公司",
          stage: "awaiting_agent",
          analysisMethod: "external_agent",
        }),
      }),
    );
    expect(store.loadCompanyForEvidence).toHaveBeenCalledWith(
      connection.workspace_id,
      42,
    );
    expect(searchCompanyPublicInformation).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: "某某测试有限公司",
        maxResults: 6,
      }),
    );
    expect(ensureIngestionList).not.toHaveBeenCalled();
    const persisted = persistWebEvidence.mock.calls[0]?.[0];
    expect(persisted.evidenceItems[0]).toEqual(
      expect.objectContaining({
        usageScope: "link_only",
        url: "https://example.test/company",
        claimType: "official_website",
        version: "ego-lite-agent-evidence-v2",
      }),
    );
    expect(persisted.normalizedPayload.evidence[0]).toEqual(
      expect.objectContaining({ id: "ev-001" }),
    );
  });

  it("rejects a client-supplied company name before loading a company or starting Ego", async () => {
    const loadCompanyForEvidence = vi.fn();
    const store = {
      getSourceConnection: vi.fn().mockResolvedValue(connection),
      loadCompanyForEvidence,
    } as unknown as WorkbenchStore;

    await expect(
      processIngestionJob(
        webJob({
          companyId: "42",
          companyName: "客户端伪造名称",
          claimType: "public_report",
          reportMode: true,
        }),
        store,
      ),
    ).rejects.toMatchObject({ code: "WEB_SEARCH_QUERY_INVALID" });
    expect(loadCompanyForEvidence).not.toHaveBeenCalled();
    expect(searchCompanyPublicInformation).not.toHaveBeenCalled();
  });
});

describe("QCC company-detail enrichment", () => {
  it("stores independent facts without creating a synthetic company list", async () => {
    qccQuery.mockResolvedValue({
      企业名称: "阿里巴巴(中国)网络技术有限公司",
      统一社会信用代码: "91330100716105852F",
      法定代表人: "蒋芳",
      登记状态: "存续",
      成立日期: "1999-09-09",
      注册资本: "1072526万美元",
      参保人数: "1200",
      所属地区: "浙江省杭州市滨江区",
      国标行业: "软件和信息技术服务业",
      注册地址: "浙江省杭州市滨江区网商路699号",
      经营范围: "计算机网络技术开发。",
    });
    const ensureIngestionList = vi.fn();
    const addCompanyListMember = vi.fn();
    const markConnectionChecked = vi.fn().mockResolvedValue(undefined);
    const store = {
      getSourceConnection: vi.fn().mockResolvedValue(qccConnection),
      ensureIngestionList,
      addCompanyListMember,
      persistIngestionRecord: vi.fn().mockResolvedValue({
        company_id: 18,
        source_record_id: "77777777-7777-4777-8777-777777777777",
        source_snapshot_id: "88888888-8888-4888-8888-888888888888",
      }),
      markConnectionChecked,
    } as unknown as WorkbenchStore;

    const result = await processIngestionJob(
      {
        job_type: "ingestion_job",
        job_id: "99999999-9999-4999-8999-999999999999",
        workspace_id: qccConnection.workspace_id,
        payload: {
          source_connection_id: qccConnection.id,
          job_kind: "query",
          input_params: {
            query_kind: "company_detail",
            criteria: {
              companyName: "阿里巴巴(中国)网络技术有限公司",
            },
          },
        },
      },
      store,
    );

    expect(qccQuery).toHaveBeenCalledWith(
      "company_registration",
      "阿里巴巴(中国)网络技术有限公司",
    );
    expect(result).toEqual(
      expect.objectContaining({
        accepted_count: 1,
        verified_company_ids: [18],
      }),
    );
    expect(result).not.toHaveProperty("company_list_id");
    expect(ensureIngestionList).not.toHaveBeenCalled();
    expect(addCompanyListMember).not.toHaveBeenCalled();
    expect(markConnectionChecked).toHaveBeenCalledWith(
      qccConnection,
      expect.objectContaining({ status: "ready" }),
    );
  });
});

describe("uploaded-file staging cleanup", () => {
  it("removes the private staging object after a successful import", async () => {
    const storagePath = `${fileConnection.workspace_id}/33333333-3333-4333-8333-333333333333/import.csv`;
    const deleteImport = vi.fn().mockResolvedValue(undefined);
    const store = {
      getSourceConnection: vi.fn().mockResolvedValue(fileConnection),
      downloadImport: vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode(
            "企业名称,统一社会信用代码\n阿里巴巴(中国)网络技术有限公司,91330100716105852F\n",
          ),
        ),
      deleteImport,
      loadMappingDefinition: vi.fn().mockResolvedValue(null),
      ensureIngestionList: vi
        .fn()
        .mockResolvedValue("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
      persistIngestionRecord: vi.fn().mockResolvedValue({
        company_id: 18,
        source_record_id: "77777777-7777-4777-8777-777777777777",
        source_snapshot_id: "88888888-8888-4888-8888-888888888888",
      }),
      addCompanyListMember: vi.fn().mockResolvedValue(undefined),
    } as unknown as WorkbenchStore;

    const result = await processIngestionJob(
      {
        job_type: "ingestion_job",
        job_id: "99999999-9999-4999-8999-999999999999",
        workspace_id: fileConnection.workspace_id,
        payload: {
          source_connection_id: fileConnection.id,
          job_kind: "import",
          input_object_path: storagePath,
          input_params: {
            file_name: "import.csv",
            media_type: "text/csv",
          },
          requested_by: "33333333-3333-4333-8333-333333333333",
        },
      },
      store,
    );

    expect(result).toEqual(
      expect.objectContaining({
        accepted_count: 1,
        staging_file_removed: true,
      }),
    );
    expect(deleteImport).toHaveBeenCalledWith(storagePath);
  });
});
