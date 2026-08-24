import { describe, expect, it } from "vitest";
import { resolveWorkbenchPublicOrigin } from "./public-origin";

describe("MCP public origin", () => {
  it("accepts a clean HTTPS production origin", () => {
    expect(
      resolveWorkbenchPublicOrigin(
        "https://project.supabase.co",
        "https://project.supabase.co",
      ),
    ).toBe("https://project.supabase.co");
  });

  it("fails closed when a hosted deployment omits the configured origin", () => {
    expect(() =>
      resolveWorkbenchPublicOrigin(undefined, "https://project.supabase.co"),
    ).toThrow(/WORKBENCH_PUBLIC_ORIGIN is required/);
  });

  it("rejects HTTP, credentials, paths, query strings, and fragments in production", () => {
    for (const origin of [
      "http://project.supabase.co",
      "https://user:secret@project.supabase.co",
      "https://project.supabase.co/functions",
      "https://project.supabase.co?redirect=evil",
      "https://project.supabase.co#evil",
    ]) {
      expect(() =>
        resolveWorkbenchPublicOrigin(origin, "https://project.supabase.co"),
      ).toThrow();
    }
  });

  it("uses the backend origin only for local development", () => {
    expect(
      resolveWorkbenchPublicOrigin(undefined, "http://127.0.0.1:54321"),
    ).toBe("http://127.0.0.1:54321");
    expect(
      resolveWorkbenchPublicOrigin(
        "http://localhost:54321",
        "http://127.0.0.1:54321",
      ),
    ).toBe("http://localhost:54321");
  });
});
