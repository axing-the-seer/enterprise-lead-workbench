import { useEffect, useMemo, useRef, useState } from "react";
import {
  Braces,
  Check,
  Clipboard,
  Download,
  FileOutput,
  Loader2,
  PlugZap,
} from "lucide-react";
import { useGetList, useNotify } from "ra-core";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import {
  DataBoundary,
  EmptyState,
  PageHeader,
  StatusBadge,
} from "./components";
import type {
  CompanyList,
  ExportJob,
  RuleRun,
  WorkbenchJobResponse,
} from "./types";
import { formatDateTime, formatNumber, getErrorMessage } from "./utils";
import { useWorkspace } from "./workspace";
import { createIdempotencyKey, runWorkbenchAction } from "./workbenchActions";

const exportFields = [
  { value: "companyName", label: "企业名称" },
  { value: "creditCode", label: "统一社会信用代码" },
  { value: "legalPerson", label: "法定代表人" },
  { value: "status.raw", label: "经营状态（原始值）" },
  { value: "companyType", label: "企业类型" },
  { value: "registeredCapital.valueWan", label: "注册资本（万元）" },
  { value: "paidInCapital.valueWan", label: "实缴资本（万元）" },
  { value: "establishedDate", label: "成立日期" },
  { value: "approvedDate", label: "核准日期" },
  { value: "registrationAuthority", label: "登记机关" },
  { value: "industry.l2", label: "行业" },
  { value: "insuredCount", label: "参保人数" },
  { value: "region.raw", label: "地区（原始值）" },
  { value: "region.province", label: "省" },
  { value: "region.city", label: "市" },
  { value: "region.district", label: "区县" },
  { value: "personnelScale.raw", label: "人员规模（原始值）" },
  { value: "registeredAddress", label: "注册地址" },
  { value: "businessScope", label: "经营范围" },
  { value: "contact.phoneMasked", label: "联系电话（脱敏）" },
  { value: "contact.emailMasked", label: "邮箱（脱敏）" },
  { value: "tags.qualifications", label: "资质标签" },
  { value: "tags.risk", label: "风险标签" },
  { value: "tags.operational", label: "经营标签" },
  { value: "riskSnapshot.severity", label: "风险级别" },
  { value: "decision", label: "规则结论" },
];

export function ExportsPage() {
  const { workspace } = useWorkspace();
  const notify = useNotify();
  const [createOpen, setCreateOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const exportsQuery = useGetList<ExportJob>("exports", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "requested_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });
  const lists = useGetList<CompanyList>("company_lists", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "created_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });
  const runs = useGetList<RuleRun>("rule_runs", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "requested_at", order: "DESC" },
    filter: { workspace_id: workspace?.id, status: "completed" },
  });

  const download = async (item: ExportJob) => {
    if (!item.storage_bucket || !item.storage_path) {
      notify("后端尚未写入导出文件位置。", { type: "warning" });
      return;
    }
    setDownloadingId(item.id);
    try {
      const { data, error } = await getSupabaseClient()
        .storage.from(item.storage_bucket)
        .createSignedUrl(item.storage_path, 60);
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      notify(`生成下载地址失败：${getErrorMessage(error)}`, { type: "error" });
    } finally {
      setDownloadingId(null);
    }
  };

  const apiBase = import.meta.env.VITE_SUPABASE_URL
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/workbench-api`
    : null;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="交付与接口"
        title="导出与 API"
        description="把审阅后的真实名单导出为 CSV、Excel、JSON 或 HTML；其他 AI 可通过租户隔离的 REST API / MCP 读取同一项目数据。"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <FileOutput />
            新建导出
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>导出任务</CardTitle>
            <CardDescription>
              下载链接临时签名，不把私有存储路径公开为永久链接。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataBoundary
              isPending={exportsQuery.isPending}
              error={exportsQuery.error}
              title="无法读取导出任务"
            >
              {(exportsQuery.data?.length ?? 0) === 0 ? (
                <EmptyState
                  title="还没有导出任务"
                  description="完成企业审阅后，可按名单批次或规则运行结果生成正式交付文件。"
                  action={
                    <Button
                      className="mt-5"
                      onClick={() => setCreateOpen(true)}
                    >
                      新建第一次导出
                    </Button>
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>格式</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>行数</TableHead>
                      <TableHead>提交时间</TableHead>
                      <TableHead>错误</TableHead>
                      <TableHead className="text-right">文件</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exportsQuery.data?.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Badge variant="outline" className="uppercase">
                            {item.export_format}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={item.status} />
                        </TableCell>
                        <TableCell>{formatNumber(item.row_count)}</TableCell>
                        <TableCell>
                          {formatDateTime(item.requested_at)}
                        </TableCell>
                        <TableCell className="max-w-48 truncate text-red-600">
                          {item.error_message ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => download(item)}
                            disabled={
                              item.status !== "completed" ||
                              !item.storage_path ||
                              downloadingId === item.id
                            }
                          >
                            {downloadingId === item.id ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Download />
                            )}
                            下载
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </DataBoundary>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Braces className="size-5" />
                受控领域 API
              </CardTitle>
              <CardDescription>
                使用登录用户令牌并受工作空间 RLS 约束。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {apiBase ? (
                <>
                  <EndpointRow label="API 基址" value={apiBase} />
                  <EndpointRow
                    label="OpenAPI 文档"
                    value={`${apiBase}/openapi.json`}
                  />
                  <EndpointRow
                    label="当前工作空间企业示例"
                    value={`${apiBase}/companies?workspaceId=${workspace!.id}`}
                  />
                </>
              ) : (
                <Alert variant="destructive">
                  <AlertTitle>API 地址未配置</AlertTitle>
                  <AlertDescription>
                    缺少 VITE_SUPABASE_URL，当前页面不会生成虚假的接口地址。
                  </AlertDescription>
                </Alert>
              )}
              <p className="text-xs leading-5 text-muted-foreground">
                调用时需携带 Authorization: Bearer
                &lt;用户或服务账号令牌&gt;。领域 API
                会再校验工作空间；不要把管理员令牌交给 Agent。
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PlugZap className="size-5" />
                AI / MCP 接入
              </CardTitle>
              <CardDescription>
                WorkBuddy 和其他 AI 调用受控任务接口，不依赖当前浏览器会话。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                推荐仅开放：查询批次、读取企业证据、执行已发布规则、创建导出。数据源凭证配置与任意
                SQL 不应暴露给 Agent。
              </p>
              {import.meta.env.VITE_SUPABASE_URL ? (
                <>
                  <EndpointRow
                    label="MCP 入口"
                    value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp`}
                  />
                  <EndpointRow
                    label="任务入口"
                    value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/workbench-jobs`}
                  />
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <CreateExportDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaceId={workspace!.id}
        lists={lists.data ?? []}
        runs={runs.data ?? []}
        resourceError={lists.error || runs.error}
        onSubmitted={() => void exportsQuery.refetch()}
      />
    </div>
  );
}

function EndpointRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-medium">{label}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={copy}
          aria-label={`${copied ? "已复制" : "复制"}${label}`}
        >
          {copied ? <Check /> : <Clipboard />}
          {copied ? "已复制" : "复制"}
        </Button>
      </div>
      <code className="block break-all text-[11px] text-muted-foreground">
        {value}
      </code>
    </div>
  );
}

function CreateExportDialog({
  open,
  onOpenChange,
  workspaceId,
  lists,
  runs,
  resourceError,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  lists: CompanyList[];
  runs: RuleRun[];
  resourceError: unknown;
  onSubmitted: () => void;
}) {
  const notify = useNotify();
  const [scope, setScope] = useState("list");
  const [companyListId, setCompanyListId] = useState("");
  const [ruleRunId, setRuleRunId] = useState("");
  const [format, setFormat] = useState("xlsx");
  const [selectedFields, setSelectedFields] = useState<string[]>([
    "companyName",
    "creditCode",
    "legalPerson",
    "registeredCapital.valueWan",
    "status.raw",
    "decision",
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<WorkbenchJobResponse | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const listNames = useMemo(
    () => new Map(lists.map((list) => [list.id, list.name])),
    [lists],
  );

  useEffect(() => {
    if (!open) {
      setReceipt(null);
      idempotencyKeyRef.current = null;
    }
  }, [open]);

  const resetSubmission = () => {
    setReceipt(null);
    idempotencyKeyRef.current = null;
  };

  const toggleField = (field: string, checked: boolean) => {
    setSelectedFields((current) =>
      checked
        ? [...new Set([...current, field])]
        : current.filter((item) => item !== field),
    );
    resetSubmission();
  };

  const submit = async () => {
    setIsSubmitting(true);
    const idempotencyKey =
      idempotencyKeyRef.current ?? createIdempotencyKey("export");
    idempotencyKeyRef.current = idempotencyKey;
    try {
      const job = await runWorkbenchAction(
        "start_export",
        workspaceId,
        {
          ...(scope === "list" ? { companyListId } : { ruleRunId }),
          format,
          selectedFields,
          filterDefinition: {},
        },
        idempotencyKey,
      );
      setReceipt(job);
      notify(`导出任务已提交（${job.status}）`, { type: "success" });
      onSubmitted();
    } catch (error) {
      notify(getErrorMessage(error), { type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>新建正式导出</DialogTitle>
          <DialogDescription>
            导出在后端生成，来源、规则结论和证据字段可一并交付。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          {resourceError ? (
            <Alert variant="destructive">
              <AlertTitle>无法读取导出范围</AlertTitle>
              <AlertDescription>
                {getErrorMessage(resourceError)}
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-3">
            <Label>导出范围</Label>
            <RadioGroup
              value={scope}
              onValueChange={(value) => {
                setScope(value);
                resetSubmission();
              }}
              className="grid gap-3 sm:grid-cols-2"
            >
              <label className="flex items-center gap-3 rounded-lg border p-3">
                <RadioGroupItem value="list" />
                企业名单批次
              </label>
              <label className="flex items-center gap-3 rounded-lg border p-3">
                <RadioGroupItem value="run" />
                已完成规则结果
              </label>
            </RadioGroup>
          </div>
          {scope === "list" ? (
            <div className="space-y-2">
              <Label>企业名单批次</Label>
              <Select
                value={companyListId}
                onValueChange={(value) => {
                  setCompanyListId(value);
                  resetSubmission();
                }}
              >
                <SelectTrigger className="w-full" aria-label="企业名单批次">
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
          ) : (
            <div className="space-y-2">
              <Label>规则执行结果</Label>
              <Select
                value={ruleRunId}
                onValueChange={(value) => {
                  setRuleRunId(value);
                  resetSubmission();
                }}
              >
                <SelectTrigger className="w-full" aria-label="规则执行结果">
                  <SelectValue placeholder="选择已完成任务" />
                </SelectTrigger>
                <SelectContent>
                  {runs.map((run) => (
                    <SelectItem key={run.id} value={run.id}>
                      {listNames.get(run.company_list_id ?? "") ?? "企业批次"} ·{" "}
                      {formatDateTime(run.completed_at)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>文件格式</Label>
            <Select
              value={format}
              onValueChange={(value) => {
                setFormat(value);
                resetSubmission();
              }}
            >
              <SelectTrigger className="w-full" aria-label="文件格式">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="xlsx">Excel（XLSX）</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
                <SelectItem value="html">可审阅 HTML</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            <Label>交付字段</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {exportFields.map((field) => (
                <label
                  key={field.value}
                  className="flex items-center gap-3 rounded-lg border p-3 text-sm"
                >
                  <Checkbox
                    checked={selectedFields.includes(field.value)}
                    onCheckedChange={(checked) =>
                      toggleField(field.value, checked === true)
                    }
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </div>
          {receipt ? (
            <Alert>
              <AlertTitle>导出任务：{receipt.status}</AlertTitle>
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
              (scope === "list" ? !companyListId : !ruleRunId) ||
              selectedFields.length === 0 ||
              isSubmitting ||
              Boolean(receipt)
            }
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin" />
            ) : (
              <FileOutput />
            )}
            提交导出
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
