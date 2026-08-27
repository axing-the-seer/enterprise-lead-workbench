import { describe, expect, it } from "vitest";
import { retiredAttachmentCleanupResponse } from "./retired";

describe("retired attachment cleanup endpoint", () => {
  it("fails closed for the historical deletion method", async () => {
    const response = retiredAttachmentCleanupResponse("POST");

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "LEGACY_ATTACHMENT_CLEANUP_RETIRED",
        message: "旧版 CRM 附件清理能力已停用。",
      },
    });
  });

  it("does not accept alternate mutation methods", () => {
    for (const method of ["GET", "PATCH", "DELETE", "PUT"]) {
      expect(retiredAttachmentCleanupResponse(method).status).toBe(405);
    }
  });

  it("answers preflight without enabling credentials", () => {
    const response = retiredAttachmentCleanupResponse("OPTIONS");

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });
});
