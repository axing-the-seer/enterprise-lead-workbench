import { describe, expect, it } from "vitest";
import {
  getHashRoutedAuthLocation,
  getSafeLoginRedirect,
} from "./authRoute";

describe("OAuth route bridge", () => {
  it("moves a Supabase OAuth consent request into the hash router", () => {
    expect(
      getHashRoutedAuthLocation({
        pathname: "/oauth/consent",
        search: "?authorization_id=request-123",
        hash: "",
      }),
    ).toBe("/#/oauth/consent?authorization_id=request-123");
  });

  it("leaves normal and already hash-routed pages unchanged", () => {
    expect(
      getHashRoutedAuthLocation({ pathname: "/", search: "", hash: "" }),
    ).toBeNull();
    expect(
      getHashRoutedAuthLocation({
        pathname: "/oauth/consent",
        search: "",
        hash: "#/oauth/consent?authorization_id=request-123",
      }),
    ).toBeNull();
  });
});

describe("login redirect", () => {
  it("accepts an internal OAuth consent return path", () => {
    expect(
      getSafeLoginRedirect(
        "?redirect=%2Foauth%2Fconsent%3Fauthorization_id%3Drequest-123",
      ),
    ).toBe("/oauth/consent?authorization_id=request-123");
  });

  it("rejects external and protocol-relative redirects", () => {
    expect(getSafeLoginRedirect("?redirect=https%3A%2F%2Fevil.example")).toBe(
      undefined,
    );
    expect(getSafeLoginRedirect("?redirect=%2F%2Fevil.example")).toBe(
      undefined,
    );
  });
});
