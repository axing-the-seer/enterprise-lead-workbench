import {
  BootstrapInputError,
  constantTimeTokenEqual,
  isBootstrapTokenConfigured,
  isLocalBootstrapRequestAllowed,
  isLocalSingleUserModeEnabled,
  LOCAL_SINGLE_USER_EMAIL,
  MAX_ADMIN_PASSWORD_LENGTH,
  MIN_ADMIN_PASSWORD_LENGTH,
  MIN_BOOTSTRAP_TOKEN_BYTES,
  parseBootstrapAdminInput,
  parseLocalBootstrapAdminInput,
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
  "local single-user input derives the hidden administrator identity",
  () => {
    const input = parseLocalBootstrapAdminInput(
      {
        action: "create-local",
        password: "p".repeat(MIN_ADMIN_PASSWORD_LENGTH),
      },
      validToken,
    );

    assert(
      input.email === LOCAL_SINGLE_USER_EMAIL,
      "local email must be fixed",
    );
    assert(input.firstName === "本机", "local first name must be derived");
    assert(input.lastName === "管理员", "local last name must be derived");
    assert(
      input.bootstrapToken === validToken,
      "server token must be injected",
    );
  },
);

Deno.test("local single-user mode is restricted to loopback Supabase", () => {
  assert(
    isLocalSingleUserModeEnabled("true", "http://127.0.0.1:54321"),
    "IPv4 loopback should be allowed",
  );
  assert(
    isLocalSingleUserModeEnabled("true", "http://localhost:54321"),
    "localhost should be allowed",
  );
  assert(
    !isLocalSingleUserModeEnabled("true", "https://project.supabase.co"),
    "hosted Supabase must fail closed",
  );
  assert(
    !isLocalSingleUserModeEnabled("false", "http://127.0.0.1:54321"),
    "explicit opt-in is required",
  );
});

Deno.test(
  "local password initialization accepts only loopback browser origins",
  () => {
    for (const origin of [
      "http://127.0.0.1:3101",
      "http://localhost:5175",
      "https://[::1]:3101",
    ]) {
      assert(
        isLocalBootstrapRequestAllowed(origin, "same-site"),
        `loopback origin should be allowed: ${origin}`,
      );
    }
    for (const origin of [
      "https://attacker.example",
      "http://127.0.0.1.attacker.example",
      "null",
    ]) {
      assert(
        !isLocalBootstrapRequestAllowed(origin, "cross-site"),
        `non-loopback origin must be rejected: ${origin}`,
      );
    }
    assert(
      isLocalBootstrapRequestAllowed(null, null),
      "native local callers without browser metadata should remain supported",
    );
    assert(
      !isLocalBootstrapRequestAllowed(null, "cross-site"),
      "browser requests without an Origin must fail closed",
    );
  },
);

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
