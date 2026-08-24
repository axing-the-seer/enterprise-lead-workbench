import { describe, expect, it } from "vitest";
import { normalizeCsvDataset } from "../providers/csv/adapter";
import { normalizeKcRecord } from "../providers/kc/adapter";
import { mergeLeadDatasets, mergeLeadDatasetsWithOptions } from "./merge";
import { defaultRuleTemplate, evaluateLead, evaluateRuleState } from "./rules";
import {
  MAX_ELIGIBILITY_CONDITIONS,
  MAX_ELIGIBILITY_DEPTH,
  RuleTemplateSchema,
  type EligibilityGroup,
} from "./types";

const RETRIEVED_AT = "2026-08-20T09:00:00+08:00";

describe("信用代码优先去重与多源冲突", () => {
  it("同信用代码合并，选择值的同时保留所有血缘和冲突", () => {
    const kc = normalizeKcRecord(
      {
        companyName: "合并测试企业",
        taxId: "91310000TEST000004",
        legalPerson: "甲",
        capitalNum: 2000,
        tag: { blue: ["高新技术企业"], red: ["股权冻结"] },
      },
      { retrievedAt: RETRIEVED_AT },
    );
    const [csv] = normalizeCsvDataset(
      [
        {
          企业名称: "合并测试企业",
          统一社会信用代码: "91310000TEST000004",
          法定代表人: "乙",
          "注册资本（万元）": 100,
          企业资质: "专精特新中小企业",
        },
      ],
      { retrievedAt: "2026-08-20T10:00:00+08:00" },
    );
    const [merged] = mergeLeadDatasets([kc], [csv]);
    expect(merged.registeredCapital.valueWan).toBe(2000);
    expect(merged.legalPerson).toBe("甲");
    expect(merged.tags.qualifications).toEqual(
      expect.arrayContaining(["高新技术企业", "专精特新中小企业"]),
    );
    expect(merged.tags.risk).toContain("股权冻结");
    expect(merged.provenance.map((item) => item.providerId)).toEqual(
      expect.arrayContaining(["kingdee-credit-kc-assistant", "csv-upload"]),
    );
    expect(merged.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldPath: "registeredCapital",
          resolution: "provider_priority",
          chosenProviderId: "kingdee-credit-kc-assistant",
        }),
      ]),
    );
  });

  it("允许审批后显式调整供应商优先级，但不静默删除冲突", () => {
    const kc = normalizeKcRecord(
      {
        companyName: "主数据测试企业",
        taxId: "91310000TEST000005",
        capitalNum: 2000,
      },
      { retrievedAt: RETRIEVED_AT },
    );
    const [master] = normalizeCsvDataset(
      [
        {
          企业名称: "主数据测试企业",
          统一社会信用代码: "91310000TEST000005",
          "注册资本（万元）": 88,
        },
      ],
      { providerId: "approved-customer-master", channel: "customer_system" },
    );
    const [merged] = mergeLeadDatasetsWithOptions([[kc], [master]], {
      providerPriorities: { "approved-customer-master": 120 },
    });
    expect(merged.registeredCapital.valueWan).toBe(88);
    expect(
      merged.conflicts.find(
        (conflict) => conflict.fieldPath === "registeredCapital",
      ),
    ).toMatchObject({ chosenProviderId: "approved-customer-master" });
  });

  it("同名不同信用代码保持分离；无代码记录不猜归属", () => {
    const codedA = normalizeCsvDataset([
      { 企业名称: "同名企业", 统一社会信用代码: "91310000TEST000006" },
    ]);
    const codedB = normalizeCsvDataset([
      { 企业名称: "同名企业", 统一社会信用代码: "91310000TEST000007" },
    ]);
    const nameOnly = normalizeCsvDataset([{ 企业名称: "同名企业" }]);
    expect(mergeLeadDatasets(codedA, codedB, nameOnly)).toHaveLength(3);
    expect(mergeLeadDatasets(codedA, nameOnly)).toHaveLength(1);
  });
});

describe("三值规则与独立风险门禁", () => {
  it("字段缺失是 unknown，不伪造不匹配或零值", () => {
    const lead = normalizeKcRecord(
      { companyName: "规则缺失测试企业", status: "正常" },
      { retrievedAt: RETRIEVED_AT },
    );
    const capitalRule = defaultRuleTemplate.rules.find(
      (rule) => rule.id === "capital-scale",
    )!;
    expect(evaluateRuleState(lead, capitalRule)).toBe("unknown");
    const evaluation = evaluateLead(lead);
    expect(evaluation.priority).toBe("待核验");
    expect(evaluation.unknownRules.map((rule) => rule.ruleId)).toEqual(
      expect.arrayContaining(["capital-scale", "insured-scale"]),
    );
  });

  it("业务优先级与风险门禁分开计算", () => {
    const lead = normalizeKcRecord(
      {
        companyName: "高匹配风险测试企业",
        capitalNum: 5000,
        insuredNum: 500,
        status: "正常",
        tag: { blue: ["高新技术企业"], red: ["严重违法"] },
      },
      { retrievedAt: RETRIEVED_AT },
    );
    const evaluation = evaluateLead(lead);
    expect(evaluation.priority).toBe("P1");
    expect(evaluation.score).toBe(100);
    expect(evaluation.riskGate.status).toBe("blocked");
  });
});

describe("RuleTemplate v1 硬性准入条件树", () => {
  const completeLead = () =>
    normalizeKcRecord(
      {
        companyName: "准入规则测试企业",
        capitalNum: 5000,
        insuredNum: 500,
        status: "正常",
        tag: { blue: ["高新技术企业"], red: ["严重违法"] },
      },
      { retrievedAt: RETRIEVED_AT },
    );

  const condition = (
    overrides: Partial<{
      id: string;
      label: string;
      field: string;
      operator: "eq" | "gte";
      value: unknown;
      missingPolicy: "review" | "pass" | "fail";
      enabled: boolean;
    }> = {},
  ) => ({
    id: "active",
    label: "正常经营",
    field: "status.normalized",
    operator: "eq" as const,
    value: "active",
    missingPolicy: "review" as const,
    enabled: true,
    ...overrides,
  });

  const templateWithEligibility = (
    root: EligibilityGroup,
    onUnknown = "review",
  ) =>
    RuleTemplateSchema.parse({
      ...defaultRuleTemplate,
      id: `eligibility-${root.id}-${onUnknown}`,
      eligibility: {
        root,
        onNoMatch: "exclude",
        onUnknown,
      },
    });

  it("AND 任一条件不满足时强制排除，风险门禁仍独立计算", () => {
    const template = templateWithEligibility({
      id: "and-root",
      combinator: "and",
      rules: [
        condition(),
        condition({
          id: "capital",
          label: "注册资本达标",
          field: "registeredCapital.valueWan",
          operator: "gte",
          value: 6000,
        }),
      ],
    });
    const evaluation = evaluateLead(completeLead(), template);
    expect(evaluation.eligibility.state).toBe("no_match");
    expect(evaluation.priority).toBe("排除");
    expect(evaluation.riskGate.status).toBe("blocked");
    expect(evaluation.eligibility.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining("注册资本达标")]),
    );
  });

  it("OR 在无匹配但有未知条件时为 unknown，根策略决定待核验、排除或放行", () => {
    const root: EligibilityGroup = {
      id: "or-root",
      combinator: "or",
      rules: [
        condition({ value: "cancelled" }),
        condition({
          id: "company-type",
          label: "指定企业类型",
          field: "companyType",
          value: "有限责任公司",
        }),
      ],
    };
    const lead = completeLead();
    expect(
      evaluateLead(lead, templateWithEligibility(root, "review")).priority,
    ).toBe("待核验");
    expect(
      evaluateLead(lead, templateWithEligibility(root, "exclude")).priority,
    ).toBe("排除");
    const passed = evaluateLead(lead, templateWithEligibility(root, "pass"));
    expect(passed.eligibility.state).toBe("unknown");
    expect(passed.priority).toBe("P1");
  });

  it("条件级 missingPolicy 在组合前把未知值转为放行或不满足", () => {
    const rootFor = (missingPolicy: "pass" | "fail"): EligibilityGroup => ({
      id: `missing-${missingPolicy}`,
      combinator: "and",
      rules: [
        condition({
          id: `company-type-${missingPolicy}`,
          label: "指定企业类型",
          field: "companyType",
          value: "有限责任公司",
          missingPolicy,
        }),
      ],
    });
    const passed = evaluateLead(
      completeLead(),
      templateWithEligibility(rootFor("pass")),
    );
    expect(passed.eligibility).toMatchObject({ state: "match" });
    expect(passed.eligibility.traces[0]).toMatchObject({
      state: "unknown",
      effectiveState: "match",
    });

    const failed = evaluateLead(
      completeLead(),
      templateWithEligibility(rootFor("fail")),
    );
    expect(failed.eligibility).toMatchObject({ state: "no_match" });
    expect(failed.priority).toBe("排除");
  });

  it("递归组合嵌套 AND/OR，并在 trace 中保留完整路径", () => {
    const template = templateWithEligibility({
      id: "nested-root",
      combinator: "and",
      rules: [
        condition(),
        {
          id: "scale-any",
          combinator: "or",
          rules: [
            condition({
              id: "large-capital",
              label: "大额注册资本",
              field: "registeredCapital.valueWan",
              operator: "gte",
              value: 10000,
            }),
            condition({
              id: "insured-scale",
              label: "参保规模",
              field: "insuredCount",
              operator: "gte",
              value: 100,
            }),
          ],
        },
      ],
    });
    const evaluation = evaluateLead(completeLead(), template);
    expect(evaluation.eligibility.state).toBe("match");
    expect(
      evaluation.eligibility.traces.find(
        (trace) => trace.conditionId === "insured-scale",
      )?.path,
    ).toEqual(["nested-root", "scale-any", "insured-scale"]);
  });

  it("不含 eligibility 的旧模板可继续解析和执行", () => {
    const legacy = RuleTemplateSchema.parse({
      id: "legacy-v1",
      name: "旧模板",
      rules: defaultRuleTemplate.rules,
      thresholds: defaultRuleTemplate.thresholds,
    });
    const evaluation = evaluateLead(completeLead(), legacy);
    expect(legacy.eligibility).toBeUndefined();
    expect(evaluation.eligibility).toEqual({
      state: "match",
      reasons: ["未配置硬性准入条件"],
      traces: [],
    });
    expect(evaluation.priority).toBe("P1");
  });

  it("解析时限制最多 5 层和 200 个条件", () => {
    let tooDeep: EligibilityGroup = {
      id: `depth-${MAX_ELIGIBILITY_DEPTH + 1}`,
      combinator: "and",
      rules: [condition({ id: "deep-leaf" })],
    };
    for (let depth = MAX_ELIGIBILITY_DEPTH; depth >= 1; depth -= 1) {
      tooDeep = {
        id: `depth-${depth}`,
        combinator: "and",
        rules: [tooDeep],
      };
    }
    expect(() => templateWithEligibility(tooDeep)).toThrow(/最多允许 5 层/);

    const tooMany: EligibilityGroup = {
      id: "too-many-root",
      combinator: "and",
      rules: Array.from(
        { length: MAX_ELIGIBILITY_CONDITIONS + 1 },
        (_, index) => condition({ id: `condition-${index}` }),
      ),
    };
    expect(() => templateWithEligibility(tooMany)).toThrow(
      /最多允许 200 个条件/,
    );
  });
});
