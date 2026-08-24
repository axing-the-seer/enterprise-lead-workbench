import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  BootstrapInputError,
  constantTimeTokenEqual,
  isBootstrapTokenConfigured,
  MAX_BOOTSTRAP_REQUEST_BYTES,
  parseBootstrapAdminInput,
  type BootstrapStatus,
} from "./contracts.ts";

type BootstrapStateRow = {
  is_initialized: boolean;
  claim_in_progress: boolean;
};

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
): Response {
  return jsonResponse(status, { status, code, message });
}

async function getBootstrapStatus(
  configured: boolean,
): Promise<BootstrapStatus> {
  const { data, error } = await supabaseAdmin.rpc(
    "get_first_admin_bootstrap_state",
  );
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as
    | BootstrapStateRow
    | undefined;
  if (!row) throw new Error("bootstrap state is unavailable");

  const initialized = row.is_initialized === true;
  const claimInProgress = row.claim_in_progress === true;
  return {
    configured,
    initialized,
    claimInProgress,
    available: configured && !initialized && !claimInProgress,
  };
}

async function parseJsonBody(req: Request): Promise<unknown> {
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_BOOTSTRAP_REQUEST_BYTES
  ) {
    throw new BootstrapInputError("REQUEST_TOO_LARGE", "初始化请求过大");
  }

  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BOOTSTRAP_REQUEST_BYTES) {
    throw new BootstrapInputError("REQUEST_TOO_LARGE", "初始化请求过大");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new BootstrapInputError("INVALID_JSON", "初始化请求不是有效 JSON");
  }
}

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "仅支持 POST 请求");
  }

  const configuredToken = Deno.env.get("WORKBENCH_BOOTSTRAP_TOKEN");
  const configured = isBootstrapTokenConfigured(configuredToken);

  let body: unknown;
  try {
    body = await parseJsonBody(req);
  } catch (error) {
    if (error instanceof BootstrapInputError) {
      return errorResponse(400, error.code, error.message);
    }
    return errorResponse(400, "INVALID_INPUT", "初始化参数格式不正确");
  }

  if (
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    (body as Record<string, unknown>).action === "status"
  ) {
    try {
      return jsonResponse(200, {
        data: await getBootstrapStatus(configured),
      });
    } catch {
      return errorResponse(
        503,
        "BOOTSTRAP_STATE_UNAVAILABLE",
        "初始化服务暂不可用",
      );
    }
  }

  if (!configured || !configuredToken) {
    return errorResponse(
      503,
      "BOOTSTRAP_NOT_CONFIGURED",
      "部署方尚未配置首次管理员初始化码",
    );
  }

  let input;
  try {
    input = parseBootstrapAdminInput(body);
  } catch (error) {
    if (error instanceof BootstrapInputError) {
      return errorResponse(400, error.code, error.message);
    }
    return errorResponse(400, "INVALID_INPUT", "初始化参数格式不正确");
  }

  if (!(await constantTimeTokenEqual(input.bootstrapToken, configuredToken))) {
    return errorResponse(403, "BOOTSTRAP_DENIED", "初始化码无效或已失效");
  }

  const claimId = crypto.randomUUID();
  const { data: claimed, error: claimError } = await supabaseAdmin.rpc(
    "claim_first_admin_bootstrap",
    { p_claim_id: claimId },
  );
  if (claimError) {
    return errorResponse(
      503,
      "BOOTSTRAP_STATE_UNAVAILABLE",
      "初始化服务暂不可用",
    );
  }
  if (claimed !== true) {
    const status = await getBootstrapStatus(configured).catch(() => null);
    return errorResponse(
      409,
      status?.initialized ? "ALREADY_INITIALIZED" : "BOOTSTRAP_IN_PROGRESS",
      status?.initialized
        ? "系统已完成首次管理员初始化"
        : "另一个初始化请求正在处理",
    );
  }

  const { data: provisioningClaimIssued, error: provisioningClaimError } =
    await supabaseAdmin.rpc("issue_user_provisioning_claim", {
      p_claim_id: claimId,
      p_email: input.email,
      p_purpose: "bootstrap",
      p_administrator: true,
    });
  if (provisioningClaimError || provisioningClaimIssued !== true) {
    await supabaseAdmin.rpc("release_first_admin_bootstrap", {
      p_claim_id: claimId,
    });
    return errorResponse(
      503,
      "BOOTSTRAP_STATE_UNAVAILABLE",
      "初始化服务暂不可用",
    );
  }

  const releaseFailedCreation = async () => {
    await Promise.all([
      supabaseAdmin.rpc("release_user_provisioning_claim", {
        p_claim_id: claimId,
      }),
      supabaseAdmin.rpc("release_first_admin_bootstrap", {
        p_claim_id: claimId,
      }),
    ]);
  };

  let data;
  let createError;
  try {
    const result = await supabaseAdmin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        first_name: input.firstName,
        last_name: input.lastName,
        workbench_provisioning_claim_id: claimId,
      },
      app_metadata: {
        workbench_provisioning: "bootstrap",
        workbench_bootstrap_claim_id: claimId,
      },
    });
    data = result.data;
    createError = result.error;
  } catch {
    await releaseFailedCreation();
    console.error("bootstrap-admin user creation failed", {
      code: "request_failed",
      status: 500,
    });
    return errorResponse(
      503,
      "ADMIN_CREATION_FAILED",
      "管理员账号创建失败，请检查邮箱、密码策略或稍后重试",
    );
  }

  if (createError || !data.user) {
    await releaseFailedCreation();
    console.error("bootstrap-admin user creation failed", {
      code: createError?.code ?? "missing_user",
      status: createError?.status ?? 500,
    });
    return errorResponse(
      400,
      "ADMIN_CREATION_FAILED",
      "管理员账号创建失败，请检查邮箱、密码策略或稍后重试",
    );
  }

  const { data: completed, error: completeError } = await supabaseAdmin.rpc(
    "complete_first_admin_bootstrap",
    {
      p_claim_id: claimId,
      p_admin_user_id: data.user.id,
    },
  );
  if (completeError || completed !== true) {
    console.error("bootstrap-admin completion failed", {
      code: completeError?.code ?? "completion_rejected",
    });
    return errorResponse(
      500,
      "BOOTSTRAP_COMPLETION_FAILED",
      "管理员账号已创建，但初始化状态确认失败；请返回登录页重试登录",
    );
  }

  return jsonResponse(201, {
    data: {
      id: data.user.id,
      email: input.email,
    },
  });
}

Deno.serve((req: Request) => OptionsMiddleware(req, handler));
