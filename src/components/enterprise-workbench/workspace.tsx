import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useGetList, useNotify } from "ra-core";
import { Building2, Loader2, ShieldCheck, WandSparkles } from "lucide-react";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Workspace } from "./types";
import { getErrorMessage } from "./utils";

const WORKSPACE_STORAGE_KEY = "enterprise-workbench:workspace-id";

type WorkspaceContextValue = {
  workspace: Workspace | null;
  workspaces: Workspace[];
  setWorkspaceId: (workspaceId: string) => void;
  refreshWorkspaces: () => Promise<void>;
  isPending: boolean;
  error: unknown;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { data, isPending, error, refetch } = useGetList<Workspace>(
    "workspaces",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "name", order: "ASC" },
    },
  );
  const workspaces = useMemo(() => data ?? [], [data]);
  const [workspaceId, setWorkspaceIdState] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(WORKSPACE_STORAGE_KEY),
  );

  useEffect(() => {
    if (!data) return;
    if (data.length === 1) {
      setWorkspaceIdState(data[0].id);
      return;
    }
    if (
      workspaceId &&
      !data.some((workspace) => workspace.id === workspaceId)
    ) {
      setWorkspaceIdState(null);
      window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    }
  }, [data, workspaceId]);

  const setWorkspaceId = (nextWorkspaceId: string) => {
    setWorkspaceIdState(nextWorkspaceId);
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, nextWorkspaceId);
  };
  const refreshWorkspaces = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const workspace = workspaces.find((item) => item.id === workspaceId) ?? null;

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        workspaces,
        setWorkspaceId,
        refreshWorkspaces,
        isPending,
        error,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace 必须在 WorkspaceProvider 中使用");
  }
  return value;
}

export function WorkspaceSelector({ compact = false }: { compact?: boolean }) {
  const { workspace, workspaces, setWorkspaceId, isPending } = useWorkspace();

  if (isPending) {
    return <div className="h-9 w-40 animate-pulse rounded-md bg-muted" />;
  }

  if (workspaces.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">无可用工作空间</span>
    );
  }

  return (
    <div className={compact ? "w-full" : "min-w-48"}>
      {!compact ? <Label className="sr-only">当前工作空间</Label> : null}
      <Select value={workspace?.id ?? ""} onValueChange={setWorkspaceId}>
        <SelectTrigger
          className="w-full bg-background"
          aria-label="当前工作空间"
        >
          <Building2 className="size-4" />
          <SelectValue placeholder="选择工作空间" />
        </SelectTrigger>
        <SelectContent>
          {workspaces.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function WorkspaceGate({ children }: { children: ReactNode }) {
  const { workspace, workspaces, isPending, error } = useWorkspace();

  if (isPending) {
    return (
      <div className="grid min-h-[55vh] place-items-center">
        <p className="text-sm text-muted-foreground">正在读取工作空间…</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <ShieldCheck />
        <AlertTitle>无法读取工作空间</AlertTitle>
        <AlertDescription>
          {getErrorMessage(error)}。请检查 Supabase
          是否已启动、数据表是否已部署，以及当前账号是否有有效成员权限。
        </AlertDescription>
      </Alert>
    );
  }

  if (workspaces.length === 0) {
    return <WorkspaceInitializer />;
  }

  if (!workspace) {
    return (
      <Card className="mx-auto mt-16 max-w-xl">
        <CardHeader>
          <CardTitle>选择本次操作的工作空间</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            你的账号属于多个工作空间。为避免把名单或凭证写错租户，请先明确选择。
          </p>
          <WorkspaceSelector />
        </CardContent>
      </Card>
    );
  }

  return children;
}

function WorkspaceInitializer() {
  const notify = useNotify();
  const { setWorkspaceId, refreshWorkspaces } = useWorkspace();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [fallbackSuffix] = useState(() =>
    crypto.randomUUID().replaceAll("-", "").slice(0, 8),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateName = (nextName: string) => {
    setName(nextName);
    if (!slugEdited) setSlug(toWorkspaceSlug(nextName, fallbackSuffix));
  };

  const submit = async () => {
    if (!name.trim()) {
      notify("请填写工作空间名称。", { type: "warning" });
      return;
    }
    const normalizedSlug = slug.trim() || toWorkspaceSlug(name, fallbackSuffix);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) {
      notify("Slug 只能包含小写字母、数字和中划线。", {
        type: "warning",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await getSupabaseClient().rpc(
        "initialize_workbench_workspace",
        {
          p_workspace_name: name.trim(),
          p_workspace_slug: normalizedSlug,
        },
      );
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || typeof row !== "object" || !("workspace_id" in row)) {
        throw new Error("初始化服务没有返回工作空间 ID");
      }
      const workspaceId = String(row.workspace_id);
      await refreshWorkspaces();
      setWorkspaceId(workspaceId);
      notify("工作空间已初始化。企查查与获客助手仍需测试验证。", {
        type: "success",
      });
    } catch (initializationError) {
      notify(`初始化失败：${getErrorMessage(initializationError)}`, {
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="mx-auto mt-10 max-w-2xl rounded-[28px] border-black/[0.06] bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <CardHeader className="px-6 pt-7 sm:px-8 sm:pt-8">
        <div className="mb-3 grid size-11 place-items-center rounded-2xl bg-[#e8f2ff] text-[#0071e3]">
          <WandSparkles className="size-5" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0071e3]">
          工作空间设置
        </p>
        <CardTitle className="text-[28px] tracking-[-0.03em]">
          初始化企业名单工作台
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 px-6 pb-7 sm:px-8 sm:pb-8">
        <Alert>
          <ShieldCheck />
          <AlertTitle>一次初始化，后续可全程使用 Web GUI</AlertTitle>
          <AlertDescription>
            系统将创建租户工作空间、企查查 CLI、获客助手
            API、文件上传连接、两份只读供应商映射说明和一份可编辑空规则模板。不会写入
            API Key，也不会将待验证数据源标成已接通。
          </AlertDescription>
        </Alert>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="workspace-name">工作空间名称</Label>
            <Input
              id="workspace-name"
              value={name}
              onChange={(event) => updateName(event.target.value)}
              placeholder="例如：华东企业名单项目"
              autoFocus
              className="h-12 rounded-xl"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="workspace-slug">Slug</Label>
            <Input
              id="workspace-slug"
              value={slug}
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(event.target.value.toLowerCase());
              }}
              placeholder={`workspace-${fallbackSuffix}`}
              className="h-12 rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              用于稳定识别项目，已自动生成，也可在创建前修改。
            </p>
          </div>
        </div>
        <Button
          onClick={submit}
          disabled={isSubmitting || !name.trim()}
          className="h-12 rounded-full bg-[#0071e3] px-6 text-[15px] hover:bg-[#0077ed]"
        >
          {isSubmitting ? (
            <Loader2 className="animate-spin" />
          ) : (
            <WandSparkles />
          )}
          创建并初始化
        </Button>
      </CardContent>
    </Card>
  );
}

function toWorkspaceSlug(name: string, fallbackSuffix: string) {
  const normalized = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return normalized || `workspace-${fallbackSuffix}`;
}
