import { useEffect, useRef, useState } from "react";
import { Form, required, useLogin, useNotify, useTranslate } from "ra-core";
import type { SubmitHandler, FieldValues } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/admin/text-input";
import { ShieldCheck } from "lucide-react";
import { Layout } from "@/components/supabase/layout";
import { SSOAuthButton } from "./SSOAuthButton";
import {
  disableEmailPasswordAuthentication,
  googleWorkplaceDomain,
  localSingleUserEmail,
  localSingleUserMode,
} from "./authConfig";

/**
 * Login page displayed when authentication is enabled and the user is not authenticated.
 *
 * Automatically shown when an unauthenticated user tries to access a protected route.
 * Handles login via authProvider.login() and displays error notifications on failure.
 *
 * @see {@link https://marmelab.com/shadcn-admin-kit/docs/loginpage LoginPage documentation}
 * @see {@link https://marmelab.com/shadcn-admin-kit/docs/security Security documentation}
 */
export const LoginPage = (props: { redirectTo?: string }) => {
  const { redirectTo } = props;
  const [loading, setLoading] = useState(false);
  const hasDisplayedRecoveryNotification = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();
  const login = useLogin();
  const notify = useNotify();
  const translate = useTranslate();

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const shouldNotify = searchParams.get("passwordRecoveryEmailSent") === "1";

    if (!shouldNotify || hasDisplayedRecoveryNotification.current) {
      return;
    }

    hasDisplayedRecoveryNotification.current = true;
    notify("crm.auth.recovery_email_sent", {
      type: "success",
      messageArgs: {
        _: "If you're a registered user, you should receive a password recovery email shortly.",
      },
    });

    searchParams.delete("passwordRecoveryEmailSent");
    const nextSearch = searchParams.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : "",
      },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate, notify]);

  const handleSubmit: SubmitHandler<FieldValues> = (values) => {
    setLoading(true);
    login(
      localSingleUserMode
        ? { email: localSingleUserEmail, password: values.password }
        : values,
      redirectTo,
    )
      .then(() => {
        setLoading(false);
      })
      .catch((error) => {
        setLoading(false);
        notify(
          typeof error === "string"
            ? error
            : typeof error === "undefined" || !error.message
              ? "ra.auth.sign_in_error"
              : error.message,
          {
            type: "error",
            messageArgs: {
              _:
                typeof error === "string"
                  ? error
                  : error && error.message
                    ? error.message
                    : undefined,
            },
          },
        );
      });
  };

  return (
    <Layout>
      <div>
        <span className="mb-5 grid size-11 place-items-center rounded-2xl bg-[#e8f2ff] text-[#0071e3]">
          <ShieldCheck className="size-5" />
        </span>
        <h1 className="text-[30px] font-semibold tracking-[-0.035em]">
          {localSingleUserMode ? "解锁企业名单工作台" : "欢迎回来"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#6e6e73]">
          {localSingleUserMode
            ? "输入本机访问密码，继续管理企业名单和调研报告。"
            : "登录后继续管理企业名单、来源核验和公开信息报告。"}
        </p>
      </div>
      {disableEmailPasswordAuthentication ? null : (
        <Form className="space-y-5" onSubmit={handleSubmit}>
          {localSingleUserMode ? null : (
            <TextInput
              label="ra.auth.email"
              source="email"
              type="email"
              validate={required()}
            />
          )}
          <TextInput
            label={localSingleUserMode ? "访问密码" : "ra.auth.password"}
            source="password"
            type="password"
            autoComplete="current-password"
            validate={required()}
          />
          <Button
            type="submit"
            className="h-12 w-full cursor-pointer rounded-full bg-[#0071e3] text-[15px] hover:bg-[#0077ed]"
            disabled={loading}
          >
            {loading
              ? "正在解锁…"
              : localSingleUserMode
                ? "进入工作台"
                : translate("ra.auth.sign_in")}
          </Button>
        </Form>
      )}
      {googleWorkplaceDomain && !localSingleUserMode ? (
        <SSOAuthButton
          className="h-12 w-full rounded-full"
          domain={googleWorkplaceDomain}
        >
          使用 Google Workspace 登录
        </SSOAuthButton>
      ) : null}
      {disableEmailPasswordAuthentication || localSingleUserMode ? null : (
        <Link
          to="/forgot-password"
          className="block text-center text-sm font-medium text-[#0066cc] hover:underline"
        >
          忘记密码？
        </Link>
      )}
      <p className="border-t border-black/[0.06] pt-5 text-center text-xs leading-5 text-[#86868b]">
        {localSingleUserMode
          ? "账号身份由本机内部管理；企查查与获客助手密钥不会写入浏览器。"
          : "账号、名单和数据源按工作空间隔离。平台不会在浏览器中保存供应商密钥。"}
      </p>
    </Layout>
  );
};
