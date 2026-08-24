import type { ReactNode } from "react";
import { CoreAdminContext } from "ra-core";
import fakeDataProvider from "ra-data-fakerest";
import { render } from "vitest-browser-react";
import { WebEvidenceDialog } from "./EnterpriseReviewPage";
import { SourceQueryDialog } from "./SourceQueryDialog";
import type { SourceConnection } from "./types";

const webSource: SourceConnection = {
  id: "fictional-web-source-id",
  workspace_id: "fictional-workspace-id",
  provider: "web_search",
  name: "虚构 Web 证据源",
  status: "ready",
};

function TestAdmin({ children }: { children: ReactNode }) {
  return (
    <CoreAdminContext
      dataProvider={fakeDataProvider({
        source_connections_safe: [webSource],
      })}
      i18nProvider={{
        translate: (key, options) =>
          typeof options?._ === "string" ? options._ : key,
        changeLocale: () => Promise.resolve(),
        getLocale: () => "zh-CN",
      }}
    >
      {children}
    </CoreAdminContext>
  );
}

describe("Web 证据 GUI 边界", () => {
  it("普通企业名单查询不展示 Web 证据源", async () => {
    const screen = await render(
      <SourceQueryDialog
        open
        onOpenChange={vi.fn()}
        workspaceId="fictional-workspace-id"
        sources={[webSource]}
        sourcesError={null}
        onSubmitted={vi.fn()}
      />,
      { wrapper: TestAdmin },
    );

    await expect
      .element(screen.getByText("没有可查询的真实数据源"))
      .toBeVisible();
    await expect
      .element(screen.getByText("虚构 Web 证据源"))
      .not.toBeInTheDocument();
  });

  it("补充证据对话框绑定已有企业并显式提示额度", async () => {
    const screen = await render(
      <WebEvidenceDialog
        open
        onOpenChange={vi.fn()}
        workspaceId="fictional-workspace-id"
        companyId="fictional-company-id"
        companyName="虚构测试主体-Y"
      />,
      { wrapper: TestAdmin },
    );

    await expect
      .element(screen.getByText("提交后将消耗腾讯云 WSA 搜索额度"))
      .toBeVisible();
    await expect.element(screen.getByText(/\u865a构测试主体-Y/)).toBeVisible();

    await screen.getByRole("combobox", { name: "Web 证据数据源" }).click();
    await expect
      .element(screen.getByText("虚构 Web 证据源（ready）"))
      .toBeVisible();
  });
});
