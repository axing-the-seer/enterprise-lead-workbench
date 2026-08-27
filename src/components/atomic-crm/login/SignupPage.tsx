import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { useDataProvider, useNotify, useTranslate } from "ra-core";
import { useForm, type SubmitHandler } from "react-hook-form";
import { Navigate, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Layout } from "@/components/supabase/layout";

import type { CrmDataProvider } from "../providers/types";
import type { SignUpData } from "../types";
import { LoginSkeleton } from "./LoginSkeleton";
import { ConfirmationRequired } from "./ConfirmationRequired";
import { localSingleUserMode } from "./authConfig";
import { getSupabaseClient } from "../providers/supabase/supabase";

export const SignupPage = () => {
  const queryClient = useQueryClient();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const navigate = useNavigate();
  const translate = useTranslate();
  const { data: isInitialized, isPending } = useQuery({
    queryKey: ["init"],
    queryFn: async () => {
      return dataProvider.isInitialized();
    },
  });
  const {
    data: bootstrapStatus,
    error: bootstrapStatusError,
    isPending: isBootstrapStatusPending,
  } = useQuery({
    queryKey: ["bootstrap-admin", "status"],
    queryFn: () => dataProvider.getBootstrapStatus(),
    enabled: isInitialized === false,
    refetchInterval: (query) =>
      query.state.data?.claimInProgress ? 3000 : false,
  });

  const { isPending: isSignUpPending, mutate } = useMutation({
    mutationKey: ["signup"],
    mutationFn: async (data: SignUpData) => {
      return dataProvider.signUp(data);
    },
    onSuccess: async (data) => {
      try {
        await signInCreatedAdministrator(data.email, data.password);

        if (localSingleUserMode) {
          const { error } = await getSupabaseClient().rpc(
            "initialize_workbench_workspace",
            {
              p_workspace_name: "我的企业名单工作台",
              p_workspace_slug: null,
            },
          );
          if (error) throw error;
        }

        notify(
          localSingleUserMode
            ? "本机工作台已初始化。"
            : "首次管理员已创建，请继续初始化工作空间。",
          { type: "success" },
        );
        // FIXME: We should probably provide a hook for that in the ra-core package
        queryClient.invalidateQueries({
          queryKey: ["auth", "canAccess"],
        });
        queryClient.invalidateQueries({ queryKey: ["init"] });
        queryClient.invalidateQueries({
          queryKey: ["bootstrap-admin", "status"],
        });
        navigate("/", { replace: true });
      } catch (err) {
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          err.code === "email_not_confirmed"
        ) {
          navigate(ConfirmationRequired.path);
        } else {
          notify(
            localSingleUserMode
              ? "本机工作台初始化失败，请重试。"
              : "crm.auth.sign_in_failed",
            {
              type: "error",
              messageArgs: { _: "Failed to log in." },
            },
          );
          navigate("/login");
        }
      }
    },
    onError: (error) => {
      notify(error.message);
    },
  });

  const notify = useNotify();

  const {
    register,
    handleSubmit,
    watch,
    formState: { isValid },
  } = useForm<SignUpData>({
    mode: "onChange",
  });

  if (isPending || (isInitialized === false && isBootstrapStatusPending)) {
    return <LoginSkeleton />;
  }

  // For the moment, we only allow one user to sign up. Other users must be created by the administrator.
  if (isInitialized || bootstrapStatus?.initialized) {
    return <Navigate to="/login" />;
  }

  const canCreateAdministrator = bootstrapStatus?.available === true;
  const password = watch("password");

  const onSubmit: SubmitHandler<SignUpData> = async (data) => {
    mutate(data);
  };

  return (
    <Layout>
      <div>
        <span className="mb-5 grid size-11 place-items-center rounded-2xl bg-[#e8f2ff] text-[#0071e3]">
          <ShieldCheck className="size-5" />
        </span>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0071e3]">
          {localSingleUserMode ? "首次使用" : "仅首次部署"}
        </p>
        <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.035em]">
          {localSingleUserMode ? "设置本机访问密码" : "初始化企业名单工作台"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#6e6e73]">
          {localSingleUserMode
            ? "设置一次，之后只需输入这一个密码即可进入。账号和工作空间由本机自动创建。"
            : "创建唯一的首位管理员账号。登录后继续创建工作空间并验证数据源。"}
        </p>
      </div>
      {bootstrapStatusError ? (
        <Alert variant="destructive">
          <AlertTitle>无法连接初始化服务</AlertTitle>
          <AlertDescription>
            请确认数据库迁移与 bootstrap-admin 服务已经启动。
          </AlertDescription>
        </Alert>
      ) : bootstrapStatus &&
        !bootstrapStatus.configured &&
        !localSingleUserMode ? (
        <Alert variant="destructive">
          <AlertTitle>部署方尚未配置初始化码</AlertTitle>
          <AlertDescription>
            请先在服务端设置
            WORKBENCH_BOOTSTRAP_TOKEN，再刷新本页。初始化码不会写入浏览器或数据库。
          </AlertDescription>
        </Alert>
      ) : bootstrapStatus?.claimInProgress ? (
        <Alert>
          <AlertTitle>正在处理另一个初始化请求</AlertTitle>
          <AlertDescription>
            页面会自动检查结果。若原请求失败，五分钟后可重新提交。
          </AlertDescription>
        </Alert>
      ) : null}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {localSingleUserMode ? null : (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="bootstrap_token">首次管理员初始化码</Label>
              <Input
                {...register("bootstrap_token", {
                  required: true,
                  minLength: 24,
                })}
                id="bootstrap_token"
                type="password"
                autoComplete="one-time-code"
                required
                className="h-12 rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                由部署方提供，仅首次初始化有效。
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="first_name">名字</Label>
              <Input
                {...register("first_name", { required: true })}
                id="first_name"
                type="text"
                required
                className="h-12 rounded-xl"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="last_name">姓氏</Label>
              <Input
                {...register("last_name", { required: true })}
                id="last_name"
                type="text"
                required
                className="h-12 rounded-xl"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{translate("ra.auth.email")}</Label>
              <Input
                {...register("email", { required: true })}
                id="email"
                type="email"
                required
                className="h-12 rounded-xl"
              />
            </div>
          </>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">
            {localSingleUserMode ? "访问密码" : translate("ra.auth.password")}
          </Label>
          <Input
            {...register("password", {
              required: true,
              minLength: 12,
              maxLength: 128,
            })}
            id="password"
            type="password"
            autoComplete="new-password"
            required
            className="h-12 rounded-xl"
          />
          <p className="text-xs text-muted-foreground">
            至少 12 位，最多 128 位。
          </p>
        </div>
        {localSingleUserMode ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="password_confirmation">再次输入密码</Label>
            <Input
              {...register("password_confirmation", {
                required: true,
                validate: (value) => value === password || "两次密码不一致",
              })}
              id="password_confirmation"
              type="password"
              autoComplete="new-password"
              required
              className="h-12 rounded-xl"
            />
          </div>
        ) : null}
        <div className="flex flex-col gap-4 justify-between items-center mt-8">
          <Button
            type="submit"
            disabled={!isValid || isSignUpPending || !canCreateAdministrator}
            className="h-12 w-full rounded-full bg-[#0071e3] text-[15px] hover:bg-[#0077ed]"
          >
            {isSignUpPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                {localSingleUserMode ? "正在初始化…" : "正在创建…"}
              </>
            ) : localSingleUserMode ? (
              "设置密码并进入"
            ) : (
              "创建首位管理员"
            )}
          </Button>
        </div>
      </form>
      <p className="border-t border-black/[0.06] pt-5 text-xs leading-5 text-[#86868b]">
        {localSingleUserMode
          ? "密码由本机身份服务验证；供应商密钥与企业数据仍按安全边界隔离。"
          : "初始化码只在服务端校验，成功创建首位管理员后永久失效。"}
      </p>
    </Layout>
  );
};

SignupPage.path = "/sign-up";

async function signInCreatedAdministrator(email: string, password: string) {
  const retryDelays = [0, 250, 750, 1_500];
  let lastError: unknown;

  for (const delay of retryDelays) {
    if (delay > 0) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
    }
    const { error } = await getSupabaseClient().auth.signInWithPassword({
      email,
      password,
    });
    if (!error) return;
    lastError = error;
  }

  throw lastError ?? new Error("本机身份会话创建失败");
}
