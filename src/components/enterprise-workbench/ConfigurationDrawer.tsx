import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowSquareOut,
  CheckCircle,
  Copy,
  Database,
  FileArrowUp,
  GlobeHemisphereWest,
  PlugsConnected,
  SlidersHorizontal,
  SpinnerGap,
  Robot,
  WarningCircle,
} from "@phosphor-icons/react";
import { useGetList, useNotify } from "ra-core";
import { Link } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  IngestionJob,
  SourceConnection,
  WorkbenchJobResponse,
} from "./types";
import { getErrorMessage } from "./utils";
import { useWorkspace } from "./workspace";
import { createIdempotencyKey, runWorkbenchAction } from "./workbenchActions";

const sourceMeta: Record<
  string,
  { name: string; description: string; icon: typeof Database }
> = {
  huoke_assistant: {
    name: "获客助手",
    description: "按地区、行业、资质、资本和参保人数检索企业",
    icon: PlugsConnected,
  },
  qcc: {
    name: "企查查",
    description: "按企业全名或信用代码核验工商登记信息",
    icon: Database,
  },
  file_upload: {
    name: "文件导入",
    description: "导入 CSV、JSON 或 Excel 名单",
    icon: FileArrowUp,
  },
  web_search: {
    name: "Ego Lite 公开信息报告",
    description: "检索官网、招聘网站和公开新闻，生成证据化 HTML 报告",
    icon: GlobeHemisphereWest,
  },
};

function SourceState({ source }: { source?: SourceConnection }) {
  if (!source) return <Badge variant="outline">未初始化</Badge>;
  if (source.status === "ready") {
    return (
      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
        已可用
      </Badge>
    );
  }
  if (source.status === "degraded") {
    return (
      <Badge className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">
        待首次调用验证
      </Badge>
    );
  }
  return <Badge variant="outline">{source.status || "未配置"}</Badge>;
}

export function ConfigurationDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { workspace } = useWorkspace();
  const notify = useNotify();
  const sources = useGetList<SourceConnection>(
    "source_connections_safe",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "name", order: "ASC" },
      filter: { workspace_id: workspace?.id },
    },
    { enabled: open && Boolean(workspace?.id) },
  );
  const [testing, setTesting] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [receipts, setReceipts] = useState<
    Record<string, WorkbenchJobResponse>
  >({});
  const keys = useRef<Record<string, string>>({});
  const receiptJobIds = useMemo(
    () => new Set(Object.values(receipts).map((receipt) => receipt.jobId)),
    [receipts],
  );
  const testJobs = useGetList<IngestionJob>(
    "ingestion_jobs",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "requested_at", order: "DESC" },
      filter: { workspace_id: workspace?.id },
    },
    {
      enabled: open && receiptJobIds.size > 0,
      refetchInterval: (result) => {
        const tracked = (result.state.data?.data ?? []).filter((job) =>
          receiptJobIds.has(job.id),
        );
        return tracked.length < receiptJobIds.size ||
          tracked.some((job) => ["queued", "running"].includes(job.status))
          ? 900
          : false;
      },
    },
  );
  const sourceMap = useMemo(
    () =>
      new Map((sources.data ?? []).map((source) => [source.provider, source])),
    [sources.data],
  );
  const assistantConnectionUrl = import.meta.env.VITE_SUPABASE_URL
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp`
    : "";

  useEffect(() => {
    if (!testJobs.data?.length) return;
    let reachedTerminal = false;
    setReceipts((current) => {
      let changed = false;
      const next = { ...current };
      for (const [sourceId, receipt] of Object.entries(current)) {
        const job = testJobs.data.find((item) => item.id === receipt.jobId);
        if (!job) continue;
        const status = job.status === "completed" ? "succeeded" : job.status;
        if (
          ![
            "queued",
            "running",
            "succeeded",
            "partial",
            "failed",
            "cancelled",
          ].includes(status) ||
          status === receipt.status
        ) {
          continue;
        }
        changed = true;
        reachedTerminal ||= !["queued", "running"].includes(status);
        next[sourceId] = {
          ...receipt,
          status: status as WorkbenchJobResponse["status"],
        };
      }
      return changed ? next : current;
    });
    if (reachedTerminal) void sources.refetch();
  }, [sources, testJobs.data]);

  const test = async (source: SourceConnection) => {
    if (!workspace) return;
    setTesting(source.id);
    try {
      const key =
        keys.current[source.id] ?? createIdempotencyKey("test-connection");
      keys.current[source.id] = key;
      const receipt = await runWorkbenchAction(
        "test_connection",
        workspace.id,
        { connectionId: source.id },
        key,
      );
      delete keys.current[source.id];
      setReceipts((current) => ({ ...current, [source.id]: receipt }));
      notify("连接检查已提交，结果会写入系统状态。", { type: "info" });
      await sources.refetch();
    } catch (error) {
      notify(getErrorMessage(error), { type: "error" });
    } finally {
      setTesting(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[min(94vw,620px)] gap-0 overflow-y-auto border-l-black/5 bg-[#f5f5f7] p-0 sm:max-w-[620px]">
        <SheetHeader className="border-b bg-white px-7 py-6 pr-14">
          <SheetTitle className="text-xl tracking-[-0.02em]">配置</SheetTitle>
          <SheetDescription>
            日常操作无需进入后台；这里只处理数据源、规则和高级能力。
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="sources" className="p-5 sm:p-7">
          <TabsList className="grid h-11 w-full grid-cols-4 rounded-xl bg-black/[0.05] p-1">
            <TabsTrigger value="sources" className="rounded-lg">
              数据来源
            </TabsTrigger>
            <TabsTrigger value="rules" className="rounded-lg">
              整理规则
            </TabsTrigger>
            <TabsTrigger value="assistant" className="rounded-lg">
              智能助手
            </TabsTrigger>
            <TabsTrigger value="advanced" className="rounded-lg">
              高级
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sources" className="mt-5 space-y-3">
            {sources.error ? (
              <Alert variant="destructive">
                <WarningCircle />
                <AlertTitle>无法读取数据源</AlertTitle>
                <AlertDescription>
                  {getErrorMessage(sources.error)}
                </AlertDescription>
              </Alert>
            ) : null}
            {Object.entries(sourceMeta).map(([provider, meta]) => {
              const source = sourceMap.get(provider);
              const Icon = meta.icon;
              const receipt = source ? receipts[source.id] : undefined;
              return (
                <section
                  key={provider}
                  className="rounded-2xl border border-black/[0.06] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eef5ff] text-[#1268d9]">
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold">{meta.name}</h3>
                        <SourceState source={source} />
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {meta.description}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-black/[0.05] pt-3">
                    <span className="text-xs text-slate-500">
                      {receipt
                        ? `检查任务：${connectionTestStatusLabel(receipt.status)}`
                        : source?.last_verified_at
                          ? "已有验证记录"
                          : "尚无验证记录"}
                    </span>
                    {source ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        aria-label={`${provider === "web_search" ? "检查本机能力" : "测试连接"}：${meta.name}`}
                        onClick={() => test(source)}
                        disabled={testing === source.id}
                      >
                        {testing === source.id ? (
                          <SpinnerGap className="animate-spin" />
                        ) : (
                          <CheckCircle />
                        )}
                        {provider === "web_search"
                          ? "检查本机能力"
                          : "测试连接"}
                      </Button>
                    ) : null}
                  </div>
                </section>
              );
            })}
            <Button
              asChild
              variant="outline"
              className="h-11 w-full rounded-xl bg-white"
              onClick={() => onOpenChange(false)}
            >
              <Link to="/sources">
                打开完整数据源设置 <ArrowSquareOut />
              </Link>
            </Button>
          </TabsContent>

          <TabsContent value="rules" className="mt-5 space-y-4">
            <section className="rounded-2xl border border-black/[0.06] bg-white p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-[#f2f0ff] text-[#6548c7]">
                  <SlidersHorizontal className="size-5" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">名单整理规则</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    配置字段优先级、筛选、评分与风险门禁。
                  </p>
                </div>
              </div>
              <Separator className="my-4" />
              <p className="text-sm leading-6 text-slate-600">
                找企业页面负责供应商原生筛选；整理规则只处理已经入库的数据，不会把缺失信息推测为事实。
              </p>
              <Button
                asChild
                className="mt-4 rounded-full"
                onClick={() => onOpenChange(false)}
              >
                <Link to="/rules">
                  管理规则模板 <ArrowSquareOut />
                </Link>
              </Button>
            </section>
          </TabsContent>

          <TabsContent value="assistant" className="mt-5 space-y-4">
            <section className="rounded-2xl border border-black/[0.06] bg-white p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-[#eef5ff] text-[#1268d9]">
                  <Robot className="size-5" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">
                    连接 WorkBuddy 或其他智能助手
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    连接后，智能助手可以根据对话创建名单、核验企业并整理报告。
                  </p>
                </div>
              </div>
              <Separator className="my-4" />
              {assistantConnectionUrl ? (
                <>
                  <p className="text-sm leading-6 text-slate-600">
                    在智能助手的“添加连接”界面粘贴下方地址，再按浏览器提示允许访问。
                  </p>
                  <div className="mt-4 rounded-xl border bg-slate-50 p-3">
                    <p className="break-all text-xs leading-5 text-slate-600">
                      {assistantConnectionUrl}
                    </p>
                  </div>
                  <Button
                    className="mt-4 w-full rounded-full"
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        assistantConnectionUrl,
                      );
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1_500);
                    }}
                  >
                    {copied ? <CheckCircle /> : <Copy />}
                    {copied ? "已复制" : "复制连接地址"}
                  </Button>
                </>
              ) : (
                <Alert variant="destructive">
                  <WarningCircle />
                  <AlertTitle>暂无法生成连接地址</AlertTitle>
                  <AlertDescription>
                    请确认本机服务已完整启动后重试。
                  </AlertDescription>
                </Alert>
              )}
            </section>
          </TabsContent>

          <TabsContent value="advanced" className="mt-5 space-y-4">
            <Alert>
              <CheckCircle />
              <AlertTitle>调用保护已开启</AlertTitle>
              <AlertDescription>
                企查查、获客助手和 Ego Lite
                执行前都会展示调用次数或覆盖范围，不会静默批量消耗额度。
              </AlertDescription>
            </Alert>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["字段映射", "/mappings"],
                ["任务记录", "/runs"],
                ["冲突核验", "/conflicts"],
                ["导出与 API", "/exports"],
              ].map(([label, href]) => (
                <Button
                  key={href}
                  asChild
                  variant="outline"
                  className="h-11 justify-between rounded-xl bg-white"
                  onClick={() => onOpenChange(false)}
                >
                  <Link to={href}>
                    {label}
                    <ArrowSquareOut />
                  </Link>
                </Button>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function connectionTestStatusLabel(status: WorkbenchJobResponse["status"]) {
  return (
    {
      queued: "排队中",
      running: "检查中",
      succeeded: "已通过",
      partial: "部分通过",
      failed: "失败",
      cancelled: "已取消",
    } as const
  )[status];
}
