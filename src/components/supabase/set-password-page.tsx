import { useState } from "react";
import { Form, required, useNotify, useTranslate } from "ra-core";
import { useSetPassword, useSupabaseAccessToken } from "ra-supabase-core";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/admin/text-input";
import { Layout } from "@/components/supabase/layout";
import { KeyRound } from "lucide-react";

interface SetPasswordFormData {
  password: string;
  confirmPassword: string;
}

export const SetPasswordPage = () => {
  const [loading, setLoading] = useState(false);

  const access_token = useSupabaseAccessToken();
  const refresh_token = useSupabaseAccessToken({
    parameterName: "refresh_token",
  });

  const notify = useNotify();
  const translate = useTranslate();
  const [, { mutateAsync: setPassword }] = useSetPassword();

  const validate = (values: SetPasswordFormData) => {
    if (values.password !== values.confirmPassword) {
      return {
        password: "ra-supabase.validation.password_mismatch",
        confirmPassword: "ra-supabase.validation.password_mismatch",
      };
    }
    return {};
  };

  if (!access_token || !refresh_token) {
    if (process.env.NODE_ENV === "development") {
      console.error("Missing access_token or refresh_token for set password");
    }
    return (
      <Layout>
        <p>{translate("ra-supabase.auth.missing_tokens")}</p>
      </Layout>
    );
  }

  const submit = async (values: SetPasswordFormData) => {
    try {
      setLoading(true);
      await setPassword({
        access_token,
        refresh_token,
        password: values.password,
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
          设置新密码
        </h1>
        <p className="text-sm leading-6 text-[#6e6e73]">
          新密码建议使用 12 位以上字符，并避免与其他服务重复。
        </p>
      </div>
      <Form
        className="space-y-8"
        onSubmit={submit as any}
        validate={validate as any}
      >
        <TextInput
          label="新密码"
          autoComplete="new-password"
          source="password"
          type="password"
          validate={required()}
        />
        <TextInput
          label="确认密码"
          source="confirmPassword"
          type="password"
          validate={required()}
        />
        <Button
          type="submit"
          className="h-12 w-full cursor-pointer rounded-full bg-[#0071e3] text-[15px] hover:bg-[#0077ed]"
          disabled={loading}
        >
          {loading ? "正在保存…" : "保存新密码"}
        </Button>
      </Form>
    </Layout>
  );
};

SetPasswordPage.path = "set-password";
