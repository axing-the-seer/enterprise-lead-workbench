import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.112.3";
import { ZodError } from "npm:zod@4.4.3";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { parseWorkbenchAction, toRpcRequest } from "./contracts.ts";

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeJobStatus(status: unknown): string {
  if (status === "completed") return "succeeded";
  return typeof status === "string" ? status : "queued";
}

async function handle(req: Request) {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "只支持 POST 请求" });
  }

  return await UserMiddleware(req, async (authenticatedReq, user) => {
    if (!user) return jsonResponse(401, { error: "未登录" });

    try {
      const action = parseWorkbenchAction(await authenticatedReq.text());
      const authorization = authenticatedReq.headers.get("Authorization") ?? "";
      const client = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SB_PUBLISHABLE_KEY") ?? "",
        { global: { headers: { Authorization: authorization } } },
      );
      const rpcRequest = toRpcRequest(action, user.id);
      const { data, error } = await client.rpc(
        "enqueue_workbench_job",
        rpcRequest,
      );
      if (error) {
        console.error("workbench job enqueue failed", {
          action: action.action,
          workspaceId: action.workspaceId,
          userId: user.id,
          code: error.code,
        });
        const denied = error.code === "42501" || error.code === "PGRST301";
        return jsonResponse(denied ? 403 : 400, {
          error: denied ? "没有该工作空间的操作权限" : "任务提交失败",
          code: error.code,
        });
      }

      const row = Array.isArray(data) ? data[0] : data;
      return jsonResponse(202, {
        jobId: row?.job_id,
        jobType: row?.job_type,
        status: normalizeJobStatus(row?.status),
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return jsonResponse(400, {
          error: "请求参数不符合任务契约",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
      }
      return jsonResponse(400, {
        error: error instanceof Error ? error.message : "请求无法处理",
      });
    }
  });
}

Deno.serve((req) =>
  OptionsMiddleware(req, (optionsReq) => AuthMiddleware(optionsReq, handle)),
);
