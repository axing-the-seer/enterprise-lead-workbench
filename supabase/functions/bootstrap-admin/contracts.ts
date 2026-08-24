export const MAX_BOOTSTRAP_REQUEST_BYTES = 16 * 1024;
export const MIN_BOOTSTRAP_TOKEN_BYTES = 24;
export const MIN_ADMIN_PASSWORD_LENGTH = 12;
export const MAX_ADMIN_PASSWORD_LENGTH = 128;

export type BootstrapAdminInput = {
  action: "create";
  bootstrapToken: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
};

export type BootstrapStatus = {
  configured: boolean;
  initialized: boolean;
  claimInProgress: boolean;
  available: boolean;
};

export class BootstrapInputError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BootstrapInputError";
  }
}

function requireString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new BootstrapInputError("INVALID_INPUT", `${field} 格式不正确`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new BootstrapInputError("INVALID_INPUT", `${field} 格式不正确`);
  }
  return normalized;
}

export function parseBootstrapAdminInput(value: unknown): BootstrapAdminInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BootstrapInputError("INVALID_INPUT", "初始化参数格式不正确");
  }

  const body = value as Record<string, unknown>;
  if (body.action !== "create") {
    throw new BootstrapInputError("INVALID_INPUT", "不支持的初始化操作");
  }

  const bootstrapToken = requireString(body.bootstrapToken, "初始化码", 512);
  if (
    new TextEncoder().encode(bootstrapToken).length < MIN_BOOTSTRAP_TOKEN_BYTES
  ) {
    throw new BootstrapInputError(
      "INVALID_INPUT",
      `初始化码至少需要 ${MIN_BOOTSTRAP_TOKEN_BYTES} 个字节`,
    );
  }

  const email = requireString(body.email, "邮箱", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BootstrapInputError("INVALID_INPUT", "邮箱格式不正确");
  }

  if (typeof body.password !== "string") {
    throw new BootstrapInputError("INVALID_INPUT", "密码格式不正确");
  }
  if (
    body.password.length < MIN_ADMIN_PASSWORD_LENGTH ||
    body.password.length > MAX_ADMIN_PASSWORD_LENGTH
  ) {
    throw new BootstrapInputError(
      "INVALID_INPUT",
      `密码长度应为 ${MIN_ADMIN_PASSWORD_LENGTH} 至 ${MAX_ADMIN_PASSWORD_LENGTH} 位`,
    );
  }

  return {
    action: "create",
    bootstrapToken,
    email,
    password: body.password,
    firstName: requireString(body.firstName, "名字", 80),
    lastName: requireString(body.lastName, "姓氏", 80),
  };
}

async function sha256(value: string): Promise<Uint8Array> {
  const input = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", input));
}

export async function constantTimeTokenEqual(
  supplied: string,
  expected: string,
): Promise<boolean> {
  const [suppliedHash, expectedHash] = await Promise.all([
    sha256(supplied),
    sha256(expected),
  ]);

  let difference = suppliedHash.length ^ expectedHash.length;
  const length = Math.max(suppliedHash.length, expectedHash.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (suppliedHash[index] ?? 0) ^ (expectedHash[index] ?? 0);
  }
  return difference === 0;
}

export function isBootstrapTokenConfigured(value: string | undefined): boolean {
  return (
    typeof value === "string" &&
    new TextEncoder().encode(value).length >= MIN_BOOTSTRAP_TOKEN_BYTES
  );
}
