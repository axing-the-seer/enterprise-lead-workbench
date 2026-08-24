import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  FlaskConical,
  Loader2,
  PlayCircle,
  Plus,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useGetList, useNotify } from "ra-core";
import {
  QueryBuilder,
  type Field,
  type RuleGroupType,
  type RuleType,
} from "react-querybuilder";
import { Link, useSearchParams } from "react-router";
import "react-querybuilder/dist/query-builder.css";
import "./query-builder.css";
import { RuleTemplateSchema } from "@/domain/types";
import type {
  EligibilityCondition,
  EligibilityGroup,
  LeadRule,
  RuleTemplate,
} from "@/domain/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DataBoundary, PageHeader, StatusBadge } from "./components";
import type {
  CompanyList,
  RuleRun,
  RuleSet,
  RuleSetVersion,
  WorkbenchJobResponse,
} from "./types";
import { formatDateTime, getErrorMessage } from "./utils";
import { useWorkspace } from "./workspace";
import {
  createIdempotencyKey,
  runWorkbenchAction,
  saveRuleTemplate,
} from "./workbenchActions";

const emptyQuery: RuleGroupType = {
  id: "eligibility-root",
  combinator: "and",
  rules: [],
};

const fields: Field[] = [
  { name: "companyName", label: "企业名称" },
  { name: "creditCode", label: "统一社会信用代码" },
  { name: "legalPerson", label: "法定代表人" },
  { name: "legalChangeDate", label: "法人变更日期", inputType: "date" },
  {
    name: "legalPersonSharePercent",
    label: "法人持股比例（%）",
    inputType: "number",
  },
  { name: "companyType", label: "企业类型" },
  {
    name: "registeredCapital.valueWan",
    label: "注册资本（万元）",
    inputType: "number",
  },
  {
    name: "paidInCapital.valueWan",
    label: "实缴资本（万元）",
    inputType: "number",
  },
  { name: "establishedDate", label: "成立日期", inputType: "date" },
  { name: "approvedDate", label: "核准日期", inputType: "date" },
  { name: "registrationAuthority", label: "登记机关" },
  {
    name: "status.normalized",
    label: "标准经营状态",
    valueEditorType: "select",
    values: [
      { name: "active", label: "在营/存续" },
      { name: "cancelled", label: "注销" },
      { name: "revoked", label: "吊销" },
      { name: "suspended", label: "停业" },
      { name: "liquidating", label: "清算" },
      { name: "inactive", label: "非正常" },
      { name: "unknown", label: "未知" },
    ],
  },
  { name: "industry.l1", label: "一级行业" },
  { name: "industry.l2", label: "二级行业" },
  { name: "region.raw", label: "地区原始值" },
  { name: "region.province", label: "省" },
  { name: "region.city", label: "市" },
  { name: "region.district", label: "区县" },
  { name: "personnelScale.raw", label: "人员规模原始值" },
  {
    name: "personnelScale.lowerBound",
    label: "人员规模下限",
    inputType: "number",
  },
  {
    name: "personnelScale.upperBound",
    label: "人员规模上限",
    inputType: "number",
  },
  { name: "insuredCount", label: "参保人数", inputType: "number" },
  { name: "registeredAddress", label: "注册地址" },
  { name: "businessScope", label: "经营范围" },
  { name: "contact.phoneCount", label: "电话数量", inputType: "number" },
  { name: "contact.emailCount", label: "邮箱数量", inputType: "number" },
  { name: "tags.qualifications", label: "资质标签" },
  { name: "tags.risk", label: "风险标签" },
  { name: "tags.operational", label: "经营标签" },
  {
    name: "riskSnapshot.severity",
    label: "风险级别",
    valueEditorType: "select",
    values: [
      "none",
      "info",
      "low",
      "medium",
      "high",
      "critical",
      "unknown",
    ].map((value) => ({ name: value, label: value })),
  },
];

const operatorDefinitions = [
  { name: "eq", label: "等于" },
  { name: "not_eq", label: "不等于" },
  { name: "gte", label: "大于等于" },
  { name: "lte", label: "小于等于" },
  { name: "contains", label: "包含" },
  { name: "not_contains", label: "不包含" },
  { name: "in", label: "属于任一值" },
  { name: "not_in", label: "不属于任一值" },
  { name: "present", label: "有值" },
  { name: "absent", label: "无值" },
  { name: "intersects", label: "与列表有交集" },
];

const numericFields = new Set(
  fields
    .filter((field) => field.inputType === "number")
    .map((field) => field.name),
);
const arrayOperators = new Set(["in", "not_in", "intersects"]);
const noValueOperators = new Set(["present", "absent"]);
const fieldLabels = new Map(
  fields.map((field) => [field.name, String(field.label)]),
);
const operatorLabels = new Map(
  operatorDefinitions.map((operator) => [operator.name, operator.label]),
);

function normalizeValue(field: string, operator: string, value: unknown) {
  if (noValueOperators.has(operator)) return undefined;
  if (arrayOperators.has(operator)) {
    if (Array.isArray(value)) return value;
    return String(value ?? "")
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (numericFields.has(field)) {
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }
  return value;
}

function conditionLabel(field: string, operator: string, value: unknown) {
  const suffix = noValueOperators.has(operator)
    ? ""
    : ` ${Array.isArray(value) ? value.join("、") : String(value ?? "")}`;
  return `${fieldLabels.get(field) ?? field} ${operatorLabels.get(operator) ?? operator}${suffix}`;
}

function queryNodeToEligibility(
  node: RuleGroupType | RuleType,
  missingPolicy: "review" | "pass" | "fail",
  depth = 1,
): EligibilityGroup | EligibilityCondition {
  if ("rules" in node) {
    if (depth > 5) throw new Error("准入条件最多允许 5 层嵌套。");
    return {
      id: String(node.id ?? crypto.randomUUID()),
      combinator: node.combinator === "or" ? "or" : "and",
      rules: node.rules.map((child) =>
        queryNodeToEligibility(
          child as RuleGroupType | RuleType,
          missingPolicy,
          depth + 1,
        ),
      ),
    };
  }
  const field = String(node.field ?? "");
  const operator = String(node.operator ?? "");
  if (!field || !operatorDefinitions.some((item) => item.name === operator)) {
    throw new Error("准入条件中存在未选择字段或关系的条目。");
  }
  const value = normalizeValue(field, operator, node.value);
  return {
    id: String(node.id ?? crypto.randomUUID()),
    label: conditionLabel(field, operator, value),
    field,
    operator: operator as EligibilityCondition["operator"],
    ...(typeof value === "undefined" ? {} : { value }),
    missingPolicy,
    enabled: true,
  };
}

function eligibilityToQuery(group?: EligibilityGroup): RuleGroupType {
  if (!group) return emptyQuery;
  return {
    id: group.id,
    combinator: group.combinator,
    rules: group.rules.map((node) =>
      "rules" in node
        ? eligibilityToQuery(node)
        : {
            id: node.id,
            field: node.field,
            operator: node.operator,
            value: Array.isArray(node.value)
              ? node.value.join(",")
              : node.value,
          },
    ),
  };
}

function newLeadRule(kind: LeadRule["kind"]): LeadRule {
  return {
    id: crypto.randomUUID(),
    label: "",
    kind,
    field: "",
    operator: "eq",
    value: "",
    weight: kind === "priority" ? 10 : 0,
    onMatch: kind === "priority" ? "score" : "block",
    missingPolicy: "review",
    enabled: true,
  };
}

function normalizedLeadRule(rule: LeadRule): LeadRule {
  const value = normalizeValue(rule.field, rule.operator, rule.value);
  return {
    ...rule,
    label: rule.label.trim(),
    ...(typeof value === "undefined" ? { value: undefined } : { value }),
    weight: Math.max(0, Number(rule.weight) || 0),
    onMatch: rule.kind === "priority" ? "score" : rule.onMatch,
  };
}

function ruleDefinition(input?: Record<string, unknown>): RuleTemplate | null {
  const parsed = RuleTemplateSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export function RuleTemplatesPage() {
  const { workspace } = useWorkspace();
  const notify = useNotify();
  const [searchParams] = useSearchParams();
  const sets = useGetList<RuleSet>("rule_sets", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "updated_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });
  const versions = useGetList<RuleSetVersion>("rule_set_versions", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "version_number", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });
  const lists = useGetList<CompanyList>("company_lists", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "created_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });
  const runs = useGetList<RuleRun>("rule_runs", {
    pagination: { page: 1, perPage: 50 },
    sort: { field: "requested_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });
  const [selectedSetId, setSelectedSetId] = useState("new");
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [description, setDescription] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [eligibilityMissingPolicy, setEligibilityMissingPolicy] = useState<
    "review" | "pass" | "fail"
  >("review");
  const [eligibilityUnknownPolicy, setEligibilityUnknownPolicy] = useState<
    "review" | "exclude" | "pass"
  >("review");
  const [query, setQuery] = useState<RuleGroupType>(emptyQuery);
  const [leadRules, setLeadRules] = useState<LeadRule[]>([]);
  const [p1, setP1] = useState(75);
  const [p2, setP2] = useState(50);
  const [minimumCompleteness, setMinimumCompleteness] = useState(70);
  const [selectedListId, setSelectedListId] = useState(
    searchParams.get("companyListId") ?? "",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [receipt, setReceipt] = useState<WorkbenchJobResponse | null>(null);
  const previewIdempotencyKey = useRef<string | null>(null);

  const selectedSet = sets.data?.find((item) => item.id === selectedSetId);
  const selectedVersion = useMemo(
    () =>
      versions.data
        ?.filter((item) => item.rule_set_id === selectedSetId)
        .sort((a, b) => b.version_number - a.version_number)[0],
    [selectedSetId, versions.data],
  );
  const selectedList = lists.data?.find((item) => item.id === selectedListId);
  const latestRun = runs.data?.find(
    (item) =>
      item.rule_version_id === selectedVersion?.id &&
      item.company_list_id === selectedListId,
  );

  useEffect(() => {
    previewIdempotencyKey.current = null;
    setReceipt(null);
  }, [selectedListId, selectedVersion?.id]);

  useEffect(() => {
    if (!selectedSet) {
      if (selectedSetId === "new") {
        setName("");
        setObjective("");
        setDescription("");
        setChangeNote("");
        setQuery(emptyQuery);
        setLeadRules([]);
        setP1(75);
        setP2(50);
        setMinimumCompleteness(70);
        setEligibilityMissingPolicy("review");
        setEligibilityUnknownPolicy("review");
      }
      return;
    }
    const template = ruleDefinition(selectedVersion?.rule_definition);
    setName(selectedSet.name);
    setObjective(selectedSet.business_objective ?? "");
    setDescription(selectedSet.description ?? "");
    setChangeNote(selectedVersion?.change_note ?? "");
    setQuery(eligibilityToQuery(template?.eligibility?.root));
    setLeadRules(template?.rules ?? []);
    setP1(template?.thresholds.p1 ?? 75);
    setP2(template?.thresholds.p2 ?? 50);
    setMinimumCompleteness(template?.thresholds.minimumCompleteness ?? 70);
    setEligibilityUnknownPolicy(template?.eligibility?.onUnknown ?? "review");
    const firstCondition = template?.eligibility?.root.rules.find(
      (node): node is EligibilityCondition => !("rules" in node),
    );
    setEligibilityMissingPolicy(firstCondition?.missingPolicy ?? "review");
  }, [selectedSet, selectedSetId, selectedVersion]);

  const updateLeadRule = (id: string, change: Partial<LeadRule>) => {
    setLeadRules((current) =>
      current.map((rule) => (rule.id === id ? { ...rule, ...change } : rule)),
    );
  };

  const save = async () => {
    if (!name.trim() || !objective.trim()) {
      notify("请填写模板名称和业务目标。", { type: "warning" });
      return null;
    }
    if (query.rules.length === 0) {
      notify("请至少添加一条准入条件。", { type: "warning" });
      return null;
    }
    if (leadRules.some((rule) => !rule.label.trim() || !rule.field)) {
      notify("加分规则和风险门禁必须填写名称与字段。", { type: "warning" });
      return null;
    }
    setIsSaving(true);
    try {
      const eligibilityRoot = queryNodeToEligibility(
        query,
        eligibilityMissingPolicy,
      ) as EligibilityGroup;
      const parsedTemplate = RuleTemplateSchema.parse({
        // The atomic database service owns the stable rule-set UUID and
        // overwrites this placeholder before publication.
        id: selectedSet?.id ?? "pending-rule-set",
        name: name.trim(),
        eligibility: {
          root: eligibilityRoot,
          onNoMatch: "exclude",
          onUnknown: eligibilityUnknownPolicy,
        },
        rules: leadRules.map(normalizedLeadRule),
        thresholds: { p1, p2, minimumCompleteness },
      });
      const saved = await saveRuleTemplate({
        workspaceId: workspace!.id,
        ruleSetId: selectedSet?.id,
        name: name.trim(),
        description: description.trim(),
        businessObjective: objective.trim(),
        ruleDefinition: parsedTemplate,
        scoringDefinition: { engineVersion: "lead-rules-v1" },
        changeNote:
          changeNote.trim() ||
          (selectedSet ? "由 GUI 保存新版本" : "初始规则版本"),
      });
      notify(`规则模板 v${saved.versionNumber} 已原子发布并通过 DSL 校验。`, {
        type: "success",
      });
      await Promise.all([sets.refetch(), versions.refetch()]);
      setSelectedSetId(saved.ruleSetId);
      return saved;
    } catch (error) {
      notify(`规则未保存：${getErrorMessage(error)}`, { type: "error" });
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const runPreview = async () => {
    if (!selectedVersion || !selectedList) return;
    setIsRunning(true);
    try {
      const idempotencyKey =
        previewIdempotencyKey.current ?? createIdempotencyKey("rules-sample");
      previewIdempotencyKey.current = idempotencyKey;
      const job = await runWorkbenchAction(
        "run_ruleset",
        workspace!.id,
        {
          ruleVersionId: selectedVersion.id,
          companyListId: selectedList.id,
          runMode: "sample",
          engineVersion: "lead-rules-v1",
          runConfig: { sampleSize: 10 },
        },
        idempotencyKey,
      );
      previewIdempotencyKey.current = null;
      setReceipt(job);
      notify(`规则效果预览任务已提交（${job.status}）`, { type: "success" });
      await runs.refetch();
    } catch (error) {
      notify(getErrorMessage(error), { type: "error" });
    } finally {
      setIsRunning(false);
    }
  };

  const loading =
    sets.isPending || versions.isPending || lists.isPending || runs.isPending;
  const error = sets.error || versions.error || lists.error || runs.error;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="整理规则"
        title="规则模板"
        description="准入条件、优先级加分和风险门禁保存为经过领域 Schema 校验的版本；规则效果预览只运行真实企业批次。"
        actions={
          <Button variant="outline" onClick={() => setSelectedSetId("new")}>
            <Plus />
            新建模板
          </Button>
        }
      />

      <DataBoundary isPending={loading} error={error} title="无法读取规则资源">
        <div className="grid gap-6 xl:grid-cols-[250px_minmax(0,1fr)_340px]">
          <Card className="h-fit shadow-none">
            <CardHeader>
              <CardTitle>模板与版本</CardTitle>
              <CardDescription>发布后通过新版本继续修改。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <RuleSetButton
                active={selectedSetId === "new"}
                name="新规则模板"
                detail="从空白条件开始"
                onClick={() => setSelectedSetId("new")}
              />
              {sets.data?.map((ruleSet) => (
                <RuleSetButton
                  key={ruleSet.id}
                  active={selectedSetId === ruleSet.id}
                  name={ruleSet.name}
                  detail={`v${ruleSet.current_version_number ?? "—"}`}
                  status={ruleSet.status}
                  onClick={() => setSelectedSetId(ruleSet.id)}
                />
              ))}
            </CardContent>
          </Card>

          <div className="space-y-6 min-w-0">
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle>规则说明与分层阈值</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldInput
                    label="模板名称"
                    value={name}
                    onChange={setName}
                  />
                  <FieldInput
                    label="模板说明"
                    value={description}
                    onChange={setDescription}
                  />
                  <FieldInput
                    label="本次版本说明"
                    value={changeNote}
                    onChange={setChangeNote}
                  />
                  <div className="space-y-2 sm:col-span-2">
                    <Label>业务目标</Label>
                    <Textarea
                      aria-label="业务目标"
                      value={objective}
                      onChange={(event) => setObjective(event.target.value)}
                      placeholder="说明适用行业、目标客户和排除边界"
                      rows={3}
                    />
                  </div>
                </div>
                <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-3">
                  <NumberInput label="P1 分数线" value={p1} onChange={setP1} />
                  <NumberInput label="P2 分数线" value={p2} onChange={setP2} />
                  <NumberInput
                    label="最低证据完整度"
                    value={minimumCompleteness}
                    onChange={setMinimumCompleteness}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-none">
              <CardHeader>
                <CardTitle>准入条件</CardTitle>
                <CardDescription>
                  只决定企业是否进入评分；条件树最多 5 层、200 条，字段名与
                  lead-rules-v1 完全一致。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <PolicySelect
                    label="单个条件字段缺失"
                    value={eligibilityMissingPolicy}
                    onChange={(value) =>
                      setEligibilityMissingPolicy(
                        value as "review" | "pass" | "fail",
                      )
                    }
                    options={[
                      ["review", "转人工核验"],
                      ["pass", "按通过处理"],
                      ["fail", "按不通过处理"],
                    ]}
                  />
                  <PolicySelect
                    label="条件树整体未知"
                    value={eligibilityUnknownPolicy}
                    onChange={(value) =>
                      setEligibilityUnknownPolicy(
                        value as "review" | "exclude" | "pass",
                      )
                    }
                    options={[
                      ["review", "转人工核验"],
                      ["exclude", "排除"],
                      ["pass", "继续评分"],
                    ]}
                  />
                </div>
                <div className="workbench-query-builder">
                  <QueryBuilder
                    fields={fields}
                    operators={operatorDefinitions}
                    query={query}
                    onQueryChange={setQuery}
                    autoSelectField={false}
                    autoSelectOperator={false}
                    translations={{
                      fields: { placeholderLabel: "选择字段" },
                      operators: { placeholderLabel: "选择关系" },
                      addRule: { label: "+ 条件", title: "添加条件" },
                      addGroup: { label: "+ 条件组", title: "添加条件组" },
                      removeRule: { label: "删除", title: "删除条件" },
                      removeGroup: { label: "删除组", title: "删除条件组" },
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            <LeadRulesEditor
              rules={leadRules}
              setRules={setLeadRules}
              updateRule={updateLeadRule}
            />

            <div className="flex justify-end">
              <Button onClick={save} disabled={isSaving}>
                {isSaving ? <Loader2 className="animate-spin" /> : <Save />}
                保存为新版本
              </Button>
            </div>
          </div>

          <RulePreview
            lists={lists.data ?? []}
            selectedListId={selectedListId}
            setSelectedListId={setSelectedListId}
            selectedVersion={selectedVersion}
            latestRun={latestRun}
            receipt={receipt}
            isRunning={isRunning}
            onRun={runPreview}
          />
        </div>
      </DataBoundary>
    </div>
  );
}

function LeadRulesEditor({
  rules,
  setRules,
  updateRule,
}: {
  rules: LeadRule[];
  setRules: React.Dispatch<React.SetStateAction<LeadRule[]>>;
  updateRule: (id: string, change: Partial<LeadRule>) => void;
}) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>加分规则与风险门禁</CardTitle>
            <CardDescription className="mt-1.5">
              加分规则影响 P1/P2；风险门禁可以转核验或直接阻断。
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setRules((current) => [...current, newLeadRule("priority")])
              }
            >
              <Plus />
              加分规则
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setRules((current) => [...current, newLeadRule("risk_gate")])
              }
            >
              <ShieldAlert />
              风险门禁
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rules.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            当前没有加分或风险规则。可只使用准入条件，也可以按业务目标继续配置。
          </p>
        ) : null}
        {rules.map((rule) => (
          <div key={rule.id} className="space-y-4 rounded-xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <Badge
                variant={rule.kind === "priority" ? "default" : "destructive"}
              >
                {rule.kind === "priority" ? "加分规则" : "风险门禁"}
              </Badge>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={rule.enabled}
                    onCheckedChange={(checked) =>
                      updateRule(rule.id, { enabled: checked === true })
                    }
                  />
                  启用
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setRules((current) =>
                      current.filter((item) => item.id !== rule.id),
                    )
                  }
                  aria-label="删除规则"
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <FieldInput
                label="规则名称"
                value={rule.label}
                onChange={(value) => updateRule(rule.id, { label: value })}
              />
              <SelectField
                label="字段"
                value={rule.field}
                onChange={(value) => updateRule(rule.id, { field: value })}
                options={fields.map((field) => [
                  field.name,
                  String(field.label),
                ])}
              />
              <SelectField
                label="关系"
                value={rule.operator}
                onChange={(value) =>
                  updateRule(rule.id, {
                    operator: value as LeadRule["operator"],
                  })
                }
                options={operatorDefinitions.map((item) => [
                  item.name,
                  item.label,
                ])}
              />
              {!noValueOperators.has(rule.operator) ? (
                <FieldInput
                  label={
                    arrayOperators.has(rule.operator)
                      ? "目标值（逗号分隔）"
                      : "目标值"
                  }
                  value={
                    Array.isArray(rule.value)
                      ? rule.value.join(",")
                      : String(rule.value ?? "")
                  }
                  onChange={(value) => updateRule(rule.id, { value })}
                />
              ) : null}
              {rule.kind === "priority" ? (
                <NumberInput
                  label="权重"
                  value={rule.weight}
                  onChange={(value) => updateRule(rule.id, { weight: value })}
                />
              ) : (
                <SelectField
                  label="命中后动作"
                  value={rule.onMatch}
                  onChange={(value) =>
                    updateRule(rule.id, {
                      onMatch: value as LeadRule["onMatch"],
                    })
                  }
                  options={[
                    ["review", "转人工核验"],
                    ["block", "阻断"],
                  ]}
                />
              )}
              <SelectField
                label="字段缺失"
                value={rule.missingPolicy}
                onChange={(value) =>
                  updateRule(rule.id, {
                    missingPolicy: value as LeadRule["missingPolicy"],
                  })
                }
                options={[
                  ["review", "转人工核验"],
                  ["pass", "放行"],
                  ["fail", "按失败处理"],
                ]}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RulePreview({
  lists,
  selectedListId,
  setSelectedListId,
  selectedVersion,
  latestRun,
  receipt,
  isRunning,
  onRun,
}: {
  lists: CompanyList[];
  selectedListId: string;
  setSelectedListId: (id: string) => void;
  selectedVersion?: RuleSetVersion;
  latestRun?: RuleRun;
  receipt: WorkbenchJobResponse | null;
  isRunning: boolean;
  onRun: () => void;
}) {
  return (
    <Card className="h-fit shadow-none">
      <CardHeader>
        <CardTitle>规则效果预览</CardTitle>
        <CardDescription>对选定真实批次先执行 10 家样本。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>真实企业批次</Label>
          <Select value={selectedListId} onValueChange={setSelectedListId}>
            <SelectTrigger className="w-full" aria-label="真实企业批次">
              <SelectValue placeholder="选择批次" />
            </SelectTrigger>
            <SelectContent>
              {lists.map((list) => (
                <SelectItem key={list.id} value={list.id}>
                  {list.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!selectedVersion ? (
          <Alert>
            <SlidersHorizontal />
            <AlertTitle>先保存规则版本</AlertTitle>
            <AlertDescription>
              未保存的浏览器状态不能作为可审计任务输入。
            </AlertDescription>
          </Alert>
        ) : null}
        {selectedListId ? (
          <Alert>
            <FlaskConical />
            <AlertTitle>服务端锁定输入</AlertTitle>
            <AlertDescription>
              后端在事务内计算企业清单 SHA-256，浏览器不能伪造或覆盖。
            </AlertDescription>
          </Alert>
        ) : null}
        {latestRun ? (
          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">最近一次结果</span>
              <StatusBadge status={latestRun.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(latestRun.requested_at)}
            </p>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <span>入选 {latestRun.included_count ?? "—"}</span>
              <span>排除 {latestRun.excluded_count ?? "—"}</span>
              <span>核验 {latestRun.review_count ?? "—"}</span>
            </div>
          </div>
        ) : null}
        {receipt ? (
          <Alert>
            <AlertTitle>预览任务：{receipt.status}</AlertTitle>
            <AlertDescription>任务 ID：{receipt.jobId}</AlertDescription>
          </Alert>
        ) : null}
        <Button
          className="w-full"
          onClick={onRun}
          disabled={!selectedVersion || !selectedListId || isRunning}
        >
          {isRunning ? <Loader2 className="animate-spin" /> : <PlayCircle />}用
          10 家真实企业试算
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link to="/runs">
            查看执行任务
            <ArrowRight />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function RuleSetButton({
  active,
  name,
  detail,
  status,
  onClick,
}: {
  active: boolean;
  name: string;
  detail: string;
  status?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border p-3 text-left text-sm ${
        active ? "border-primary bg-primary/5" : "hover:bg-muted/40"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate font-medium">{name}</span>
        {status ? <StatusBadge status={status} /> : null}
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>
    </button>
  );
}

function FieldInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        aria-label={label}
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue placeholder="请选择" />
        </SelectTrigger>
        <SelectContent>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function PolicySelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <SelectField
      label={label}
      value={value}
      onChange={onChange}
      options={options}
    />
  );
}
