import { describe, expect, it } from "vitest";
import { normalizeCsvDataset } from "../../../src/providers/csv/adapter";
import { normalizeKcRecord } from "../../../src/providers/kc/adapter";
import { mergeLatestLeadSnapshots } from "./lead-merge";

describe("production snapshot merge", () => {
  it("keeps the latest snapshot per provider and merges different providers", () => {
    const oldKc = normalizeKcRecord(
      {
        companyName: "合并契约测试企业",
        taxId: "91310000TESTMERGE01",
        capitalNum: 100,
        tag: { blue: ["高新技术企业"] },
      },
      { retrievedAt: "2026-08-19T08:00:00+08:00" },
    );
    const latestKc = normalizeKcRecord(
      {
        companyName: "合并契约测试企业",
        taxId: "91310000TESTMERGE01",
        capitalNum: 200,
        tag: { blue: ["高新技术企业"], red: ["股权冻结"] },
      },
      { retrievedAt: "2026-08-20T08:00:00+08:00" },
    );
    const [uploaded] = normalizeCsvDataset(
      [
        {
          企业名称: "合并契约测试企业",
          统一社会信用代码: "91310000TESTMERGE01",
          "注册资本（万元）": 88,
        },
      ],
      { retrievedAt: "2026-08-20T09:00:00+08:00" },
    );

    const records = mergeLatestLeadSnapshots(
      [
        {
          company_id: 7,
          captured_at: "2026-08-19T00:00:00Z",
          normalized_payload: oldKc,
        },
        {
          company_id: 7,
          captured_at: "2026-08-20T00:00:00Z",
          normalized_payload: latestKc,
        },
        {
          company_id: 7,
          captured_at: "2026-08-20T01:00:00Z",
          normalized_payload: uploaded,
        },
      ],
      new Map([[7, "source-record-7"]]),
    );

    expect(records).toHaveLength(1);
    expect(records[0].lead.registeredCapital.valueWan).toBe(200);
    expect(records[0].lead.tags.risk).toContain("股权冻结");
    expect(records[0].lead.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldPath: "registeredCapital" }),
      ]),
    );
  });

  it("ignores a newer Web-only snapshot instead of breaking rule input", () => {
    const canonical = normalizeKcRecord(
      {
        companyName: "Web 证据边界测试企业",
        taxId: "91310000TESTMERGE02",
      },
      { retrievedAt: "2026-08-20T08:00:00+08:00" },
    );
    const [record] = mergeLatestLeadSnapshots(
      [
        {
          company_id: 8,
          captured_at: "2026-08-20T01:00:00Z",
          normalized_payload: canonical,
        },
        {
          company_id: 8,
          captured_at: "2026-08-20T02:00:00Z",
          normalized_payload: {
            schemaVersion: "1.0",
            provider: "tencent_wsa",
            companyId: 8,
            webEvidence: [{ url: "https://example.test/evidence" }],
          },
        },
      ],
      new Map([[8, null]]),
    );

    expect(record.lead.companyName).toBe("Web 证据边界测试企业");
  });

  it("uses an explicit provider priority without deleting conflict evidence", () => {
    const kc = normalizeKcRecord(
      {
        companyName: "优先级契约测试企业",
        taxId: "91310000TESTMERGE03",
        capitalNum: 500,
      },
      { retrievedAt: "2026-08-20T08:00:00+08:00" },
    );
    const [uploaded] = normalizeCsvDataset(
      [
        {
          企业名称: "优先级契约测试企业",
          统一社会信用代码: "91310000TESTMERGE03",
          "注册资本（万元）": 66,
        },
      ],
      {
        providerId: "approved-customer-master",
        channel: "customer_system",
        retrievedAt: "2026-08-20T09:00:00+08:00",
      },
    );
    const [record] = mergeLatestLeadSnapshots(
      [
        {
          company_id: 9,
          captured_at: "2026-08-20T00:00:00Z",
          normalized_payload: kc,
        },
        {
          company_id: 9,
          captured_at: "2026-08-20T01:00:00Z",
          normalized_payload: uploaded,
        },
      ],
      new Map([[9, null]]),
      { "approved-customer-master": 120 },
    );

    expect(record.lead.registeredCapital.valueWan).toBe(66);
    expect(record.lead.conflicts.length).toBeGreaterThan(0);
  });
});
