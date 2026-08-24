import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Globe2,
  KeyRound,
  Link2,
  Loader2,
  SearchCheck,
  ShieldCheck,
} from "lucide-react";
import { useGetList, useNotify } from "ra-core";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DataBoundary, PageHeader, StatusBadge } from "./components";
import type {
  IngestionJob,
  SourceConnection,
  WorkbenchJobResponse,
} from "./types";
import { formatDateTime, getErrorMessage } from "./utils";
import { useWorkspace } from "./workspace";
import {
  configureSourceConnection,
  createIdempotencyKey,
  runWorkbenchAction,
} from "./workbenchActions";

type ProviderDefinition = {
  provider: string;
  connectionKind: "api" | "mcp" | "cli" | "upload" | "web_search" | "other";
  aliases: string[];
  name: string;
  role: string;
  description: string;
  icon: typeof Database;
  credentialLabel?: string;
  credentialPlaceholder?: string;
  endpointLabel?: string;
  endpointPlaceholder?: string;
  configKey?: string;
};

const providerDefinitions: ProviderDefinition[] = [
  {
    provider: "huoke_assistant",
    connectionKind: "api",
    aliases: ["kc", "kingdee", "kingdee_credit", "huoke_assistant"],
    name: "获客助手",
    role: "名单检索与单企数据",
    description:
      "按地区、行业、资质、注册资本、参保人数等条件取得企业名单，并保留查询条件和原始响应。",
    icon: SearchCheck,
    credentialLabel: "凭证引用",
    credentialPlaceholder: "例如 env://KC_API_KEY",
    endpointLabel: "服务地址",
    endpointPlaceholder: "https://loan.kdbank.cn",
    configKey: "baseUrl",
  },
  {
    provider: "qcc",
    connectionKind: "cli",
    aliases: ["qcc", "qichacha_mcp"],
    name: "企查查",
    role: "工商登记核验（当前已验收能力）",
    description:
      "当前生产驱动为已验证的服务端 qcc-agent-cli，本期只开放工商登记核验。测试连接仅验证 CLI 版本，不发起企业查询，也不消耗查询额度。",
    icon: Database,
  },
  {
    provider: "file_upload",
    connectionKind: "upload",
    aliases: ["file", "csv", "xlsx", "json"],
    name: "用户文件",
    role: "基础名单来源",
    description:
      "从本地上传 CSV、JSON 或 XLSX。文件先进入租户隔离的存储桶，再由后端解析、映射和去重。",
    icon: FileSpreadsheet,
  },
  {
    provider: "web_search",
    connectionKind: "web_search",
    aliases: ["web", "search"],
    name: "Ego Lite 公开信息报告",
    role: "官网、招聘与公开新闻证据化汇总",
    description:
      "由本机 Ego Lite 为已入库企业按需生成 HTML 报告。不绕过登录、验证码或站点限制；公开网页不用来凭空创建企业。",
    icon: Globe2,
  },
];

function findConnection(
  definition: ProviderDefinition,
  connections: SourceConnection[],
) {
  return connections.find(
    (connection) =>
      connection.provider === definition.provider ||
      definition.aliases.includes(connection.provider),
  );
}

export function SourceConnectionsPage() {
  const { workspace } = useWorkspace();
  const notify = useNotify();
  const query = useGetList<SourceConnection>("source_connections_safe", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "name", order: "ASC" },
    filter: { workspace_id: workspace?.id },
  });
  const [editing, setEditing] = useState<{
    definition: ProviderDefinition;
    connection?: SourceConnection;
  } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testJobs, setTestJobs] = useState<
    Record<string, WorkbenchJobResponse>
  >({});
  const testIdempotencyKeys = useRef<Record<string, string>>({});
  const connectionTests = useGetList<IngestionJob>(
    "ingestion_jobs",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "requested_at", order: "DESC" },
      filter: {
        workspace_id: workspace?.id,
        job_kind: "connection_test",
      },
    },
    {
      enabled: Boolean(workspace?.id),
      refetchInterval: (result) => {
        const jobs = result.state.data?.data ?? [];
        return jobs.some(
          (job) => job.status === "queued" || job.status === "running",
        )
          ? 1_500
          : false;
      },
    },
  );

  const latestConnectionTests = useMemo(() => {
    const latest = new Map<string, IngestionJob>();
    for (const job of connectionTests.data ?? []) {
      if (job.source_connection_id && !latest.has(job.source_connection_id)) {
        latest.set(job.source_connection_id, job);
      }
    }
    return latest;
  }, [connectionTests.data]);

  const connectionTestState = useMemo(
    () =>
      (connectionTests.data ?? [])
        .map((job) => `${job.id}:${job.status}:${job.completed_at ?? ""}`)
        .join("|"),
    [connectionTests.data],
  );
  const refetchConnections = query.refetch;

  useEffect(() => {
    if (!connectionTestState) return;
    void refetchConnections();
  }, [connectionTestState, refetchConnections]);

  const unknownConnections = useMemo(
    () =>
      (query.data ?? []).filter(
        (connection) =>
          !providerDefinitions.some(
            (definition) =>
              definition.provider === connection.provider ||
              definition.aliases.includes(connection.provider),
          ),
      ),
    [query.data],
  );

  const testConnection = async (connection: SourceConnection) => {
    if (!workspace) return;
    setTestingId(connection.id);
    try {
      const idempotencyKey =
        testIdempotencyKeys.current[connection.id] ??
        createIdempotencyKey("test-connection");
      testIdempotencyKeys.current[connection.id] = idempotencyKey;
      const job = await runWorkbenchAction(
        "test_connection",
        workspace.id,
        { connectionId: connection.id },
        idempotencyKey,
      );
      delete testIdempotencyKeys.current[connection.id];
      setTestJobs((current) => ({ ...current, [connection.id]: job }));
      notify(`连接测试任务已提交（${connectionJobStatusLabel(job.status)}）`, {
        type: "info",
      });
      await connectionTests.refetch();
      await query.refetch();
    } catch (error) {
      notify(getErrorMessage(error), { type: "error" });
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="数据来源"
        title="连接真实数据源"
        description="连接状态只读取生产数据库与后端测试结果；填写配置不等于连接成功，页面不会用绿色状态或样例数据掩盖未部署的服务。"
      />

      <Alert className="border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30">
        <ShieldCheck />
        <AlertTitle>密钥不写入浏览器数据库</AlertTitle>
        <AlertDescription>
          API 数据源只保存服务端凭证 URI。获客助手使用
          env://KC_API_KEY；企查查由服务端 qcc-agent-cli
          驱动；公开信息报告使用本机 Ego Lite。浏览器不读取或保存任何 Key。
        </AlertDescription>
      </Alert>

      <DataBoundary
        isPending={query.isPending}
        error={query.error}
        title="无法读取数据源连接"
      >
        <div className="grid gap-5 md:grid-cols-2">
          {providerDefinitions.map((definition) => {
            const connection = findConnection(definition, query.data ?? []);
            const Icon = definition.icon;
            const persistedJob = connection
              ? latestConnectionTests.get(connection.id)
              : undefined;
            const receipt = connection ? testJobs[connection.id] : undefined;
            const job = persistedJob ?? receipt;
            const jobId = persistedJob?.id ?? receipt?.jobId;
            return (
              <Card key={definition.provider} className="shadow-none">
                <CardHeader>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <span className="grid size-11 place-items-center rounded-xl border bg-muted/30">
                      <Icon className="size-5" />
                    </span>
                    {connection ? (
                      <StatusBadge status={connection.status} />
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-muted-foreground"
                      >
                        未配置
                      </Badge>
                    )}
                  </div>
                  <CardTitle>{definition.name}</CardTitle>
                  <CardDescription>{definition.role}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm leading-6 text-muted-foreground">
                    {definition.description}
                  </p>
                  <dl className="grid gap-2 rounded-lg border bg-muted/20 p-3 text-xs">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">连接标识</dt>
                      <dd className="truncate font-mono">
                        {connection?.provider ?? definition.provider}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">最近测试</dt>
                      <dd>{formatDateTime(connection?.last_verified_at)}</dd>
                    </div>
                    {connection?.last_error_code ? (
                      <div className="border-t pt-2 text-red-600">
                        错误代码：{connection.last_error_code}
                      </div>
                    ) : null}
                  </dl>
                  {job ? (
                    <Alert>
                      <CheckCircle2 />
                      <AlertTitle>
                        连接检查：
                        {job.status === "completed" ||
                        job.status === "succeeded"
                          ? "已完成"
                          : job.status === "queued"
                            ? "排队中"
                            : job.status === "running"
                              ? "执行中"
                              : job.status === "failed"
                                ? "失败"
                                : job.status}
                      </AlertTitle>
                      <AlertDescription>
                        任务 ID：{jobId}。
                        {persistedJob?.status === "failed"
                          ? ` ${persistedJob.error_message ?? persistedJob.error_code ?? "后端未返回错误详情。"}`
                          : definition.provider === "web_search"
                            ? "本次只检查本机 Ego Lite 能否打开公开页面，不检索企业。"
                            : "只有数据库状态更新为“可用”或“待首次真实查询验证”后，才代表检查完成。"}
                      </AlertDescription>
                    </Alert>
                  ) : null}
                </CardContent>
                <CardFooter className="mt-auto gap-2 border-t">
                  <Button
                    variant="outline"
                    aria-label={`${connection ? "查看" : "开始配置"}${definition.name}`}
                    onClick={() => setEditing({ definition, connection })}
                  >
                    <KeyRound />
                    {connection ? "查看配置" : "开始配置"}
                  </Button>
                  <Button
                    aria-label={`${definition.provider === "web_search" ? "检查" : "测试"}${definition.name}${definition.provider === "web_search" ? "配置" : "连接"}`}
                    onClick={() => connection && testConnection(connection)}
                    disabled={!connection || testingId === connection.id}
                  >
                    {testingId === connection?.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Link2 />
                    )}
                    {definition.provider === "web_search"
                      ? "检查配置"
                      : "测试连接"}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        {unknownConnections.length > 0 ? (
          <Card className="mt-5 shadow-none">
            <CardHeader>
              <CardTitle>其他已登记连接</CardTitle>
              <CardDescription>
                这些连接来自生产数据库，但不属于当前四类标准适配器。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {unknownConnections.map((connection) => (
                <div
                  key={connection.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {connection.name || connection.provider}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {connection.provider}
                    </p>
                  </div>
                  <StatusBadge status={connection.status} />
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </DataBoundary>

      {editing ? (
        <ConnectionDialog
          open
          definition={editing.definition}
          connection={editing.connection}
          workspaceId={workspace!.id}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onSaved={async () => {
            setEditing(null);
            await query.refetch();
          }}
        />
      ) : null}
    </div>
  );
}

function connectionJobStatusLabel(status: WorkbenchJobResponse["status"]) {
  return (
    {
      queued: "排队中",
      running: "执行中",
      succeeded: "已完成",
      partial: "部分完成",
      failed: "失败",
      cancelled: "已取消",
    } as const
  )[status];
}

function ConnectionDialog({
  open,
  definition,
  connection,
  workspaceId,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  definition: ProviderDefinition;
  connection?: SourceConnection;
  workspaceId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
}) {
  const notify = useNotify();
  const [isPending, setIsPending] = useState(false);
  const [displayName, setDisplayName] = useState(
    connection?.name ?? definition.name,
  );
  const [useManagedCredential, setUseManagedCredential] = useState(
    connection?.has_secret_reference ?? false,
  );
  const isWebSearch = definition.provider === "web_search";
  const configKey = definition.configKey ?? "endpoint";
  const defaultEndpoint =
    definition.provider === "huoke_assistant" ? "https://loan.kdbank.cn" : "";
  const [endpoint, setEndpoint] = useState(
    typeof connection?.connection_config?.[configKey] === "string"
      ? String(connection.connection_config[configKey])
      : defaultEndpoint,
  );

  useEffect(() => {
    setDisplayName(connection?.name ?? definition.name);
    setUseManagedCredential(connection?.has_secret_reference ?? false);
    setEndpoint(
      typeof connection?.connection_config?.[configKey] === "string"
        ? String(connection.connection_config[configKey])
        : defaultEndpoint,
    );
  }, [configKey, connection, defaultEndpoint, definition]);

  const save = async () => {
    if (!connection) {
      notify("初始化连接不存在，请先重新初始化工作空间。", {
        type: "error",
      });
      return;
    }
    setIsPending(true);
    try {
      await configureSourceConnection({
        workspaceId,
        connectionId: connection.id,
        provider: definition.provider,
        name: displayName.trim() || definition.name,
        secretReference:
          definition.provider === "huoke_assistant" && useManagedCredential
            ? "env://KC_API_KEY"
            : null,
        connectionConfig:
          definition.provider === "huoke_assistant"
            ? { baseUrl: endpoint.trim() || defaultEndpoint }
            : {},
      });
      notify("配置已保存；连接是否可用仍需后端测试确认。", {
        type: "success",
      });
      await onSaved();
    } catch (error) {
      notify(getErrorMessage(error), { type: "error" });
    } finally {
      setIsPending(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>配置{definition.name}</DialogTitle>
          <DialogDescription>
            此处只登记非敏感配置和服务端凭证引用。保存后请单独执行连接测试。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="connection-name">显示名称</Label>
            <Input
              id="connection-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider-code">适配器标识</Label>
            <Input
              id="provider-code"
              value={connection?.provider ?? definition.provider}
              readOnly
              className="font-mono"
            />
          </div>
          {definition.credentialLabel ? (
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-1">
                <Label htmlFor="managed-credential">
                  {isWebSearch ? "使用服务器腾讯云 WSA 凭证" : "使用服务器凭证"}
                </Label>
                <p className="text-xs leading-5 text-muted-foreground">
                  {isWebSearch
                    ? "Ego Lite 由本机管理，不需要在浏览器填写凭证。"
                    : "只引用服务器变量 KC_API_KEY；浏览器不读取或保存 Key。"}
                </p>
              </div>
              <Switch
                id="managed-credential"
                checked={useManagedCredential}
                onCheckedChange={setUseManagedCredential}
              />
            </div>
          ) : null}
          {definition.provider === "qcc" ? (
            <Alert>
              <ShieldCheck />
              <AlertTitle>CLI 由服务器管理</AlertTitle>
              <AlertDescription>
                浏览器不能修改可执行命令；部署端通过 QCC_CLI_PATH 或默认 qcc
                命令提供服务。
              </AlertDescription>
            </Alert>
          ) : null}
          {definition.endpointLabel ? (
            <div className="space-y-2">
              <Label htmlFor="service-endpoint">
                {definition.endpointLabel}
              </Label>
              <Input
                id="service-endpoint"
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                placeholder={definition.endpointPlaceholder}
                readOnly={false}
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={save} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : null}
            保存配置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
