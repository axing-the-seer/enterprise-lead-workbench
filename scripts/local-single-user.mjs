import { randomBytes } from "node:crypto";

export const DEFAULT_LOCAL_SINGLE_USER_EMAIL = "local-admin@workbench.invalid";

export function resolveLocalBootstrapToken(value) {
  if (value === undefined) return randomBytes(32).toString("base64url");
  if (
    typeof value !== "string" ||
    Buffer.byteLength(value, "utf8") < 24 ||
    /[\r\n\0]/.test(value)
  ) {
    throw new Error(
      "WORKBENCH_BOOTSTRAP_TOKEN 必须至少 24 字节且不能包含换行。",
    );
  }
  return value;
}

export async function resolveLocalSingleUserEmail(apiUrl, serviceRoleKey) {
  const endpoint = new URL("/rest/v1/sales", apiUrl);
  endpoint.searchParams.set("select", "email");
  endpoint.searchParams.set("administrator", "eq.true");
  endpoint.searchParams.set("disabled", "eq.false");
  endpoint.searchParams.set("order", "id.asc");
  endpoint.searchParams.set("limit", "1");

  try {
    const response = await fetch(endpoint, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });
    if (!response.ok) return DEFAULT_LOCAL_SINGLE_USER_EMAIL;
    const rows = await response.json();
    const email = Array.isArray(rows) ? rows[0]?.email : undefined;
    return typeof email === "string" && email.includes("@")
      ? email
      : DEFAULT_LOCAL_SINGLE_USER_EMAIL;
  } catch {
    return DEFAULT_LOCAL_SINGLE_USER_EMAIL;
  }
}
