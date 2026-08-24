import {
  EligibilitySchema,
  LeadEvaluationSchema,
  LeadRuleSchema,
  RuleTemplateSchema,
  type EligibilityCondition,
  type EligibilityConfig,
  type EligibilityEvaluation,
  type EligibilityGroup,
  type EligibilityTrace,
  type Lead,
  type LeadEvaluation,
  type LeadRule,
  type RuleTemplate,
  type TriState,
} from "./types";
import { getPath } from "./normalize";

export const defaultRuleTemplate: RuleTemplate = RuleTemplateSchema.parse({
  id: "default-b2b-lead-v1",
  name: "通用企业名单优先级（可配置）",
  thresholds: { p1: 75, p2: 50, minimumCompleteness: 70 },
  rules: [
    {
      id: "business-active",
      label: "企业处于正常经营状态",
      kind: "priority",
      field: "status.normalized",
      operator: "eq",
      value: "active",
      weight: 25,
      missingPolicy: "review",
    },
    {
      id: "capital-scale",
      label: "注册资本不少于 1000 万元",
      kind: "priority",
      field: "registeredCapital.valueWan",
      operator: "gte",
      value: 1000,
      weight: 25,
      missingPolicy: "review",
    },
    {
      id: "insured-scale",
      label: "参保人数不少于 50 人",
      kind: "priority",
      field: "insuredCount",
      operator: "gte",
      value: 50,
      weight: 25,
      missingPolicy: "review",
    },
    {
      id: "qualification-signal",
      label: "具备重点资质或成长标签",
      kind: "priority",
      field: "tags.qualifications",
      operator: "intersects",
      value: ["高新技术企业", "专精特新", "创新型中小企业", "科技型中小企业"],
      weight: 25,
      missingPolicy: "review",
    },
    {
      id: "inactive-gate",
      label: "注销、吊销或停业门禁",
      kind: "risk_gate",
      field: "status.normalized",
      operator: "in",
      value: ["cancelled", "revoked", "suspended", "liquidating", "inactive"],
      onMatch: "block",
      missingPolicy: "review",
    },
    {
      id: "severe-risk-gate",
      label: "重大司法或信用风险门禁",
      kind: "risk_gate",
      field: "tags.risk",
      operator: "intersects",
      value: ["严重违法", "失信被执行人", "股权冻结", "限制高消费"],
      onMatch: "block",
      missingPolicy: "pass",
    },
    {
      id: "risk-verification-missing",
      label: "尚未完成单企风险核验",
      kind: "risk_gate",
      field: "riskSnapshot.severity",
      operator: "eq",
      value: "unknown",
      onMatch: "review",
      missingPolicy: "review",
    },
  ],
});

function findProvenance(lead: Lead, field: string) {
  return (
    lead.provenance.find((item) => item.fieldPath === field) ??
    lead.provenance.find((item) => field.startsWith(item.fieldPath)) ??
    null
  );
}

function isUnknownValue(lead: Lead, field: string, value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (
    value === "unknown" &&
    (field === "status.normalized" || field === "riskSnapshot.severity")
  ) {
    return true;
  }
  if (Array.isArray(value) && value.length === 0) {
    return findProvenance(lead, field)?.nullMeaning !== "provided";
  }
  return false;
}

function comparable(value: unknown): unknown {
  return typeof value === "string" ? value.normalize("NFKC").trim() : value;
}

function equals(left: unknown, right: unknown): boolean {
  return comparable(left) === comparable(right);
}

function includesValue(collection: unknown, expected: unknown): boolean {
  if (Array.isArray(collection)) {
    return collection.some((item) =>
      typeof item === "string" && typeof expected === "string"
        ? item.includes(expected) || expected.includes(item)
        : equals(item, expected),
    );
  }
  return typeof collection === "string" && typeof expected === "string"
    ? collection.includes(expected)
    : false;
}

export function evaluateRuleState(lead: Lead, inputRule: LeadRule): TriState {
  const rule = LeadRuleSchema.parse(inputRule);
  const actual = getPath(lead, rule.field);
  if (rule.operator === "present")
    return isUnknownValue(lead, rule.field, actual) ? "no_match" : "match";
  if (rule.operator === "absent")
    return isUnknownValue(lead, rule.field, actual) ? "match" : "no_match";
  if (isUnknownValue(lead, rule.field, actual)) return "unknown";

  const expected = rule.value;
  switch (rule.operator) {
    case "eq":
      return equals(actual, expected) ? "match" : "no_match";
    case "not_eq":
      return equals(actual, expected) ? "no_match" : "match";
    case "gte": {
      const left = Number(actual);
      const right = Number(expected);
      return Number.isFinite(left) && Number.isFinite(right)
        ? left >= right
          ? "match"
          : "no_match"
        : "unknown";
    }
    case "lte": {
      const left = Number(actual);
      const right = Number(expected);
      return Number.isFinite(left) && Number.isFinite(right)
        ? left <= right
          ? "match"
          : "no_match"
        : "unknown";
    }
    case "contains":
      return includesValue(actual, expected) ? "match" : "no_match";
    case "not_contains":
      return includesValue(actual, expected) ? "no_match" : "match";
    case "in":
      return Array.isArray(expected) &&
        expected.some((item) => equals(actual, item))
        ? "match"
        : "no_match";
    case "not_in":
      return Array.isArray(expected) &&
        expected.some((item) => equals(actual, item))
        ? "no_match"
        : "match";
    case "intersects":
      return Array.isArray(expected) &&
        expected.some((item) => includesValue(actual, item))
        ? "match"
        : "no_match";
    default:
      return "unknown";
  }
}

type EligibilityNodeEvaluation = {
  active: boolean;
  state: TriState;
  traces: EligibilityTrace[];
};

function effectiveMissingState(
  state: TriState,
  missingPolicy: EligibilityCondition["missingPolicy"],
): TriState {
  if (state !== "unknown") return state;
  if (missingPolicy === "pass") return "match";
  if (missingPolicy === "fail") return "no_match";
  return "unknown";
}

function eligibilityTraceReason(
  state: TriState,
  effectiveState: TriState,
): string {
  if (state === "match") return "字段值满足准入条件";
  if (state === "no_match") return "字段值不满足准入条件";
  if (effectiveState === "match") return "字段缺失或语义未知；按条件配置放行";
  if (effectiveState === "no_match")
    return "字段缺失或语义未知；按条件配置视为不满足";
  return "字段缺失或语义未知；保持待核验";
}

function evaluateEligibilityCondition(
  lead: Lead,
  condition: EligibilityCondition,
  path: readonly string[],
): EligibilityNodeEvaluation {
  if (!condition.enabled) return { active: false, state: "match", traces: [] };
  const state = evaluateRuleState(lead, {
    id: condition.id,
    label: condition.label,
    kind: "priority",
    field: condition.field,
    operator: condition.operator,
    value: condition.value,
    weight: 0,
    onMatch: "score",
    missingPolicy: condition.missingPolicy,
    enabled: true,
  });
  const effectiveState = effectiveMissingState(state, condition.missingPolicy);
  return {
    active: true,
    state: effectiveState,
    traces: [
      {
        conditionId: condition.id,
        label: condition.label,
        path: [...path, condition.id],
        state,
        effectiveState,
        actual: getPath(lead, condition.field) ?? null,
        expected: condition.value ?? null,
        missingPolicy: condition.missingPolicy,
        reason: eligibilityTraceReason(state, effectiveState),
      },
    ],
  };
}

function evaluateEligibilityGroup(
  lead: Lead,
  group: EligibilityGroup,
  path: readonly string[],
): EligibilityNodeEvaluation {
  const groupPath = [...path, group.id];
  const children = group.rules.map((node) =>
    "combinator" in node
      ? evaluateEligibilityGroup(lead, node, groupPath)
      : evaluateEligibilityCondition(lead, node, groupPath),
  );
  const active = children.filter((child) => child.active);
  if (active.length === 0) return { active: false, state: "match", traces: [] };

  let state: TriState;
  if (group.combinator === "and") {
    state = active.some((child) => child.state === "no_match")
      ? "no_match"
      : active.some((child) => child.state === "unknown")
        ? "unknown"
        : "match";
  } else {
    state = active.some((child) => child.state === "match")
      ? "match"
      : active.some((child) => child.state === "unknown")
        ? "unknown"
        : "no_match";
  }
  return {
    active: true,
    state,
    traces: children.flatMap((child) => child.traces),
  };
}

export function evaluateEligibility(
  lead: Lead,
  eligibility?: EligibilityConfig,
): EligibilityEvaluation {
  if (!eligibility) {
    return {
      state: "match",
      reasons: ["未配置硬性准入条件"],
      traces: [],
    };
  }
  const parsedEligibility = EligibilitySchema.parse(eligibility);
  const result = evaluateEligibilityGroup(lead, parsedEligibility.root, []);
  if (!result.active) {
    return {
      state: "match",
      reasons: ["准入条件树没有启用的条件，按不限制处理"],
      traces: [],
    };
  }

  const relevantTraces =
    result.state === "no_match"
      ? result.traces.filter((trace) => trace.effectiveState === "no_match")
      : result.state === "unknown"
        ? result.traces.filter((trace) => trace.effectiveState === "unknown")
        : result.traces.filter(
            (trace) =>
              trace.state === "unknown" && trace.effectiveState === "match",
          );
  const fallbackReason =
    result.state === "match"
      ? "已满足硬性准入条件"
      : result.state === "no_match"
        ? "未满足硬性准入条件"
        : "硬性准入条件存在待核验字段";
  return {
    state: result.state,
    reasons: relevantTraces.length
      ? relevantTraces.map((trace) => `${trace.label}：${trace.reason}`)
      : [fallbackReason],
    traces: result.traces,
  };
}

function traceReason(rule: LeadRule, state: TriState): string {
  if (state === "match") return "字段值满足规则";
  if (state === "no_match") return "字段值不满足规则";
  if (rule.missingPolicy === "pass") return "字段缺失；按配置放行但不计分";
  if (rule.missingPolicy === "fail") return "字段缺失；按配置视为门禁失败";
  return "字段缺失或语义未知；需要补充证据";
}

export function evaluateLead(
  lead: Lead,
  inputTemplate: RuleTemplate = defaultRuleTemplate,
): LeadEvaluation {
  const template = RuleTemplateSchema.parse(inputTemplate);
  const eligibility = evaluateEligibility(lead, template.eligibility);
  const rules = template.rules.filter((rule) => rule.enabled);
  const evaluatedRules = rules.map((rule) => {
    const state = evaluateRuleState(lead, rule);
    return {
      ruleId: rule.id,
      label: rule.label,
      state,
      actual: getPath(lead, rule.field) ?? null,
      expected: rule.value ?? null,
      contribution:
        rule.kind === "priority" && state === "match"
          ? Math.max(0, rule.weight)
          : 0,
      reason: traceReason(rule, state),
    };
  });

  const priorityRules = rules.filter((rule) => rule.kind === "priority");
  const totalWeight = priorityRules.reduce(
    (sum, rule) => sum + Math.max(0, rule.weight),
    0,
  );
  const earnedWeight = evaluatedRules.reduce(
    (sum, trace) => sum + trace.contribution,
    0,
  );
  const score =
    totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
  const evidenceCompleteness = rules.length
    ? Math.round(
        (evaluatedRules.filter((trace) => trace.state !== "unknown").length /
          rules.length) *
          100,
      )
    : 100;
  const priorityTraces = evaluatedRules.filter((trace) =>
    priorityRules.some((rule) => rule.id === trace.ruleId),
  );
  const priorityCompleteness = priorityTraces.length
    ? Math.round(
        (priorityTraces.filter((trace) => trace.state !== "unknown").length /
          priorityTraces.length) *
          100,
      )
    : 100;
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
  const blockedReasons: string[] = [];
  const reviewReasons: string[] = [];
  for (const trace of evaluatedRules) {
    const rule = ruleById.get(trace.ruleId)!;
    if (rule.kind !== "risk_gate") continue;
    if (trace.state === "match" && rule.onMatch === "block")
      blockedReasons.push(rule.label);
    if (trace.state === "match" && rule.onMatch === "review")
      reviewReasons.push(rule.label);
    if (trace.state === "unknown" && rule.missingPolicy === "fail") {
      blockedReasons.push(`${rule.label}（缺失按失败处理）`);
    }
    if (trace.state === "unknown" && rule.missingPolicy === "review") {
      reviewReasons.push(`${rule.label}（证据缺失）`);
    }
  }
  const priorityUnknownReview = evaluatedRules.some((trace) => {
    const rule = ruleById.get(trace.ruleId)!;
    return (
      rule.kind === "priority" &&
      trace.state === "unknown" &&
      rule.missingPolicy === "review"
    );
  });
  const riskGate = blockedReasons.length
    ? { status: "blocked" as const, reasons: blockedReasons }
    : reviewReasons.length
      ? { status: "review" as const, reasons: reviewReasons }
      : { status: "pass" as const, reasons: [] };

  let scoredPriority: LeadEvaluation["priority"];
  if (
    priorityUnknownReview ||
    priorityCompleteness < template.thresholds.minimumCompleteness
  ) {
    scoredPriority = "待核验";
  } else if (score >= template.thresholds.p1) scoredPriority = "P1";
  else if (score >= template.thresholds.p2) scoredPriority = "P2";
  else scoredPriority = "排除";

  let priority = scoredPriority;
  if (eligibility.state === "no_match") priority = "排除";
  if (eligibility.state === "unknown") {
    if (template.eligibility?.onUnknown === "exclude") priority = "排除";
    if (template.eligibility?.onUnknown === "review") priority = "待核验";
  }

  const nextAction =
    eligibility.state === "no_match"
      ? "未通过硬性准入条件，已排除；风险门禁结果仍独立保留。"
      : eligibility.state === "unknown" &&
          template.eligibility?.onUnknown === "exclude"
        ? "准入证据未知，按当前模板配置排除；风险门禁结果仍独立保留。"
        : eligibility.state === "unknown" &&
            template.eligibility?.onUnknown === "review"
          ? "先补齐硬性准入证据再决定是否跟进；风险门禁结果仍独立保留。"
          : riskGate.status === "blocked"
            ? `业务匹配度为 ${priority}，但风险门禁已阻断；暂停跟进并先核验风险证据。`
            : riskGate.status === "review"
              ? `业务匹配度为 ${priority}，风险证据仍需单企核验后再决定是否跟进。`
              : priority === "待核验"
                ? "补齐业务优先级所需的未知字段后重新评分。"
                : priority === "P1"
                  ? "进入优先跟进名单，并确认联系人与业务适配性。"
                  : priority === "P2"
                    ? "进入第二梯队，结合行业场景继续筛选。"
                    : "保留在归档名单；仅在规则或证据更新后重新评估。";

  return LeadEvaluationSchema.parse({
    leadId: lead.leadId,
    eligibility,
    priority,
    score,
    riskGate,
    matchedRules: evaluatedRules.filter((trace) => trace.state === "match"),
    unknownRules: evaluatedRules.filter((trace) => trace.state === "unknown"),
    evaluatedRules,
    evidenceCompleteness,
    nextAction,
  });
}

export function evaluateDataset(
  leads: readonly Lead[],
  template: RuleTemplate = defaultRuleTemplate,
): LeadEvaluation[] {
  return leads.map((lead) => evaluateLead(lead, template));
}
