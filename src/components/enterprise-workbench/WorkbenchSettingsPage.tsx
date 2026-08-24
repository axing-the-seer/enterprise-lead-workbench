import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Circle,
  Database,
  ExternalLink,
  KeyRound,
  Loader2,
  Save,
  ServerCog,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useGetList, useGetIdentity, useNotify } from "ra-core";
import { Link } from "react-router";
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
import { DataBoundary, PageHeader, StatusBadge } from "./components";
import type {
  AuditLog,
  FieldMappingSet,
  RuleSet,
  SourceConnection,
  WorkspaceMember,
} from "./types";
import { formatDateTime, getErrorMessage } from "./utils";
import { useWorkspace, WorkspaceSelector } from "./workspace";
import { configureProviderPriorities } from "./workbenchActions";

const priorityProviders = [
  {
    id: "qichacha",
    label: "企查查",
    description: "当前开放的工商登记核验结果",
  },
  {
    id: "kingdee-credit-kc-assistant",
    label: "获客助手",
    description: "企业名单检索与已订阅的单企工商司法结果",
  },
  {
    id: "csv-upload",
    label: "用户上传文件",
    description: "客户自己的 CSV、XLSX 或 JSON 数据",
  },
] as const;

type PriorityProviderId = (typeof priorityProviders)[number]["id"];

function orderedProviderIds(
  priorities?: Record<string, number>,
): PriorityProviderId[] {
  return [...priorityProviders]
    .sort((left, right) => {
      const leftPriority = priorities?.[left.id];
      const rightPriority = priorities?.[right.id];
      if (
        typeof leftPriority === "number" &&
        typeof rightPriority === "number"
      ) {
        return rightPriority - leftPriority;
      }
      return 0;
    })
    .map((provider) => provider.id);
}

function ProviderPriorityCard({ canEdit }: { canEdit: boolean }) {
  const { workspace, refreshWorkspaces } = useWorkspace();
  const notify = useNotify();
  const configuredPriorities = workspace?.settings?.providerPriorities;
  const configured = priorityProviders.every(
    (provider) => typeof configuredPriorities?.[provider.id] === "number",
  );
  const initialOrder = useMemo(
    () => orderedProviderIds(configuredPriorities),
    [configuredPriorities],
  );
  const [order, setOrder] = useState<PriorityProviderId[]>(initialOrder);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => setOrder(initialOrder), [initialOrder]);

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    setOrder((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = async () => {
    if (!workspace) return;
    setIsSaving(true);
    try {
      await configureProviderPriorities(
        workspace.id,
        Object.fromEntries(
          order.map((providerId, index) => [
            providerId,
            (order.length - index) * 100,
          ]),
        ),
      );
      await refreshWorkspaces();
      notify("数据源优先级已保存；后续规则运行会按新顺序处理字段冲突。", {
        type: "success",
      });
    } catch (error) {
      notify(getErrorMessage(error), { type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="shadow-none">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>数据源优先级</CardTitle>
            <CardDescription className="mt-2">
              只有同一企业的同一字段出现不同值时才使用此顺序；原始值、来源和冲突记录不会被删除。
            </CardDescription>
          </div>
          <Badge variant={configured ? "default" : "outline"}>
            {configured ? "已配置" : "默认顺序，尚未保存"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {order.map((providerId, index) => {
            const provider = priorityProviders.find(
              (item) => item.id === providerId,
            )!;
            return (
              <div
                key={provider.id}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <div className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{provider.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {provider.description}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`上移${provider.label}`}
                    disabled={!canEdit || index === 0 || isSaving}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`下移${provider.label}`}
                    disabled={
                      !canEdit || index === order.length - 1 || isSaving
                    }
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Web 搜索只做链接补证，不参与工商事实的优先级排序。
          </p>
          <Button disabled={!canEdit || isSaving || !workspace} onClick={save}>
            {isSaving ? <Loader2 className="animate-spin" /> : <Save />}
            保存优先级
          </Button>
        </div>
        {!canEdit ? (
          <Alert>
            <ShieldCheck />
            <AlertTitle>仅管理员可修改</AlertTitle>
            <AlertDescription>
              编辑和查看角色可以看到当前顺序，但不能改变合并口径。
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function WorkbenchSettingsPage() {
  const { workspace } = useWorkspace();
  const { identity } = useGetIdentity();
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const members = useGetList<WorkspaceMember>("workspace_members", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "created_at", order: "ASC" },
    filter: { workspace_id: workspace?.id },
  });
  const sources = useGetList<SourceConnection>("source_connections_safe", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "name", order: "ASC" },
    filter: { workspace_id: workspace?.id },
  });
  const mappings = useGetList<FieldMappingSet>("field_mapping_sets", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "updated_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });
  const rules = useGetList<RuleSet>("rule_sets", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "updated_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });
  const logs = useGetList<AuditLog>("audit_logs", {
    pagination: { page: 1, perPage: 20 },
    sort: { field: "occurred_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });

  useEffect(() => {
    let active = true;
    void getSupabaseClient()
      .auth.getUser()
      .then(({ data }) => {
        if (active) setAuthUserId(data.user?.id ?? null);
      });
    return () => {
      active = false;
    };
  }, [identity?.id]);

  const currentMember = members.data?.find(
    (member) => String(member.user_id) === authUserId,
  );
  const fileUpload = sources.data?.find(
    (source) => source.provider === "file_upload",
  );
  const qccSource = sources.data?.find((source) => source.provider === "qcc");
  const huokeSource = sources.data?.find(
    (source) => source.provider === "huoke_assistant",
  );
  const remoteSourceReady = [qccSource, huokeSource].some(
    (source) => source && ["ready", "degraded"].includes(source.status),
  );
  const supplierMappingsReady = ["qcc", "huoke_assistant"].every((provider) =>
    mappings.data?.some((mapping) => mapping.provider === provider),
  );
  const checklist = [
    { label: "工作空间与租户隔离", ready: Boolean(workspace) },
    { label: "当前账号成员权限", ready: Boolean(currentMember) },
    {
      label: "文件上传数据源可用",
      ready: fileUpload?.status === "ready",
    },
    { label: "企查查 CLI 数据源已登记", ready: Boolean(qccSource) },
    { label: "获客助手 API 数据源已登记", ready: Boolean(huokeSource) },
    { label: "至少一个远程数据源已授权验证", ready: remoteSourceReady },
    { label: "供应商只读映射已初始化", ready: supplierMappingsReady },
    { label: "可编辑规则模板已初始化", ready: (rules.total ?? 0) > 0 },
    {
      label: "生产 API 地址",
      ready: Boolean(import.meta.env.VITE_SUPABASE_URL),
    },
  ];
  const initializationError =
    members.error || sources.error || mappings.error || rules.error;
  const canEditPriority =
    currentMember?.status === "active" &&
    (currentMember.role === "owner" || currentMember.role === "admin");

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="系统设置"
        title="系统设置"
        description="检查生产初始化、成员权限、连接状态与审计日志。所有写入都要求显式工作空间 ID，防止数据落入错误租户。"
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ServerCog className="size-5" />
              初始化检查
            </CardTitle>
            <CardDescription>
              不依赖 Agent；管理员完成一次初始化后，普通用户即可在 GUI
              完成全流程。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {initializationError ? (
              <Alert variant="destructive">
                <AlertTitle>初始化资源读取失败</AlertTitle>
                <AlertDescription>
                  {getErrorMessage(initializationError)}
                  。未读取到的项目不会被标成已完成。
                </AlertDescription>
              </Alert>
            ) : null}
            {checklist.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <span className="flex items-center gap-3 text-sm">
                  {item.ready ? (
                    <CheckCircle2 className="size-4 text-emerald-600" />
                  ) : (
                    <Circle className="size-4 text-muted-foreground" />
                  )}
                  {item.label}
                </span>
                <Badge variant={item.ready ? "default" : "outline"}>
                  {item.ready ? "已完成" : "待配置"}
                </Badge>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild>
                <Link to="/sources">
                  <KeyRound />
                  配置数据源
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/mappings">配置字段映射</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5" />
              工作空间与权限
            </CardTitle>
            <CardDescription>
              多工作空间账号必须显式选择，不从 JWT 或列表顺序猜测租户。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                当前工作空间
              </p>
              <WorkspaceSelector />
            </div>
            <dl className="grid gap-3 rounded-xl border bg-muted/20 p-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">工作空间 ID</dt>
                <dd className="max-w-[65%] truncate font-mono text-xs">
                  {workspace?.id}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">账号</dt>
                <dd className="max-w-[65%] truncate">
                  {identity?.email ?? identity?.id}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">成员角色</dt>
                <dd>{currentMember?.role ?? "未返回"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">成员状态</dt>
                <dd>
                  <StatusBadge status={currentMember?.status} />
                </dd>
              </div>
            </dl>
            <Alert>
              <Users />
              <AlertTitle>权限由数据库强制执行</AlertTitle>
              <AlertDescription>
                前端隐藏按钮只是体验优化；真正的租户隔离与角色权限由 Supabase
                RLS 和后端任务服务验证。
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-5" />
              数据源状态
            </CardTitle>
            <CardDescription>
              “草稿”或“已配置”不代表已经验证成功。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataBoundary
              isPending={sources.isPending}
              error={sources.error}
              title="无法读取数据源"
            >
              <div className="space-y-2">
                {sources.data?.map((source) => (
                  <div
                    key={source.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{source.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {source.provider} · 最近验证{" "}
                        {formatDateTime(source.last_verified_at)}
                      </p>
                    </div>
                    <StatusBadge status={source.status} />
                  </div>
                ))}
                {(sources.data?.length ?? 0) === 0 ? (
                  <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    尚未登记数据源
                  </p>
                ) : null}
              </div>
            </DataBoundary>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>部署信息</CardTitle>
            <CardDescription>用于管理员核对实际运行环境。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Supabase 地址</p>
              <p className="mt-1 break-all font-mono text-xs">
                {import.meta.env.VITE_SUPABASE_URL ?? "未配置"}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">任务服务</p>
              <p className="mt-1 break-all font-mono text-xs">
                {import.meta.env.VITE_SUPABASE_URL
                  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/workbench-jobs`
                  : "未配置"}
              </p>
            </div>
            <Alert>
              <ExternalLink />
              <AlertTitle>开源底座声明</AlertTitle>
              <AlertDescription>
                本项目基于 MIT 许可的 Atomic CRM
                改造，并保留第三方许可证清单；企业名单、规则和数据源模块为独立生产能力。
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>

      <ProviderPriorityCard canEdit={canEditPriority} />

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>最近审计记录</CardTitle>
          <CardDescription>
            数据源测试、规则执行、人工审阅与导出应留下可追溯记录。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataBoundary
            isPending={logs.isPending}
            error={logs.error}
            title="无法读取审计日志"
          >
            <div className="divide-y rounded-lg border">
              {logs.data?.map((log) => (
                <div
                  key={log.id}
                  className="grid gap-2 p-3 text-sm sm:grid-cols-[1fr_1fr_180px]"
                >
                  <div>
                    <p className="font-medium">{log.action}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {log.actor_label ?? log.actor_type}
                    </p>
                  </div>
                  <div className="text-muted-foreground">
                    {log.entity_type}
                    {log.entity_id ? ` · ${log.entity_id}` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground sm:text-right">
                    {formatDateTime(log.occurred_at)}
                  </div>
                </div>
              ))}
              {(logs.data?.length ?? 0) === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  暂无审计记录
                </p>
              ) : null}
            </div>
          </DataBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
