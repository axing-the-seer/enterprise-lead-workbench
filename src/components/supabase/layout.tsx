import * as React from "react";
import { Notification } from "@/components/admin/notification";
import { useConfigurationContext } from "@/components/atomic-crm/root/ConfigurationContext";

export const Layout = ({ children }: React.PropsWithChildren) => {
  const { title } = useConfigurationContext();

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
      <header className="mx-auto flex h-20 w-full max-w-6xl items-center px-5 sm:h-24 sm:px-8">
        <div className="flex items-center gap-3">
          <img
            className="size-10 rounded-[12px] shadow-[0_8px_24px_rgba(0,0,0,0.14)]"
            src="/appIcon/512.png"
            alt=""
          />
          <span className="text-[17px] font-semibold tracking-[-0.01em]">
            {title}
          </span>
        </div>
      </header>
      <main className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-6xl items-center justify-center px-4 pb-14 sm:min-h-[calc(100vh-9rem)] sm:px-8">
        <section className="w-full max-w-[480px] rounded-[30px] border border-black/[0.06] bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.10)] sm:p-9">
          <div className="flex w-full flex-col justify-center space-y-6">
            {children}
          </div>
        </section>
      </main>
      <Notification />
    </div>
  );
};
