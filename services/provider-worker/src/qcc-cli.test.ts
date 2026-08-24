import { describe, expect, it } from "vitest";
import { QccCliClient, type QccCliRunner } from "./qcc-cli";

class RecordingRunner implements QccCliRunner {
  calls: { file: string; args: string[] }[] = [];

  constructor(private readonly stdout: string) {}

  async run(file: string, args: string[]) {
    this.calls.push({ file, args });
    return { stdout: this.stdout, stderr: "" };
  }
}

describe("QccCliClient", () => {
  it("uses an argv allowlist and parses the JSON after CLI progress text", async () => {
    const runner = new RecordingRunner(
      '正在调用 company/get_company_registration_info...\n\n{"企业名称":"示例企业","统一社会信用代码":"91320000TEST000001"}\n',
    );
    const client = new QccCliClient("/usr/local/bin/qcc", runner);

    await expect(
      client.query("company_registration", "示例企业"),
    ).resolves.toMatchObject({ 企业名称: "示例企业" });
    expect(runner.calls[0]).toEqual({
      file: "/usr/local/bin/qcc",
      args: [
        "company",
        "get_company_registration_info",
        "--json",
        "--searchKey",
        "示例企业",
      ],
    });
  });

  it("rejects every capability outside the verified allowlist", async () => {
    const runner = new RecordingRunner("{}\n");
    const client = new QccCliClient("qcc", runner);
    await expect(
      client.query("company_risk_scan" as never, "示例企业"),
    ).rejects.toThrow("QCC_CAPABILITY_UNSUPPORTED");
    expect(runner.calls).toHaveLength(0);
  });

  it("rejects control characters before invoking the executable", async () => {
    const runner = new RecordingRunner("{}\n");
    const client = new QccCliClient("qcc", runner);
    await expect(
      client.query("company_registration", "bad\nvalue"),
    ).rejects.toThrow("QCC_SEARCH_KEY_INVALID");
    expect(runner.calls).toHaveLength(0);
  });
});
