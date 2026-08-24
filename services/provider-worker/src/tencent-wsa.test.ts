import { afterEach, describe, expect, it } from "vitest";
import {
  buildTencentWsaQuery,
  TencentWsaClient,
  TENCENT_WSA_ENDPOINT,
  validateTencentWsaCriteria,
} from "./tencent-wsa";

const previousKey = process.env.TENCENTCLOUD_WSA_APIKEY;

afterEach(() => {
  if (previousKey === undefined) {
    delete process.env.TENCENTCLOUD_WSA_APIKEY;
  } else {
    process.env.TENCENTCLOUD_WSA_APIKEY = previousKey;
  }
});

describe("Tencent WSA client", () => {
  it("uses the fixed HTTPS endpoint and keeps the key in the header", async () => {
    process.env.TENCENTCLOUD_WSA_APIKEY = "test-only-service-key-123456";
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const client = new TencentWsaClient({
      endpoint: TENCENT_WSA_ENDPOINT,
      secretReference: "env://TENCENTCLOUD_WSA_APIKEY",
      fetchImpl: (async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return new Response(JSON.stringify({ Pages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch,
    });

    await client.search({ query: '"某某测试有限公司" 新闻' });
    expect(capturedUrl).toBe(TENCENT_WSA_ENDPOINT);
    expect(capturedInit?.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer test-only-service-key-123456",
      }),
    );
    expect(String(capturedInit?.body)).not.toContain(
      "test-only-service-key-123456",
    );
  });

  it("rejects arbitrary endpoints and secret references", () => {
    process.env.TENCENTCLOUD_WSA_APIKEY = "test-only-service-key-123456";
    expect(
      () =>
        new TencentWsaClient({
          endpoint: "https://attacker.example.test/search",
          secretReference: "env://TENCENTCLOUD_WSA_APIKEY",
        }),
    ).toThrow(/WSA/);
    expect(
      () =>
        new TencentWsaClient({
          secretReference: "env://OTHER_KEY",
        }),
    ).toThrow(/TENCENTCLOUD_WSA_APIKEY/);
  });

  it("validates a company-bound criteria and builds a bounded query", () => {
    const criteria = validateTencentWsaCriteria({
      companyId: "42",
      claimType: "tender",
      extraKeywords: ["信创", "信创"],
      site: "example.test",
      maxResults: 5,
    });
    expect(criteria.maxResults).toBe(5);
    expect(
      buildTencentWsaQuery({
        companyName: "某某测试有限公司",
        creditCode: "91110000123456789X",
        claimType: criteria.claimType,
        extraKeywords: criteria.extraKeywords,
      }),
    ).toBe('"某某测试有限公司" 91110000123456789X 招标 中标 信创');
  });
});
