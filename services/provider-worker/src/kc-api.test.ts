import { afterEach, describe, expect, it, vi } from "vitest";
import { KcApiClient } from "./kc-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("KcApiClient", () => {
  it("translates the canonical search form into the reviewed provider contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 200, data: { records: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new KcApiClient({ secretReference: null });
    await client.searchCompanies({
      keyword: "示例企业",
      enterpriseTypes: ["company"],
      contactRequirements: ["phone", "email"],
      registeredCapitalWan: [{ min: 1000 }],
      actualOperatingOnly: true,
    });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body).toMatchObject({ page: 1, limit: 10 });
    expect(body.filter).toMatchObject({
      keyword: "示例企业",
      enpType: [3],
      contact: [1, 2],
      capitalNum: [{ min: 1000 }],
      isActualOperate: 1,
    });
    expect(
      (request.headers as Record<string, string>).cloudToken,
    ).toBeUndefined();
  });

  it("rejects unreviewed raw provider fields", async () => {
    const client = new KcApiClient({ secretReference: null });
    await expect(
      client.searchCompanies({ providerFilter: { arbitrary: true } }),
    ).rejects.toThrow("获客助手查询条件无效");
  });

  it("replaces incomplete agent catalog tokens with the reviewed city selection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 200, data: { records: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new KcApiClient({ secretReference: null });
    await client.searchCompanies({
      regions: [
        {
          label: "杭州市",
          providerValues: ["浙江省#ZJ", "杭州市$C"],
        },
      ],
      industries: [
        {
          label: "软件和信息技术服务业",
          providerValues: ["I#65"],
        },
      ],
    });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.filter.region).toEqual(
      expect.arrayContaining([
        "浙江省#ZJ",
        "杭州市$C",
        "上城区$A",
        "西湖区$A",
        "滨江区$A",
      ]),
    );
    expect(body.filter.region).not.toContain("市辖区$A");
    expect(body.filter.industry).toEqual(["I#65"]);
  });

  it("rejects a credential-bearing or unapproved origin", () => {
    expect(
      () =>
        new KcApiClient({
          baseUrl: "https://example.com",
          secretReference: null,
        }),
    ).toThrow("不在部署白名单");
  });
});
