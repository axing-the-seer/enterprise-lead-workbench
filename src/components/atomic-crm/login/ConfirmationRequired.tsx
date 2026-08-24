import { MailCheck } from "lucide-react";
import { Layout } from "@/components/supabase/layout";

export const ConfirmationRequired = () => {
  return (
    <Layout>
      <div className="text-center">
        <span className="mx-auto mb-5 grid size-11 place-items-center rounded-2xl bg-[#e8f2ff] text-[#0071e3]">
          <MailCheck className="size-5" />
        </span>
        <h1 className="text-[30px] font-semibold tracking-[-0.035em]">
          请确认邮箱
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#6e6e73]">
          我们已发送确认链接。打开邮件完成验证后，即可返回企业名单工作台登录。
        </p>
      </div>
    </Layout>
  );
};

ConfirmationRequired.path = "/sign-up/confirm";
