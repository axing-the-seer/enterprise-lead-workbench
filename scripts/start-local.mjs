import { execFileSync, spawn } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withLocalProviderSecrets } from "./local-provider-env.mjs";

function runQuietly(command, args, env) {
  try {
    return execFileSync(command, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      env,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (error) {
    // Supabase CLI output contains local credentials. Never echo the captured
    // stdout/stderr; callers can run the individual command when debugging.
    throw new Error(
      `${command} ${args.join(" ")} 执行失败（退出码 ${error.status ?? "未知"}）`,
    );
  }
}

function parseEnv(output) {
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match) continue;
    let value = match[2];
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch {
        value = value.slice(1, -1);
      }
    }
    values[match[1]] = value;
  }
  return values;
}

function requireBootstrapToken(value) {
  if (
    typeof value !== "string" ||
    Buffer.byteLength(value, "utf8") < 24 ||
    /[\r\n\0]/.test(value)
  ) {
    throw new Error(
      "请先设置至少 24 字节且不含换行的 WORKBENCH_BOOTSTRAP_TOKEN。",
    );
  }
  return value;
}

function createEdgeEnvFile(bootstrapToken, publishableKey, apiUrl) {
  const directory = mkdtempSync(
    join(tmpdir(), "enterprise-lead-workbench-edge-"),
  );
  chmodSync(directory, 0o700);
  const path = join(directory, "bootstrap.env");
  const escapedToken = bootstrapToken
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"');
  writeFileSync(
    path,
    `WORKBENCH_BOOTSTRAP_TOKEN="${escapedToken}"\nWORKBENCH_PUBLIC_ORIGIN="${apiUrl}"\nSB_PUBLISHABLE_KEY="${publishableKey}"\nSB_JWT_ISSUER="${apiUrl}/auth/v1"\n`,
    {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    },
  );

  let cleaned = false;
  return {
    path,
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      try {
        unlinkSync(path);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      try {
        rmdirSync(directory);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    },
  };
}

const { WORKBENCH_BOOTSTRAP_TOKEN: rawBootstrapToken, ...runtimeEnv } =
  process.env;
const bootstrapToken = requireBootstrapToken(rawBootstrapToken);

process.stdout.write("正在确认本地数据库与应用服务…\n");
runQuietly("npx", ["supabase", "start"], runtimeEnv);
const local = parseEnv(
  runQuietly("npx", ["supabase", "status", "-o", "env"], runtimeEnv),
);
if (!local.API_URL || !local.SERVICE_ROLE_KEY || !local.PUBLISHABLE_KEY) {
  throw new Error("Supabase 本地状态缺少应用启动所需字段。");
}
const edgeEnvFile = createEdgeEnvFile(
  bootstrapToken,
  local.PUBLISHABLE_KEY,
  local.API_URL,
);
process.once("exit", edgeEnvFile.cleanup);

const sharedEnv = {
  ...withLocalProviderSecrets(runtimeEnv),
  SUPABASE_URL: local.API_URL,
  SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
  VITE_SUPABASE_URL: local.API_URL,
  VITE_SB_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
};

const edge = spawn(
  "npx",
  ["supabase", "functions", "serve", "--env-file", edgeEnvFile.path],
  {
    cwd: process.cwd(),
    env: runtimeEnv,
    stdio: "inherit",
  },
);
const worker = spawn("npm", ["run", "worker:dev"], {
  cwd: process.cwd(),
  env: sharedEnv,
  stdio: "inherit",
});
const app = spawn("npm", ["run", "dev"], {
  cwd: process.cwd(),
  env: sharedEnv,
  stdio: "inherit",
});

let stopping = false;
function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of [edge, worker, app]) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }
  }
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

const exitCode = await new Promise((resolve) => {
  let settled = false;
  const finish = (code) => {
    if (settled) return;
    settled = true;
    stop();
    resolve(code ?? 1);
  };
  for (const child of [edge, worker, app]) {
    child.once("error", () => finish(1));
    child.once("exit", finish);
  }
});

edgeEnvFile.cleanup();
process.exitCode = exitCode;
