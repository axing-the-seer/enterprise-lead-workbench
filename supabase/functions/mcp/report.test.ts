import { renderAgentCompanyReport } from "./report.ts";

function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `expected ${JSON.stringify(expected)}, received ${JSON.stringify(
        actual,
      )}`,
    );
  }
}

Deno.test("Agent 报告使用固定版式、引用证据并转义非安全内容", () => {
  const html = renderAgentCompanyReport({
    reportId: "report-001",
    revision: 1,
    submittedAt: "2026-08-24T03:00:00.000Z",
    agentName: "WorkBuddy <script>alert(1)</script>",
    company: {
      name: "上海测试&企业",
      unified_social_credit_code: "91310000TEST",
      operating_status: "active",
      province: "上海市",
      industry_name: "专用设备制造",
      registered_capital_amount: 710_000_000,
      registered_capital_currency: "CNY",
      primary_source: "qcc",
    },
    evidence: [
      {
        id: "ev-001",
        title: "官网产品页",
        url: "https://example.com/product",
        sourceName: "企业官网",
      },
      {
        id: "ev-002",
        title: "不安全链接",
        url: "javascript:alert(1)",
      },
    ],
    analysis: {
      schemaVersion: "company-agent-analysis.v1",
      executiveSummary:
        "企业（USCC 91310000TEST）具备专用设备产品线（ev-001），该内容属于 broad_context。",
      executiveEvidenceIds: ["ev-001"],
      businessProfile: [
        {
          title: "产品能力",
          summary:
            "ev-001显示官网展示了两类专用设备，paid_in_capital 尚待核实。",
          confidence: "high",
          evidenceIds: ["ev-001"],
        },
      ],
      growthSignals: [],
      recentEvents: [],
      opportunities: [],
      risks: [],
      recommendedActions: [],
      limitations: ["仅引用本任务 ev-001，未取得客户名单。"],
    },
  });

  assert(html.startsWith("<!doctype html>"));
  for (const heading of [
    "结论摘要",
    "企业概况",
    "企业与业务理解",
    "潜在合作机会",
    "风险与不确定性",
    "建议下一步",
    "参考资料",
  ]) {
    assert(html.includes(heading), `缺少报告板块：${heading}`);
  }
  assert(html.includes('href="#source-1"'));
  assert(html.includes(">[1]</a>"));
  assert(html.includes(">资料 1</span>"));
  assert(html.includes("71,000 万元"));
  assert(html.includes("正常经营"));
  assert(html.includes("上海市"));
  assert(html.includes("企查查"));
  assert(html.includes("内容整理"));
  assertEquals(html.includes("USCC"), false);
  assertEquals(html.includes("broad_context"), false);
  assertEquals(html.includes("paid_in_capital"), false);
  assertEquals(html.includes("ev-001"), false);
  assertEquals(html.includes("AGENT 分析报告"), false);
  assertEquals(html.includes("不安全链接"), false);
  assert(html.includes("WorkBuddy &lt;script&gt;alert(1)&lt;/script&gt;"));
  assertEquals(html.includes('href="javascript:'), false);
  assertEquals(html.includes("<script>alert(1)</script>"), false);
});
