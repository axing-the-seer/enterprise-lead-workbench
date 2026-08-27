import { execFileSync, spawn } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { withLocalProviderSecrets } from "./local-provider-env.mjs";
import {
  resolveLocalBootstrapToken,
  resolveLocalSingleUserEmail,
} from "./local-single-user.mjs";

const requestedRoot =
  process.env.WORKBENCH_ACCEPTANCE_ROOT ?? ".supabase-acceptance";
const acceptanceRoot = resolve(requestedRoot);
const acceptanceSupabase = join(acceptanceRoot, "supabase");
const appPort = parsePort(
  process.env.WORKBENCH_ACCEPTANCE_APP_PORT ?? "5175",
  "WORKBENCH_ACCEPTANCE_APP_PORT",
);
const portOffset = parsePortOffset(
  process.env.WORKBENCH_ACCEPTANCE_PORT_OFFSET ?? "0",
);
const appUrl = `http://127.0.0.1:${appPort}/`;
const localSingleUserMode =
  process.env.WORKBENCH_ACCEPTANCE_LOCAL_SINGLE_USER !== "false";

if (
  acceptanceRoot === resolve(".") ||
  !acceptanceRoot.startsWith(`${resolve(".")}/`) ||
  !acceptanceRoot.split("/").at(-1)?.startsWith(".supabase-")
) {
  throw new Error(
    "WORKBENCH_ACCEPTANCE_ROOT 必须是项目内以 .supabase- 开头的隔离目录。",
  );
}

function parsePort(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) {
    throw new Error(`${label} 必须是 1024–65535 的整数。`);
  }
  return parsed;
}

function parsePortOffset(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1000) {
    throw new Error("WORKBENCH_ACCEPTANCE_PORT_OFFSET 必须是 0–1000 的整数。");
  }
  return parsed;
}

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

function createEdgeEnvFile(
  bootstrapToken,
  publishableKey,
  apiUrl,
  singleUserMode,
) {
  const directory = mkdtempSync(
    join(tmpdir(), "enterprise-lead-workbench-acceptance-edge-"),
  );
  chmodSync(directory, 0o700);
  const path = join(directory, "bootstrap.env");
  const escapedToken = bootstrapToken
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"');
  writeFileSync(
    path,
    `WORKBENCH_BOOTSTRAP_TOKEN="${escapedToken}"\nWORKBENCH_LOCAL_SINGLE_USER="${singleUserMode ? "true" : "false"}"\nWORKBENCH_PUBLIC_ORIGIN="${apiUrl}"\nSB_PUBLISHABLE_KEY="${publishableKey}"\nSB_JWT_ISSUER="${apiUrl}/auth/v1"\n`,
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

function prepareAcceptanceProject() {
  mkdirSync(acceptanceSupabase, { recursive: true, mode: 0o700 });
  const sourceConfig = readFileSync("supabase/config.e2e.toml", "utf8");
  const rootName = acceptanceRoot.split("/").at(-1) ?? ".supabase-acceptance";
  const acceptanceProjectId =
    rootName === ".supabase-acceptance"
      ? "enterprise-lead-workbench-acceptance"
      : `enterprise-lead-workbench-${rootName.replace(/[^a-z0-9-]/gi, "-")}`;
  const acceptanceConfig = sourceConfig
    .replace(
      'project_id = "atomic-crm-e2e"',
      `project_id = "${acceptanceProjectId}"`,
    )
    .replace(
      /port = (5434\d)/g,
      (_match, value) => `port = ${Number(value) + portOffset}`,
    )
    .replaceAll("http://localhost:5175", appUrl.slice(0, -1))
    .replaceAll("https://localhost:5175", appUrl.slice(0, -1));
  writeFileSync(join(acceptanceSupabase, "config.toml"), acceptanceConfig, {
    encoding: "utf8",
    mode: 0o600,
  });

  for (const directory of [
    "migrations",
    "schemas",
    "functions",
    "templates",
    "tests",
  ]) {
    cpSync(join("supabase", directory), join(acceptanceSupabase, directory), {
      recursive: true,
      force: true,
    });
  }
  for (const file of ["seed.sql", "signing_keys.json"]) {
    cpSync(join("supabase", file), join(acceptanceSupabase, file), {
      force: true,
    });
  }
}

async function waitForReady(apiUrl, children) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const exited = children.find(
      (child) => child.exitCode !== null || child.signalCode !== null,
    );
    if (exited) {
      throw new Error("验收服务在就绪前退出，请查看上方日志。");
    }
    try {
      const [auth, bootstrap, app] = await Promise.all([
        fetch(`${apiUrl}/auth/v1/health`),
        fetch(`${apiUrl}/functions/v1/bootstrap-admin`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "status" }),
        }),
        fetch(appUrl),
      ]);
      if (auth.ok && bootstrap.ok && app.ok) return;
    } catch {
      // Services start at different speeds; retry until the bounded deadline.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 750));
  }
  throw new Error("验收环境在 60 秒内未就绪，请检查 Docker 与服务日志。");
}

const { WORKBENCH_BOOTSTRAP_TOKEN: rawBootstrapToken, ...runtimeEnv } =
  process.env;
const bootstrapToken = resolveLocalBootstrapToken(rawBootstrapToken);

prepareAcceptanceProject();
process.stdout.write("正在启动隔离验收数据库…\n");
runQuietly(
  "npx",
  ["supabase", "start", "--workdir", acceptanceRoot],
  runtimeEnv,
);
runQuietly(
  "npx",
  ["supabase", "migration", "up", "--workdir", acceptanceRoot],
  runtimeEnv,
);
const local = parseEnv(
  runQuietly(
    "npx",
    ["supabase", "status", "--workdir", acceptanceRoot, "-o", "env"],
    runtimeEnv,
  ),
);
if (!local.API_URL || !local.SERVICE_ROLE_KEY || !local.PUBLISHABLE_KEY) {
  throw new Error("隔离 Supabase 状态缺少应用启动所需字段。");
}
const edgeEnvFile = createEdgeEnvFile(
  bootstrapToken,
  local.PUBLISHABLE_KEY,
  local.API_URL,
  localSingleUserMode,
);
process.once("exit", edgeEnvFile.cleanup);
const localSingleUserEmail = localSingleUserMode
  ? await resolveLocalSingleUserEmail(local.API_URL, local.SERVICE_ROLE_KEY)
  : "";

writeFileSync(
  join(acceptanceRoot, ".env.e2e"),
  [
    `VITE_SUPABASE_URL=${local.API_URL}`,
    `VITE_SB_PUBLISHABLE_KEY=${local.PUBLISHABLE_KEY}`,
    `SERVICE_ROLE_KEY=${local.SERVICE_ROLE_KEY}`,
    `WORKBENCH_BOOTSTRAP_TOKEN=${bootstrapToken}`,
    `VITE_LOCAL_SINGLE_USER=${localSingleUserMode ? "true" : "false"}`,
    "VITE_IS_DEMO=false",
    "VITE_ATTACHMENTS_BUCKET=attachments",
    "",
  ].join("\n"),
  { encoding: "utf8", mode: 0o600 },
);

const sharedEnv = {
  ...withLocalProviderSecrets(runtimeEnv),
  SUPABASE_URL: local.API_URL,
  SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
  VITE_SUPABASE_URL: local.API_URL,
  VITE_SB_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
  VITE_LOCAL_SINGLE_USER: localSingleUserMode ? "true" : "false",
  ...(localSingleUserEmail
    ? { VITE_LOCAL_SINGLE_USER_EMAIL: localSingleUserEmail }
    : {}),
  VITE_CACHE_DIR: join(acceptanceRoot, "vite-cache"),
};

const edge = spawn(
  "npx",
  [
    "supabase",
    "functions",
    "serve",
    "--workdir",
    acceptanceRoot,
    "--env-file",
    edgeEnvFile.path,
  ],
  { cwd: process.cwd(), env: runtimeEnv, stdio: "inherit" },
);
const worker = spawn("npm", ["run", "worker:dev"], {
  cwd: process.cwd(),
  env: sharedEnv,
  stdio: "inherit",
});
const app = spawn(
  "npx",
  ["vite", "--port", String(appPort), "--force", "--mode", "e2e"],
  { cwd: process.cwd(), env: sharedEnv, stdio: "inherit" },
);
const children = [edge, worker, app];

let stopping = false;
function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null)
      child.kill(signal);
  }
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

try {
  await waitForReady(local.API_URL, children);
  process.stdout.write(
    `\n隔离验收环境已就绪：${appUrl}\n数据库保存在 ${requestedRoot}；退出不会影响其他本地项目。\n\n`,
  );
} catch (error) {
  stop();
  edgeEnvFile.cleanup();
  throw error;
}

const exitCode = await new Promise((resolveExit) => {
  let settled = false;
  const finish = (code) => {
    if (settled) return;
    settled = true;
    stop();
    resolveExit(code ?? 1);
  };
  for (const child of children) {
    child.once("error", () => finish(1));
    child.once("exit", finish);
  }
});

edgeEnvFile.cleanup();
process.exitCode = exitCode;
