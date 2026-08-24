import { expect, test } from "./fixtures";

test("advanced pages are reachable without reviving the legacy CRM IA", async ({
  page,
  setupWorkbench,
  login,
}) => {
  const seed = await setupWorkbench();
  await login(seed);

  for (const [path, heading] of [
    ["sources", "连接真实数据源"],
    ["mappings", "字段映射"],
    ["rules", "规则模板"],
    ["runs", "执行任务"],
    ["conflicts", "冲突与待核验"],
    ["exports", "导出与 API"],
    ["settings", "系统设置"],
  ] as const) {
    await page.goto(`/#/${path}`);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "主要导航" }).getByRole("link"),
    ).toHaveCount(2);
  }
});

test("rule and export tasks stay disabled until real inputs are selected", async ({
  page,
  setupWorkbench,
  login,
}) => {
  const seed = await setupWorkbench();
  await login(seed);

  await page.goto("/#/runs");
  await page.getByRole("button", { name: "执行整批规则" }).click();
  await expect(
    page.getByRole("button", { name: "提交整批执行" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "取消" }).click();

  await page.goto("/#/exports");
  await page.getByRole("button", { name: "新建导出" }).click();
  await expect(page.getByRole("button", { name: "提交导出" })).toBeDisabled();
  await page.getByRole("button", { name: "取消" }).click();
});
