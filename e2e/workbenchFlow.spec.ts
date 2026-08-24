import { expect, test } from "./fixtures";

test("authenticated user sees the focused two-entry product flow", async ({
  page,
  setupWorkbench,
  login,
}) => {
  const seed = await setupWorkbench();
  await login(seed);

  await expect(page).toHaveTitle(/企业名单工作台/);
  const primaryNavigation = page.getByRole("navigation", { name: "主要导航" });
  await expect(primaryNavigation.getByRole("link")).toHaveCount(2);
  await expect(
    primaryNavigation.getByRole("link", { name: "找企业" }),
  ).toBeVisible();
  await expect(
    primaryNavigation.getByRole("link", { name: "我的名单" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "开始查找" }).click();
  await expect(
    page.getByText("请先选择行业或输入企业/产品关键词；地区不选时按全国查找。"),
  ).toBeVisible();

  await page.getByRole("button", { name: "配置" }).click();
  await expect(page.getByRole("heading", { name: "配置" })).toBeVisible();
  await expect(page.getByText("获客助手").first()).toBeVisible();
  await expect(page.getByText("企查查").first()).toBeVisible();
  await expect(page.getByText("Ego Lite").first()).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();
});

test("user manages a seeded source-backed list and opens company detail", async ({
  page,
  setupWorkbench,
  login,
}) => {
  const seed = await setupWorkbench();
  await login(seed);

  await page.getByRole("link", { name: "我的名单" }).click();
  await expect(
    page.getByRole("heading", { name: "所有企业名单" }),
  ).toBeVisible();
  await page.getByText("上海专用设备制造企业").click();

  await expect(
    page.getByRole("heading", { name: /上海专用设备制造企业/ }),
  ).toBeVisible();
  await page.getByText("上海智造设备有限公司").click();
  await expect(
    page.getByRole("heading", { name: "上海智造设备有限公司" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "企业信息" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "来源与冲突" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "企业报告" })).toBeVisible();
});

test("cost-bearing verification requires explicit confirmation", async ({
  page,
  setupWorkbench,
  login,
}) => {
  const seed = await setupWorkbench();
  await login(seed);
  await page.goto(`/#/lists/${seed.listId}`);

  await page
    .getByRole("checkbox", { name: "选择上海智造设备有限公司" })
    .click();
  await page.getByRole("button", { name: "核验所选 1 家" }).click();
  await expect(
    page.getByRole("heading", { name: "确认企查查核验" }),
  ).toBeVisible();
  await expect(page.getByText("每次查询都可能消耗企查查积分")).toBeVisible();
  await page.getByRole("button", { name: "取消" }).click();
});
