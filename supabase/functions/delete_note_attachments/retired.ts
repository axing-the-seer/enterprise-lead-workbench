const RESPONSE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  Allow: "POST",
};

export function retiredAttachmentCleanupResponse(method: string): Response {
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...RESPONSE_HEADERS,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  if (method !== "POST") {
    return new Response(
      JSON.stringify({
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "该接口仅保留兼容占位，不再接受附件操作。",
        },
      }),
      { status: 405, headers: RESPONSE_HEADERS },
    );
  }

  return new Response(
    JSON.stringify({
      error: {
        code: "LEGACY_ATTACHMENT_CLEANUP_RETIRED",
        message: "旧版 CRM 附件清理能力已停用。",
      },
    }),
    { status: 410, headers: RESPONSE_HEADERS },
  );
}
