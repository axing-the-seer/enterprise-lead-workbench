import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const KC_API_KEY_PATTERN =
  /^kc-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Local WorkBuddy and the provider worker intentionally share only a secret
 * reference in the database. Bridge the existing user-scoped key into the
 * worker process at startup without copying it into the repository or logs.
 */
export function withLocalProviderSecrets(runtimeEnv) {
  if (runtimeEnv.KC_API_KEY) return runtimeEnv;

  const keyPath =
    runtimeEnv.KC_API_KEY_FILE ?? join(homedir(), ".workbuddy", ".kc_key");
  let value;
  try {
    value = readFileSync(keyPath, "utf8").trim();
  } catch (error) {
    if (error?.code === "ENOENT") return runtimeEnv;
    throw new Error("无法读取本机获客助手凭证文件。", { cause: error });
  }

  if (!KC_API_KEY_PATTERN.test(value)) {
    throw new Error("本机获客助手凭证文件格式无效。");
  }
  return { ...runtimeEnv, KC_API_KEY: value };
}
