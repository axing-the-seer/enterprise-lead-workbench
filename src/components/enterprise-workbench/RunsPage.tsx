import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, PlayCircle, RefreshCw } from "lucide-react";
import { useGetList, useNotify } from "ra-core";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DataBoundary,
  EmptyState,
  PageHeader,
  StatusBadge,
} from "./components";
import type {
  CompanyList,
  IngestionJob,
  RuleRun,
  RuleSet,
  RuleSetVersion,
  WorkbenchJobResponse,
} from "./types";
import { formatDateTime, formatNumber, getErrorMessage } from "./utils";
import { useWorkspace } from "./workspace";
import { createIdempotencyKey, runWorkbenchAction } from "./workbenchActions";

export function RunsPage() {
  const { workspace } = useWorkspace();
  const [runOpen, setRunOpen] = useState(false);
  const ingestion = useGetList<IngestionJob>("ingestion_jobs", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "requested_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });
  const rules = useGetList<RuleRun>("rule_runs", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "requested_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });
  const ruleSets = useGetList<RuleSet>("rule_sets", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "name", order: "ASC" },
    filter: { workspace_id: workspace?.id },
  });
  const versions = useGetList<RuleSetVersion>("rule_set_versions", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "version_number", order: "DESC" },
    filter: { workspace_id: workspace?.id, status: "published" },
  });
  const lists = useGetList<CompanyList>("company_lists", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "created_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });

  const refreshAll = () => {
    void Promise.all([ingestion.refetch(), rules.refetch()]);
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="任务记录"
        title="执行任务"
        description="取数、补证、规则与导出都由后端任务执行。页面只显示真实队列和运行状态；断网或执行器未部署时会明确报错。"
        actions={
          <>
            <Button variant="outline" onClick={refreshAll}>
              <RefreshCw />
              刷新状态
            </Button>
            <Button onClick={() => setRunOpen(true)}>
              <PlayCircle />
              执行整批规则
            </Button>
          </>
        }
      />

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">规则任务</TabsTrigger>
          <TabsTrigger value="ingestion">接入与补证任务</TabsTrigger>
        </TabsList>
        <TabsContent value="rules" className="mt-5">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>规则执行记录</CardTitle>
              <CardDescription>
                样本试算和整批执行使用相同规则引擎。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataBoundary
                isPending={rules.isPending}
                error={rules.error}
                title="无法读取规则任务"
              >
                {(rules.data?.length ?? 0) === 0 ? (
                  <EmptyState
                    title="还没有规则执行任务"
                    description="先保存规则版本并选择真实企业批次。你可以在规则页用 10 家真实企业试算，也可以在这里执行整批规则。"
                    action={
                      <Button className="mt-5" onClick={() => setRunOpen(true)}>
                        执行第一批规则
                      </Button>
                    }
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>模式</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>总数</TableHead>
                        <TableHead>入选</TableHead>
                        <TableHead>排除</TableHead>
                        <TableHead>待核验</TableHead>
                        <TableHead>提交时间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.data?.map((run) => (
                        <TableRow key={run.id}>
                          <TableCell>
                            <Badge variant="outline">
                              {run.run_mode === "sample"
                                ? "10 家试算"
                                : "整批执行"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={run.status} />
                          </TableCell>
                          <TableCell>{formatNumber(run.total_count)}</TableCell>
                          <TableCell>
                            {formatNumber(run.included_count)}
                          </TableCell>
                          <TableCell>
                            {formatNumber(run.excluded_count)}
                          </TableCell>
                          <TableCell>
                            {formatNumber(run.review_count)}
                          </TableCell>
                          <TableCell>
                            {formatDateTime(run.requested_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </DataBoundary>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="ingestion" className="mt-5">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>数据接入记录</CardTitle>
              <CardDescription>
                包含文件导入、查询、刷新和补充证据。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataBoundary
                isPending={ingestion.isPending}
                error={ingestion.error}
                title="无法读取数据接入任务"
              >
                {(ingestion.data?.length ?? 0) === 0 ? (
                  <EmptyState
                    title="还没有接入任务"
                    description="请从“找企业”页发起真实数据查询或导入已有名单。"
                    actionLabel="前往找企业"
                    actionTo="/"
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>任务类型</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>接收</TableHead>
                        <TableHead>接纳</TableHead>
                        <TableHead>拒绝</TableHead>
                        <TableHead>提交时间</TableHead>
                        <TableHead>错误</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ingestion.data?.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell>{job.job_kind ?? "—"}</TableCell>
                          <TableCell>
                            <StatusBadge status={job.status} />
                          </TableCell>
                          <TableCell>
                            {formatNumber(job.received_count)}
                          </TableCell>
                          <TableCell>
                            {formatNumber(job.accepted_count)}
                          </TableCell>
                          <TableCell>
                            {formatNumber(job.rejected_count)}
                          </TableCell>
                          <TableCell>
                            {formatDateTime(job.requested_at)}
                          </TableCell>
                          <TableCell className="max-w-60 truncate text-red-600">
                            {job.error_message ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </DataBoundary>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <FullRuleRunDialog
        open={runOpen}
        onOpenChange={setRunOpen}
        workspaceId={workspace!.id}
        ruleSets={ruleSets.data ?? []}
        versions={versions.data ?? []}
        lists={lists.data ?? []}
        resourceError={ruleSets.error || versions.error || lists.error}
        onSubmitted={() => void rules.refetch()}
      />
    </div>
  );
}

function FullRuleRunDialog({
  open,
  onOpenChange,
  workspaceId,
  ruleSets,
  versions,
  lists,
  resourceError,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  ruleSets: RuleSet[];
  versions: RuleSetVersion[];
  lists: CompanyList[];
  resourceError: unknown;
  onSubmitted: () => void;
}) {
  const notify = useNotify();
  const [ruleVersionId, setRuleVersionId] = useState("");
  const [companyListId, setCompanyListId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<WorkbenchJobResponse | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const setNames = useMemo(
    () => new Map(ruleSets.map((set) => [set.id, set.name])),
    [ruleSets],
  );

  useEffect(() => {
    if (!open) {
      setReceipt(null);
      idempotencyKeyRef.current = null;
    }
  }, [open]);

  const changeRunInput =
    (setter: (value: string) => void) => (value: string) => {
      setter(value);
      setReceipt(null);
      idempotencyKeyRef.current = null;
    };

  const submit = async () => {
    setIsSubmitting(true);
    const idempotencyKey =
      idempotencyKeyRef.current ?? createIdempotencyKey("rules-full");
    idempotencyKeyRef.current = idempotencyKey;
    try {
      const job = await runWorkbenchAction(
        "run_ruleset",
        workspaceId,
        {
          ruleVersionId,
          companyListId,
          runMode: "full",
          engineVersion: "lead-rules-v1",
          runConfig: {},
        },
        idempotencyKey,
      );
      setReceipt(job);
      notify(`整批规则任务已提交（${job.status}）`, { type: "success" });
      onSubmitted();
    } catch (error) {
      notify(getErrorMessage(error), { type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>执行整批规则</DialogTitle>
          <DialogDescription>
            后端会在同一事务内锁定企业清单、计算输入指纹，并保存本次使用的规则版本。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {resourceError ? (
            <Alert variant="destructive">
              <AlertTitle>无法读取执行输入</AlertTitle>
              <AlertDescription>
                {getErrorMessage(resourceError)}
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label>已发布规则版本</Label>
            <Select
              value={ruleVersionId}
              onValueChange={changeRunInput(setRuleVersionId)}
            >
              <SelectTrigger className="w-full" aria-label="已发布规则版本">
                <SelectValue placeholder="选择规则版本" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((version) => (
                  <SelectItem key={version.id} value={version.id}>
                    {setNames.get(version.rule_set_id) ?? "规则模板"} · v
                    {version.version_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>真实企业批次</Label>
            <Select
              value={companyListId}
              onValueChange={changeRunInput(setCompanyListId)}
            >
              <SelectTrigger className="w-full" aria-label="真实企业批次">
                <SelectValue placeholder="选择企业批次" />
              </SelectTrigger>
              <SelectContent>
                {lists.map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    {list.name}（{list.status}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {receipt ? (
            <Alert>
              <AlertTitle>任务：{receipt.status}</AlertTitle>
              <AlertDescription>任务 ID：{receipt.jobId}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={submit}
            disabled={
              !ruleVersionId ||
              !companyListId ||
              isSubmitting ||
              Boolean(receipt)
            }
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin" />
            ) : (
              <PlayCircle />
            )}
            提交整批执行
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
