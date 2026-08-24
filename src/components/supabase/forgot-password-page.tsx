import { useState } from "react";
import { useResetPassword } from "ra-supabase-core";
import { Form, required, useNotify, useRedirect, useTranslate } from "ra-core";
import { Layout } from "@/components/supabase/layout";
import type { FieldValues, SubmitHandler } from "react-hook-form";
import { TextInput } from "@/components/admin/text-input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, KeyRound } from "lucide-react";
import { Link } from "react-router";

interface FormData {
  email: string;
}

export const ForgotPasswordPage = () => {
  const [loading, setLoading] = useState(false);

  const notify = useNotify();
  const redirect = useRedirect();
  const translate = useTranslate();
  const [, { mutateAsync: resetPassword }] = useResetPassword({
    onSuccess: () => {
      redirect("/login?passwordRecoveryEmailSent=1");
    },
    onError: () => undefined,
  });

  const submit = async (values: FormData) => {
    try {
      setLoading(true);
      await resetPassword({
        email: values.email,
        // Supabase must return to the static bridge before the hash router can
        // consume recovery tokens. Build from the configured application base
        // instead of document.baseURI: a fallback route can otherwise append
        // auth-callback.html repeatedly after a previous recovery attempt.
        redirectTo: new URL("/auth-callback.html", window.location.origin).href,
      });
    } catch (error: any) {
      notify(
        typeof error === "string"
          ? error
          : typeof error === "undefined" || !error.message
            ? "ra.auth.sign_in_error"
            : error.message,
        {
          type: "warning",
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
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col space-y-2 text-center">
        <span className="mx-auto mb-3 grid size-11 place-items-center rounded-2xl bg-[#e8f2ff] text-[#0071e3]">
          <KeyRound className="size-5" />
        </span>
        <h1 className="text-[30px] font-semibold tracking-[-0.035em]">
          找回密码
        </h1>
        <p className="text-sm leading-6 text-[#6e6e73]">
          输入管理员邮箱。如果账号存在，系统会发送安全的密码重置链接。
        </p>
      </div>
      <Form<FormData>
        className="space-y-8"
        onSubmit={submit as SubmitHandler<FieldValues>}
      >
        <TextInput
          source="email"
          label={translate("ra.auth.email", {
            _: "Email",
          })}
          autoComplete="email"
          validate={required()}
        />
        <Button
          type="submit"
          className="h-12 w-full cursor-pointer rounded-full bg-[#0071e3] text-[15px] hover:bg-[#0077ed]"
          disabled={loading}
        >
          {loading ? "正在发送…" : "发送重置链接"}
        </Button>
      </Form>
      <Link
        to="/login"
        className="flex items-center justify-center gap-1.5 text-sm font-medium text-[#0066cc] hover:underline"
      >
        <ArrowLeft className="size-4" />
        返回登录
      </Link>
    </Layout>
  );
};

ForgotPasswordPage.path = "forgot-password";
