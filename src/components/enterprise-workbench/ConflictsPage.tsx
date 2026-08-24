import { useMemo } from "react";
import { ArrowRight, GitMerge, ShieldQuestion } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataBoundary, EmptyState, MetricCard, PageHeader } from "./components";
import type {
  Company,
  ManualReview,
  RuleResult,
  SourceSnapshot,
} from "./types";
import { latestCompanySourceConflicts } from "./sourceConflicts";
import { formatDateTime } from "./utils";
import { useWorkspace } from "./workspace";

const fieldLabels: Record<string, string> = {
  companyName: "企业名称",
  creditCode: "统一社会信用代码",
  legalPerson: "法定代表人",
  companyType: "企业类型",
  "registeredCapital.valueWan": "注册资本（万元）",
  "paidInCapital.valueWan": "实缴资本（万元）",
  establishedDate: "成立日期",
  approvedDate: "核准日期",
  registrationAuthority: "登记机关",
  "status.raw": "经营状态",
  "industry.l1": "一级行业",
  "industry.l2": "二级行业",
  "region.raw": "所属地区",
  "personnelScale.raw": "人员规模",
  insuredCount: "参保人数",
  registeredAddress: "注册地址",
  businessScope: "经营范围",
};

const resolutionLabels: Record<string, string> = {
  non_null_preferred: "优先采用非空值",
  provider_priority: "按已配置数据源优先级",
  newer_source_update: "按来源数据更新时间",
  newer_retrieval: "按工作台获取时间",
  stable_provider_id: "按稳定 Provider ID 打破平局",
};

export function ConflictsPage() {
  const { workspace } = useWorkspace();
  const snapshots = useGetList<SourceSnapshot>("source_snapshots", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "captured_at", order: "DESC" },
    filter: { workspace_id: workspace?.id, match_status: "conflict" },
  });
  const pendingResults = useGetList<RuleResult>("rule_results", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "evaluated_at", order: "DESC" },
    filter: { workspace_id: workspace?.id, decision: "needs_review" },
  });
  const recentResults = useGetList<RuleResult>("rule_results", {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: "evaluated_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });
  const reviews = useGetList<ManualReview>("manual_reviews", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "reviewed_at", order: "DESC" },
    filter: { workspace_id: workspace?.id, is_current: true },
  });
  const companies = useGetList<Company>("companies", {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: "updated_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });

  const companyMap = useMemo(
    () =>
      new Map(
        (companies.data ?? []).map((company) => [String(company.id), company]),
      ),
    [companies.data],
  );
  const reviewedResultIds = useMemo(
    () =>
      new Set(
        (reviews.data ?? []).map((review) => String(review.rule_result_id)),
      ),
    [reviews.data],
  );
  const unresolvedResults = (pendingResults.data ?? []).filter(
    (result) => !reviewedResultIds.has(String(result.id)),
  );
  const sourceConflicts = useMemo(
    () => latestCompanySourceConflicts(recentResults.data ?? []),
    [recentResults.data],
  );
  const loading =
    snapshots.isPending ||
    pendingResults.isPending ||
    recentResults.isPending ||
    reviews.isPending ||
    companies.isPending;
  const error =
    snapshots.error ||
    pendingResults.error ||
    recentResults.error ||
    reviews.error ||
    companies.error;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="数据冲突"
        title="冲突与待核验"
        description="集中处理字段映射冲突、跨来源不一致和规则缺失。系统保留每个供应商事实，不采用“后写覆盖前写”的不透明方式。"
        actions={
          <Button asChild>
            <Link to="/review">
              进入企业审阅
              <ArrowRight />
            </Link>
          </Button>
        }
      />

      <Alert className="border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30">
        <GitMerge />
        <AlertTitle>冲突不会被模型自动裁决</AlertTitle>
        <AlertDescription>
          企查查、获客助手与用户上传出现不同值时，系统保存所有事实、时间和来源；统一主档只采纳有明确映射与审阅依据的值。
        </AlertDescription>
      </Alert>

      <DataBoundary isPending={loading} error={error} title="无法读取冲突资源">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="映射冲突快照"
            value={snapshots.total ?? 0}
            detail="解析或匹配阶段发现"
            tone="amber"
          />
          <MetricCard
            label="跨来源字段差异"
            value={sourceConflicts.length}
            detail="每家企业只取最近一次规则运行"
            tone="amber"
          />
          <MetricCard
            label="规则待核验"
            value={pendingResults.total ?? 0}
            detail="包含缺失字段和门禁结果"
            tone="amber"
          />
          <MetricCard
            label="尚未人工处理"
            value={unresolvedResults.length}
            detail="当前页面已加载范围内"
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Card className="shadow-none xl:col-span-2">
            <CardHeader>
              <CardTitle>跨数据源字段差异</CardTitle>
              <CardDescription>
                来自最近一次规则运行的确定性合并记录；选中值用于本次计算，其他供应商值仍然保留。
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sourceConflicts.length === 0 ? (
                <EmptyState
                  title="最近规则运行没有字段差异"
                  description="需要至少两个数据源为同一企业提供不同的非空值，并完成一次规则运行。"
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>企业</TableHead>
                      <TableHead>字段</TableHead>
                      <TableHead>本次采用</TableHead>
                      <TableHead>全部候选值</TableHead>
                      <TableHead>裁决规则</TableHead>
                      <TableHead className="text-right">证据</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sourceConflicts.map((conflict) => {
                      const company = companyMap.get(conflict.companyId);
                      const chosen = conflict.candidates.find(
                        (candidate) =>
                          candidate.providerId === conflict.chosenProviderId,
                      );
                      return (
                        <TableRow
                          key={`${conflict.ruleResultId}:${conflict.fieldPath}`}
                        >
                          <TableCell>
                            <p className="font-medium">
                              {company?.name ?? `企业 ID ${conflict.companyId}`}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {company?.unified_social_credit_code ??
                                "信用代码未知"}
                            </p>
                          </TableCell>
                          <TableCell>
                            {fieldLabels[conflict.fieldPath] ??
                              conflict.fieldPath}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {conflict.chosenProviderId}
                            </Badge>
                            <p className="mt-2 max-w-56 break-words text-xs text-muted-foreground">
                              {chosen?.displayValue ?? "值未返回"}
                            </p>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-80 space-y-1 text-xs">
                              {conflict.candidates.map((candidate) => (
                                <p
                                  key={`${candidate.providerId}:${candidate.displayValue}`}
                                  className="break-words"
                                >
                                  <span className="font-medium">
                                    {candidate.providerId}
                                  </span>
                                  ：{candidate.displayValue}
                                </p>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-52 text-xs text-muted-foreground">
                            {resolutionLabels[conflict.resolution] ??
                              conflict.resolution}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="outline" size="sm">
                              <Link to="/review">
                                <ShieldQuestion />
                                审阅
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>字段映射冲突</CardTitle>
              <CardDescription>
                来自真实 source_snapshots.match_status=conflict。
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(snapshots.data?.length ?? 0) === 0 ? (
                <EmptyState
                  title="当前没有映射冲突"
                  description="导入真实数据后，无法匹配或映射有歧义的记录会进入这里。"
                />
              ) : (
                <div className="space-y-3">
                  {snapshots.data?.map((snapshot) => {
                    const company = snapshot.company_id
                      ? companyMap.get(String(snapshot.company_id))
                      : undefined;
                    return (
                      <div key={snapshot.id} className="rounded-xl border p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">
                              {company?.name ?? "尚未匹配企业"}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              快照 {snapshot.id}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-amber-700">
                            映射冲突
                          </Badge>
                        </div>
                        <p className="mt-3 text-xs leading-5 text-muted-foreground">
                          {snapshot.mapping_warnings?.length
                            ? JSON.stringify(snapshot.mapping_warnings)
                            : "后端未提供具体警告说明"}
                        </p>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {formatDateTime(snapshot.captured_at)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>规则待核验</CardTitle>
              <CardDescription>
                未产生当前人工结论的 needs_review 结果。
              </CardDescription>
            </CardHeader>
            <CardContent>
              {unresolvedResults.length === 0 ? (
                <EmptyState
                  title="当前没有未处理的规则结果"
                  description="规则缺失字段或风险门禁触发后，会等待人工查看证据并作出决定。"
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>企业</TableHead>
                      <TableHead>缺失字段</TableHead>
                      <TableHead>评分</TableHead>
                      <TableHead className="text-right">处理</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unresolvedResults.map((result) => {
                      const company = companyMap.get(String(result.company_id));
                      return (
                        <TableRow key={result.id}>
                          <TableCell>
                            <p className="font-medium">
                              {company?.name ?? `企业 ID ${result.company_id}`}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {company?.unified_social_credit_code ??
                                "信用代码未知"}
                            </p>
                          </TableCell>
                          <TableCell className="max-w-52 truncate">
                            {result.missing_fields?.join("、") || "—"}
                          </TableCell>
                          <TableCell>{result.score ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="outline" size="sm">
                              <Link to="/review">
                                <ShieldQuestion />
                                审阅
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </DataBoundary>
    </div>
  );
}
