import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Database,
  FileOutput,
  FolderKanban,
  GitCompareArrows,
  ListChecks,
  PlayCircle,
  SlidersHorizontal,
} from "lucide-react";
import { useGetList } from "ra-core";
import { Link } from "react-router";
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
import {
  HonestDataNotice,
  MetricCard,
  PageHeader,
  StatusBadge,
} from "./components";
import type {
  Company,
  CompanyList,
  IngestionJob,
  RuleResult,
  RuleRun,
  RuleSet,
  SourceConnection,
} from "./types";
import { formatDateTime, getErrorMessage } from "./utils";
import { useWorkspace } from "./workspace";

const workflow = [
  {
    title: "连接真实数据源",
    description: "初始化获客助手、企查查或文件上传连接，并由后端验证。",
    href: "/sources",
    icon: Database,
  },
  {
    title: "取得或上传名单",
    description: "发起真实查询，或上传 CSV、JSON、XLSX 形成可追溯批次。",
    href: "/batches",
    icon: FolderKanban,
  },
  {
    title: "确认字段映射",
    description: "把供应商字段映射到统一企业模型，保留原始值和来源。",
    href: "/mappings",
    icon: GitCompareArrows,
  },
  {
    title: "配置业务规则",
    description: "用可视化条件构建筛选、评分与风险门禁规则。",
    href: "/rules",
    icon: SlidersHorizontal,
  },
  {
    title: "执行与人工审阅",
    description: "执行整批规则，核验冲突与缺失证据，不让模型补造数据。",
    href: "/runs",
    icon: PlayCircle,
  },
  {
    title: "导出或交给 AI",
    description: "生成 CSV、Excel、JSON，并通过受控 REST API / MCP 读取。",
    href: "/exports",
    icon: FileOutput,
  },
];

export function WorkbenchDashboard() {
  const { workspace } = useWorkspace();
  const filter = { workspace_id: workspace?.id };
  const sources = useGetList<SourceConnection>("source_connections_safe", {
    pagination: { page: 1, perPage: 50 },
    sort: { field: "updated_at", order: "DESC" },
    filter,
  });
  const batches = useGetList<CompanyList>("company_lists", {
    pagination: { page: 1, perPage: 1 },
    sort: { field: "created_at", order: "DESC" },
    filter,
  });
  const companies = useGetList<Company>("companies", {
    pagination: { page: 1, perPage: 1 },
    sort: { field: "created_at", order: "DESC" },
    filter,
  });
  const rules = useGetList<RuleSet>("rule_sets", {
    pagination: { page: 1, perPage: 1 },
    sort: { field: "updated_at", order: "DESC" },
    filter,
  });
  const reviews = useGetList<RuleResult>("rule_results", {
    pagination: { page: 1, perPage: 1 },
    sort: { field: "evaluated_at", order: "DESC" },
    filter: { ...filter, decision: "needs_review" },
  });
  const ingestionJobs = useGetList<IngestionJob>("ingestion_jobs", {
    pagination: { page: 1, perPage: 4 },
    sort: { field: "requested_at", order: "DESC" },
    filter,
  });
  const ruleRuns = useGetList<RuleRun>("rule_runs", {
    pagination: { page: 1, perPage: 4 },
    sort: { field: "requested_at", order: "DESC" },
    filter,
  });

  const backendErrors = [
    sources.error,
    batches.error,
    companies.error,
    rules.error,
    reviews.error,
    ingestionJobs.error,
    ruleRuns.error,
  ].filter(Boolean);
  const connectedSources = (sources.data ?? []).filter((source) =>
    ["active", "connected", "ready"].includes(source.status),
  ).length;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="企业名单工作台"
        title="从真实名单到可交付结果"
        description="同一套 Web GUI 可以独立完成取数、映射、规则执行、人工审阅与导出；WorkBuddy 或其他 AI 只是可选调用入口。"
        actions={
          <Button asChild>
            <Link to="/batches">
              新建数据批次
              <ArrowRight />
            </Link>
          </Button>
        }
      />

      <HonestDataNotice />

      {backendErrors.length > 0 ? (
        <Alert variant="destructive">
          <Database />
          <AlertTitle>部分生产资源暂时不可用</AlertTitle>
          <AlertDescription>
            {getErrorMessage(backendErrors[0])}
            。下方指标不会使用示例值填充，请先完成数据库迁移、权限与服务部署。
          </AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="overview-metrics">
        <h3 id="overview-metrics" className="sr-only">
          数据概览
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="可用数据源"
            value={sources.error ? "—" : connectedSources}
            detail={`共 ${sources.total ?? 0} 个连接`}
            tone="blue"
          />
          <MetricCard
            label="数据批次"
            value={batches.error ? "—" : (batches.total ?? 0)}
            detail="含查询与用户上传"
          />
          <MetricCard
            label="企业主档"
            value={companies.error ? "—" : (companies.total ?? 0)}
            detail="按统一企业模型去重"
            tone="green"
          />
          <MetricCard
            label="规则模板"
            value={rules.error ? "—" : (rules.total ?? 0)}
            detail="版本化并可重复执行"
          />
          <MetricCard
            label="待人工核验"
            value={reviews.error ? "—" : (reviews.total ?? 0)}
            detail="冲突、缺失或高风险"
            tone="amber"
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>完整流程</CardTitle>
            <CardDescription>
              每一步都可以在 GUI 中完成，也可以通过 API / MCP 发起同一种任务。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-3 sm:grid-cols-2">
              {workflow.map((step, index) => {
                const Icon = step.icon;
                return (
                  <li key={step.href}>
                    <Link
                      to={step.href}
                      className="group flex h-full gap-4 rounded-xl border p-4 transition-colors hover:border-primary/30 hover:bg-muted/40"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950">
                        <Icon className="size-4" />
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="rounded-full">
                            {index + 1}
                          </Badge>
                          <h4 className="text-sm font-semibold">
                            {step.title}
                          </h4>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          {step.description}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>最近任务</CardTitle>
            <CardDescription>显示后端实际返回的状态。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {ingestionJobs.isPending || ruleRuns.isPending ? (
              <p className="text-sm text-muted-foreground">正在读取任务…</p>
            ) : null}
            {[...(ingestionJobs.data ?? []), ...(ruleRuns.data ?? [])]
              .sort((a, b) =>
                String(b.requested_at ?? b.created_at).localeCompare(
                  String(a.requested_at ?? a.created_at),
                ),
              )
              .slice(0, 5)
              .map((job) => {
                const isRuleRun = "rule_version_id" in job;
                return (
                  <div
                    key={`${isRuleRun ? "rule" : "ingestion"}-${job.id}`}
                    className="flex items-start justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="flex min-w-0 gap-3">
                      {job.status === "succeeded" ||
                      job.status === "completed" ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      ) : (
                        <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {isRuleRun ? "规则执行" : "数据接入"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDateTime(job.requested_at ?? job.created_at)}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={job.status} />
                  </div>
                );
              })}
            {!ingestionJobs.isPending &&
            !ruleRuns.isPending &&
            (ingestionJobs.data?.length ?? 0) + (ruleRuns.data?.length ?? 0) ===
              0 ? (
              <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                还没有真实任务。请先配置数据源并创建数据批次。
              </div>
            ) : null}
            <Button asChild variant="outline" className="w-full">
              <Link to="/runs">
                查看全部任务
                <ListChecks />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
