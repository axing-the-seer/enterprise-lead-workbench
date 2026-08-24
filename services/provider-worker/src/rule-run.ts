import { evaluateLead } from "../../../src/domain";
import { WorkerError } from "./errors";
import { sha256 } from "./stable-json";
import type {
  ClaimedWorkbenchJob,
  RuleResultWrite,
  WorkbenchStore,
} from "./types";

export async function processRuleRun(
  job: ClaimedWorkbenchJob,
  store: WorkbenchStore,
): Promise<Record<string, unknown>> {
  const engineVersion = String(job.payload.engine_version ?? "");
  if (engineVersion !== "lead-rules-v1") {
    throw new WorkerError(
      "RULE_ENGINE_VERSION_UNSUPPORTED",
      `规则版本要求 ${engineVersion || "未知"}，当前执行器仅支持 lead-rules-v1。`,
    );
  }
  const context = await store.loadRuleRunContext(job);
  const records =
    job.payload.run_mode === "sample"
      ? context.records.slice(0, 10)
      : context.records;
  if (records.length === 0) {
    throw new WorkerError(
      "RULE_INPUT_EMPTY",
      "企业名单没有可执行规则的规范化记录。",
    );
  }
  const fieldByRule = new Map(
    context.template.rules.map((rule) => [rule.id, rule.field]),
  );
  const rows: RuleResultWrite[] = records.map(({ companyId, lead }) => {
    const evaluation = evaluateLead(lead, context.template);
    const decision: RuleResultWrite["decision"] =
      evaluation.riskGate.status === "blocked" || evaluation.priority === "排除"
        ? "exclude"
        : evaluation.riskGate.status === "review" ||
            evaluation.priority === "待核验"
          ? "needs_review"
          : "include";
    const matched = evaluation.evaluatedRules.filter(
      (trace) => trace.state === "match",
    );
    const failed = evaluation.evaluatedRules.filter(
      (trace) => trace.state === "no_match",
    );
    const missingFields = [
      ...new Set([
        ...evaluation.unknownRules
          .map((trace) => fieldByRule.get(trace.ruleId))
          .filter((field): field is string => Boolean(field)),
        ...evaluation.eligibility.traces
          .filter((trace) => trace.state === "unknown")
          .map((trace) => {
            const conditionId = trace.conditionId;
            const findCondition = (
              group: NonNullable<typeof context.template.eligibility>["root"],
            ): string | null => {
              for (const node of group.rules) {
                if ("combinator" in node) {
                  const found = findCondition(node);
                  if (found) return found;
                } else if (node.id === conditionId) return node.field;
              }
              return null;
            };
            return context.template.eligibility
              ? findCondition(context.template.eligibility.root)
              : null;
          })
          .filter((field): field is string => Boolean(field)),
      ]),
    ];
    const evaluatedValues = {
      eligibility: evaluation.eligibility,
      priority: evaluation.priority,
      riskGate: evaluation.riskGate,
      evidenceCompleteness: evaluation.evidenceCompleteness,
      nextAction: evaluation.nextAction,
      sourceConflicts: lead.conflicts,
      evaluatedRules: evaluation.evaluatedRules,
    };
    return {
      workspace_id: job.workspace_id,
      rule_run_id: job.job_id,
      company_id: companyId,
      decision,
      score: evaluation.score,
      matched_rules: matched,
      failed_rules: failed,
      missing_fields: missingFields,
      evaluated_values: evaluatedValues,
      result_hash: sha256({
        companyId,
        decision,
        score: evaluation.score,
        evaluatedValues,
      }),
    };
  });
  await store.saveRuleResults(rows);
  const included = rows.filter((row) => row.decision === "include").length;
  const excluded = rows.filter((row) => row.decision === "exclude").length;
  const review = rows.filter((row) => row.decision === "needs_review").length;
  return {
    total_count: rows.length,
    included_count: included,
    excluded_count: excluded,
    review_count: review,
    run_mode: job.payload.run_mode === "sample" ? "sample" : "full",
    rule_version_id: String(job.payload.rule_version_id ?? ""),
    input_manifest_hash: String(job.payload.input_manifest_hash ?? ""),
  };
}
