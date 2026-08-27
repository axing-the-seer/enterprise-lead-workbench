import { test, expect } from "./fixtures";

const bootstrapToken = process.env.WORKBENCH_BOOTSTRAP_TOKEN;

// The first-admin claim is deliberately one-time and cannot be reset through
// the public API. Retrying this spec would test a different state instead of
// retrying the same onboarding flow.
test.describe.configure({ retries: 0 });

test("first administrator continues into workspace initialization", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the one-time bootstrap is exercised once on desktop");
  test.skip(
    !bootstrapToken,
    "WORKBENCH_BOOTSTRAP_TOKEN is required for the production onboarding test",
  );

  await page.goto("/");

  await expect(page).toHaveTitle(/企业名单工作台/);
  await expect(
    page.getByRole("heading", { name: "初始化企业名单工作台" }),
  ).toBeVisible();

  await page.getByLabel("首次管理员初始化码").fill(bootstrapToken!);
  await page.getByLabel("名字").fill("测试");
  await page.getByLabel("姓氏").fill("管理员");
  await page.getByLabel("邮箱").fill("bootstrap-owner@example.test");
  await page.getByLabel("密码").fill("local-e2e-password-2026");
  await page.getByRole("button", { name: "创建首位管理员" }).click();

  // The signup page and workspace gate intentionally share the same heading,
  // so wait for the route transition before asserting the next form.
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByLabel("工作空间名称")).toBeVisible();
  await page.getByLabel("工作空间名称").fill("本地验收工作空间");
  await page.getByLabel("Slug").fill("local-acceptance-workspace");
  await page.getByRole("button", { name: "创建并初始化" }).click();

  await expect(page.getByRole("heading", { name: "找企业" })).toBeVisible();
  await expect(page.getByRole("link", { name: "找企业" })).toBeVisible();
  await expect(page.getByRole("link", { name: "我的名单" })).toBeVisible();
});
