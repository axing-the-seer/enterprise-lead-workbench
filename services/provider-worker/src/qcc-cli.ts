import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Only capabilities verified against the installed QCC CLI belong here.
// Expanding this allowlist requires a captured provider contract and an
// adapter test; a configured remote MCP alone is not enough.
export type QccCapability = "company_registration";

interface CommandSpec {
  server: "company" | "risk";
  tool: string;
  inputFlag: "--searchKey";
}

const COMMANDS: Record<QccCapability, CommandSpec> = {
  company_registration: {
    server: "company",
    tool: "get_company_registration_info",
    inputFlag: "--searchKey",
  },
};

export interface QccCliRunner {
  run(
    file: string,
    args: string[],
  ): Promise<{ stdout: string; stderr: string }>;
}

const defaultRunner: QccCliRunner = {
  async run(file, args) {
    const result = await execFileAsync(file, args, {
      timeout: 45_000,
      maxBuffer: 5 * 1024 * 1024,
      windowsHide: true,
      env: process.env,
    });
    return { stdout: result.stdout, stderr: result.stderr };
  },
};

function extractJson(stdout: string): unknown {
  const objectStart = stdout.indexOf("{");
  const arrayStart = stdout.indexOf("[");
  const candidates = [objectStart, arrayStart].filter((index) => index >= 0);
  if (candidates.length === 0) {
    throw new Error("QCC_CLI_RESPONSE_NOT_JSON");
  }
  const start = Math.min(...candidates);
  const opener = stdout[start];
  const end =
    opener === "{" ? stdout.lastIndexOf("}") : stdout.lastIndexOf("]");
  if (end <= start) throw new Error("QCC_CLI_RESPONSE_TRUNCATED");
  try {
    return JSON.parse(stdout.slice(start, end + 1));
  } catch {
    throw new Error("QCC_CLI_RESPONSE_INVALID_JSON");
  }
}

function validateSearchKey(searchKey: string): string {
  const normalized = searchKey.trim();
  if (normalized.length < 2 || normalized.length > 160) {
    throw new Error("QCC_SEARCH_KEY_INVALID");
  }
  if ([...normalized].some((character) => character.charCodeAt(0) <= 31)) {
    throw new Error("QCC_SEARCH_KEY_INVALID");
  }
  return normalized;
}

export class QccCliClient {
  constructor(
    private readonly executable = process.env.QCC_CLI_PATH || "qcc",
    private readonly runner: QccCliRunner = defaultRunner,
  ) {}

  async testConnection(): Promise<{ version: string }> {
    const { stdout } = await this.runner.run(this.executable, ["--version"]);
    const version = stdout.trim();
    if (!/^\d+\.\d+\.\d+/.test(version)) {
      throw new Error("QCC_CLI_VERSION_UNRECOGNIZED");
    }
    return { version };
  }

  async query(capability: QccCapability, searchKey: string): Promise<unknown> {
    const command = COMMANDS[capability];
    if (!command) throw new Error("QCC_CAPABILITY_UNSUPPORTED");
    const safeSearchKey = validateSearchKey(searchKey);
    const { stdout } = await this.runner.run(this.executable, [
      command.server,
      command.tool,
      "--json",
      command.inputFlag,
      safeSearchKey,
    ]);
    return extractJson(stdout);
  }
}
