import {
  BootstrapInputError,
  constantTimeTokenEqual,
  isBootstrapTokenConfigured,
  MAX_ADMIN_PASSWORD_LENGTH,
  MIN_ADMIN_PASSWORD_LENGTH,
  MIN_BOOTSTRAP_TOKEN_BYTES,
  parseBootstrapAdminInput,
} from "./contracts.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrowsCode(callback: () => unknown, code: string) {
  try {
    callback();
  } catch (error) {
    assert(error instanceof BootstrapInputError, "unexpected error type");
    assert(error.code === code, `expected ${code}, received ${error.code}`);
    return;
  }
  throw new Error(`expected ${code}`);
}

const validToken = "b".repeat(MIN_BOOTSTRAP_TOKEN_BYTES);

Deno.test(
  "bootstrap input normalizes identity fields but preserves password",
  () => {
    const input = parseBootstrapAdminInput({
      action: "create",
      bootstrapToken: `  ${validToken}  `,
      email: "  OWNER@EXAMPLE.TEST ",
      password: ` ${"p".repeat(MIN_ADMIN_PASSWORD_LENGTH)} `,
      firstName: "  名 ",
      lastName: " 姓  ",
    });

    assert(input.bootstrapToken === validToken, "token should be trimmed");
    assert(input.email === "owner@example.test", "email should be normalized");
    assert(input.firstName === "名", "first name should be trimmed");
    assert(input.lastName === "姓", "last name should be trimmed");
    assert(
      input.password.startsWith(" ") && input.password.endsWith(" "),
      "password whitespace must be preserved",
    );
  },
);

Deno.test(
  "bootstrap input rejects short tokens and weak or oversized passwords",
  () => {
    const base = {
      action: "create",
      bootstrapToken: validToken,
      email: "owner@example.test",
      password: "p".repeat(MIN_ADMIN_PASSWORD_LENGTH),
      firstName: "名",
      lastName: "姓",
    };

    assertThrowsCode(
      () =>
        parseBootstrapAdminInput({
          ...base,
          bootstrapToken: "x".repeat(MIN_BOOTSTRAP_TOKEN_BYTES - 1),
        }),
      "INVALID_INPUT",
    );
    assertThrowsCode(
      () =>
        parseBootstrapAdminInput({
          ...base,
          password: "p".repeat(MIN_ADMIN_PASSWORD_LENGTH - 1),
        }),
      "INVALID_INPUT",
    );
    assertThrowsCode(
      () =>
        parseBootstrapAdminInput({
          ...base,
          password: "p".repeat(MAX_ADMIN_PASSWORD_LENGTH + 1),
        }),
      "INVALID_INPUT",
    );
  },
);

Deno.test("bootstrap input rejects malformed email and unknown action", () => {
  const base = {
    action: "create",
    bootstrapToken: validToken,
    email: "owner@example.test",
    password: "p".repeat(MIN_ADMIN_PASSWORD_LENGTH),
    firstName: "名",
    lastName: "姓",
  };

  assertThrowsCode(
    () => parseBootstrapAdminInput({ ...base, email: "not-an-email" }),
    "INVALID_INPUT",
  );
  assertThrowsCode(
    () => parseBootstrapAdminInput({ ...base, action: "status" }),
    "INVALID_INPUT",
  );
});

Deno.test(
  "token comparison accepts only the exact configured value",
  async () => {
    assert(
      await constantTimeTokenEqual(validToken, validToken),
      "equal tokens should match",
    );
    assert(
      !(await constantTimeTokenEqual(`${validToken}x`, validToken)),
      "different tokens must not match",
    );
    assert(isBootstrapTokenConfigured(validToken), "valid token is configured");
    assert(
      !isBootstrapTokenConfigured("short"),
      "short configuration must fail closed",
    );
  },
);
