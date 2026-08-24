import { describe, expect, it } from "vitest";
import type { RuleResult } from "./types";
import { latestCompanySourceConflicts } from "./sourceConflicts";

function result(
  id: string,
  companyId: number,
  sourceConflicts: unknown,
): RuleResult {
  return {
    id,
    company_id: companyId,
    rule_run_id: "11111111-1111-4111-8111-111111111111",
    evaluated_values: { sourceConflicts },
  };
}

describe("跨数据源字段差异", () => {
  it("每家企业只采用列表中最新一次规则运行", () => {
    const conflicts = latestCompanySourceConflicts([
      result("latest", 7, [
        {
          fieldPath: "insuredCount",
          resolution: "provider_priority",
          chosenProviderId: "qcc",
          candidates: [
            { providerId: "qcc", displayValue: "35" },
            { providerId: "huoke_assistant", displayValue: "31" },
          ],
        },
      ]),
      result("older", 7, [
        {
          fieldPath: "insuredCount",
          resolution: "newer_retrieval",
          chosenProviderId: "huoke_assistant",
          candidates: [
            { providerId: "huoke_assistant", displayValue: "30" },
            { providerId: "qcc", displayValue: "29" },
          ],
        },
      ]),
    ]);

    expect(conflicts).toEqual([
      {
        companyId: "7",
        ruleResultId: "latest",
        fieldPath: "insuredCount",
        resolution: "provider_priority",
        chosenProviderId: "qcc",
        candidates: [
          { providerId: "qcc", displayValue: "35" },
          { providerId: "huoke_assistant", displayValue: "31" },
        ],
      },
    ]);
  });

  it("忽略结构不完整或候选值不足的数据", () => {
    const conflicts = latestCompanySourceConflicts([
      result("invalid", 8, [
        null,
        { fieldPath: "companyName" },
        {
          fieldPath: "companyName",
          resolution: "provider_priority",
          chosenProviderId: "qcc",
          candidates: [{ providerId: "qcc", displayValue: "虚构企业" }],
        },
      ]),
    ]);

    expect(conflicts).toEqual([]);
  });
});
