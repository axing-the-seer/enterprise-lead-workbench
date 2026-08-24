import { test as base, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54341";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY!;
const publishableKey = process.env.VITE_SB_PUBLISHABLE_KEY!;
const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Children precede parents so every test starts with an isolated tenant.
const TABLES = [
  "manual_reviews",
  "rule_results",
  "company_evidence",
  "company_field_facts",
  "qualifications",
  "risk_events",
  "company_identifiers",
  "company_list_members",
  "exports",
  "rule_runs",
  "source_snapshots",
  "source_records",
  "ingestion_jobs",
  "source_queries",
  "source_connections",
  "field_mapping_versions",
  "field_mapping_sets",
  "rule_set_versions",
  "rule_sets",
  "audit_logs",
  "company_lists",
  "companies",
  "workspace_members",
  "workspaces",
  "tasks",
  "contact_notes",
  "deal_notes",
  "deals",
  "contacts",
  "tags",
  "favicons_excluded_domains",
  "configuration",
  "sales",
] as const;

async function resetDb() {
  for (const table of TABLES) {
    const { error } = await adminSupabase
      .from(table)
      .delete()
      .not("id", "is", null);
    if (error && error.code !== "42P01") {
      throw new Error(`Failed to reset ${table}: ${error.message}`);
    }
  }

  const { data, error } = await adminSupabase.auth.admin.listUsers();
  if (error) throw error;
  for (const user of data.users) {
    const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(
      user.id,
    );
    if (deleteError) throw deleteError;
  }
}

async function createAdministrator(email: string, password: string) {
  const claimId = crypto.randomUUID();
  const { data: issued, error: claimError } = await adminSupabase.rpc(
    "issue_user_provisioning_claim",
    {
      p_claim_id: claimId,
      p_email: email,
      p_purpose: "administrator",
      p_administrator: true,
    },
  );
  if (claimError || issued !== true) {
    throw new Error(
      claimError?.message ?? "Failed to issue provisioning claim",
    );
  }

  const { data, error } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { workbench_provisioning_claim_id: claimId },
    app_metadata: { workbench_provisioning: "administrator" },
  });
  if (error || !data.user) {
    throw new Error(error?.message ?? "Failed to create administrator");
  }
  return data.user;
}

type WorkbenchSeed = {
  email: string;
  password: string;
  workspaceId: string;
  listId: string;
  companyId: string;
};

async function setupWorkbench(): Promise<WorkbenchSeed> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `owner-${suffix}@example.test`;
  const password = "local-e2e-password-2026";
  const user = await createAdministrator(email, password);

  const userSupabase = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: loginError } = await userSupabase.auth.signInWithPassword({
    email,
    password,
  });
  if (loginError) throw loginError;
  const { data: initialized, error: initializeError } = await userSupabase.rpc(
    "initialize_workbench_workspace",
    {
      p_workspace_name: "自动化验收工作空间",
      p_workspace_slug: `acceptance-${suffix}`,
    },
  );
  if (initializeError) throw initializeError;
  const row = Array.isArray(initialized) ? initialized[0] : initialized;
  const workspaceId = String(row?.workspace_id ?? "");
  if (!workspaceId) throw new Error("Workspace initialization returned no ID");

  const { error: sourceError } = await adminSupabase
    .from("source_connections")
    .update({ status: "ready", last_verified_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .in("provider", ["qcc", "huoke_assistant", "web_search"]);
  if (sourceError) throw sourceError;

  const { data: company, error: companyError } = await adminSupabase
    .from("companies")
    .insert({
      workspace_id: workspaceId,
      name: "上海智造设备有限公司",
      normalized_name: "上海智造设备有限公司",
      deduplication_key: `uscc:91310000${suffix.toUpperCase()}TEST`,
      unified_social_credit_code: `91310000${suffix.toUpperCase()}TEST`,
      legal_representative: "张明",
      operating_status: "存续",
      company_type: "有限责任公司",
      registered_capital_amount: 5000,
      established_on: "2018-03-12",
      province: "上海市",
      city: "上海市",
      district: "浦东新区",
      industry_name: "专用设备制造业",
      insured_employee_count: 86,
      phone_number: "021-55556666",
      primary_source: "huoke_assistant",
      profile_status: "verified",
      last_verified_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (companyError) throw companyError;

  const { data: list, error: listError } = await adminSupabase
    .from("company_lists")
    .insert({
      workspace_id: workspaceId,
      name: "上海专用设备制造企业",
      description: "由获客助手真实字段映射创建的自动化验收名单",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (listError) throw listError;

  const { error: memberError } = await adminSupabase
    .from("company_list_members")
    .insert({
      workspace_id: workspaceId,
      company_list_id: list.id,
      company_id: company.id,
      membership_status: "included",
      selection_reason: ["上海市", "专用设备制造业"],
      added_by: user.id,
    });
  if (memberError) throw memberError;

  await userSupabase.auth.signOut();
  return {
    email,
    password,
    workspaceId,
    listId: String(list.id),
    companyId: String(company.id),
  };
}

async function login(page: Page, seed: WorkbenchSeed) {
  await page.goto("/");
  await page.getByLabel("邮箱").fill(seed.email);
  await page.getByLabel("密码").fill(seed.password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "找企业" })).toBeVisible();
}

export const test = base.extend<{
  resetDb: void;
  setupWorkbench: typeof setupWorkbench;
  login: (seed: WorkbenchSeed) => Promise<void>;
}>({
  resetDb: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, provide) => {
      await resetDb();
      await provide();
    },
    { auto: true },
  ],
  // eslint-disable-next-line no-empty-pattern
  setupWorkbench: async ({}, provide) => provide(setupWorkbench),
  login: async ({ page }, provide) => provide((seed) => login(page, seed)),
});

export { expect, type WorkbenchSeed };
