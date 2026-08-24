export type ReportEvidence = {
  id: string;
  title: string;
  url: string;
  sourceName?: string;
  kind?: string;
  publishedAt?: string | null;
  capturedAt?: string | null;
};

export type ReportInsight = {
  title: string;
  summary: string;
  confidence: "high" | "medium" | "low";
  evidenceIds: string[];
  happenedAt?: string | null;
};

export type CompanyAgentAnalysis = {
  schemaVersion: "company-agent-analysis.v1";
  title?: string;
  executiveSummary: string;
  executiveEvidenceIds: string[];
  businessProfile: ReportInsight[];
  growthSignals: ReportInsight[];
  recentEvents: ReportInsight[];
  opportunities: ReportInsight[];
  risks: ReportInsight[];
  recommendedActions: ReportInsight[];
  limitations: string[];
};

export function renderAgentCompanyReport(input: {
  reportId: string;
  revision: number;
  submittedAt: string;
  agentName: string;
  company: Record<string, unknown>;
  evidence: ReportEvidence[];
  analysis: CompanyAgentAnalysis;
}) {
  const companyName = text(input.company.name) || "企业";
  const title = customerReportText(
    input.analysis.title || `${companyName} 企业调研报告`,
  );
  const citedEvidenceIds = new Set([
    ...input.analysis.executiveEvidenceIds,
    ...[
      ...input.analysis.businessProfile,
      ...input.analysis.growthSignals,
      ...input.analysis.recentEvents,
      ...input.analysis.opportunities,
      ...input.analysis.risks,
      ...input.analysis.recommendedActions,
    ].flatMap((item) => item.evidenceIds),
  ]);
  const citedEvidence = input.evidence.filter((item) =>
    citedEvidenceIds.has(item.id),
  );
  const citationNumbers = new Map(
    citedEvidence.map((item, index) => [item.id, index + 1]),
  );
  const sections = [
    section("企业与业务理解", input.analysis.businessProfile, citationNumbers),
    section("发展与招聘信号", input.analysis.growthSignals, citationNumbers),
    timelineSection(input.analysis.recentEvents, citationNumbers),
    section("潜在合作机会", input.analysis.opportunities, citationNumbers),
    section("风险与不确定性", input.analysis.risks, citationNumbers),
    section("建议下一步", input.analysis.recommendedActions, citationNumbers),
  ].join("");
  const executiveCitations = citations(
    input.analysis.executiveEvidenceIds,
    citationNumbers,
  );
  const limitations = input.analysis.limitations.length
    ? `<ul>${input.analysis.limitations
        .map((item) => `<li>${escapeHtml(customerReportText(item))}</li>`)
        .join("")}</ul>`
    : "<p>暂未补充其他限制。报告仍应结合原始链接和最新工商数据复核。</p>";
  const appendix = citedEvidence.length
    ? `<ol class="sources">${citedEvidence
        .map(
          (item, index) =>
            `<li id="source-${
              citationNumbers.get(item.id) ?? index + 1
            }"><span class="source-id">资料 ${
              citationNumbers.get(item.id) ?? index + 1
            }</span><div><a href="${escapeAttr(
              safeUrl(item.url),
            )}" target="_blank" rel="noopener noreferrer">${escapeHtml(
              item.title,
            )}</a><p>${escapeHtml(item.sourceName || domain(item.url))}${
              item.publishedAt
                ? ` · ${escapeHtml(formatDate(item.publishedAt))}`
                : ""
            }</p></div></li>`,
        )
        .join("")}</ol>`
    : "<p>本次没有可引用的公开证据。</p>";

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(
    title,
  )}</title><style>
:root{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#132238;background:#f3f6fa;line-height:1.7}*{box-sizing:border-box}body{margin:0;background:#f3f6fa}.page{max-width:1080px;margin:auto;padding:34px 24px 72px}.cover,.panel{background:#fff;border:1px solid #e4eaf1;border-radius:22px;box-shadow:0 10px 35px rgba(24,45,76,.05)}.cover{padding:38px;background:linear-gradient(145deg,#071d3f,#0d3975);color:#fff}.brand{font-size:12px;letter-spacing:.12em;color:#9ec8ff}.cover h1{font-size:34px;line-height:1.3;margin:14px 0 8px;letter-spacing:-.03em}.cover p{margin:0;color:#cad9ed}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:26px}.meta div{padding:13px;border-radius:14px;background:rgba(255,255,255,.09)}.meta b{display:block;font-size:12px;color:#9ec8ff}.meta span{font-size:13px}.panel{margin-top:16px;padding:28px}.panel h2{margin:0 0 18px;font-size:20px}.summary{font-size:16px;color:#233b5b}.cards{display:grid;gap:12px}.card{border:1px solid #e4eaf1;border-radius:16px;padding:17px}.card-head{display:flex;justify-content:space-between;gap:14px}.card h3{font-size:15px;margin:0}.card p{margin:8px 0 0;color:#425875;font-size:14px}.confidence{white-space:nowrap;border-radius:999px;padding:2px 9px;font-size:11px;background:#eef5ff;color:#075fb8}.confidence.low{background:#fff3e7;color:#9a5600}.confidence.medium{background:#f4f0ff;color:#6941c6}.cite{font-size:11px;color:#6f8198;margin-left:6px}.cite a{color:#075fb8;text-decoration:none}.facts{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.fact{padding:13px 15px;border-radius:14px;background:#f5f7fa}.fact b{display:block;font-size:11px;color:#718198}.fact span{font-size:14px}.sources{list-style:none;padding:0;margin:0}.sources li{display:flex;gap:12px;padding:13px 0;border-bottom:1px solid #e9edf2}.source-id{font:12px ui-monospace,monospace;color:#60748d}.sources a{font-size:13px;color:#075fb8;text-decoration:none}.sources p{font-size:11px;color:#76869a;margin:3px 0}.foot{text-align:center;color:#7c8ca0;font-size:11px;margin-top:18px}@media(max-width:720px){.page{padding:12px}.cover,.panel{border-radius:17px;padding:21px}.cover h1{font-size:26px}.meta,.facts{grid-template-columns:1fr 1fr}}
</style></head><body><main class="page"><section class="cover"><div class="brand">企业名单工作台 · 企业调研报告</div><h1>${escapeHtml(
    title,
  )}</h1><p>${escapeHtml(
    companyName,
  )}</p><div class="meta"><div><b>报告版本</b><span>第 ${input.revision} 版</span></div><div><b>内容整理</b><span>${escapeHtml(
    input.agentName,
  )}</span></div><div><b>参考资料</b><span>${citedEvidence.length} 条</span></div><div><b>生成时间</b><span>${escapeHtml(
    formatDate(input.submittedAt),
  )}</span></div></div></section>
<section class="panel"><h2>结论摘要</h2><p class="summary">${escapeHtml(
    customerReportText(input.analysis.executiveSummary),
  )} ${executiveCitations}</p></section>
<section class="panel"><h2>企业概况</h2><div class="facts">${fact(
    "统一社会信用代码",
    input.company.unified_social_credit_code,
  )}${fact("经营状态", operatingStatus(input.company.operating_status))}${fact(
    "法定代表人",
    input.company.legal_representative,
  )}${fact("注册资本", capital(input.company))}${fact(
    "成立日期",
    input.company.established_on,
  )}${fact("行业", input.company.industry_name)}${fact(
    "地区",
    region(input.company),
  )}${fact("参保人数", input.company.insured_employee_count)}${fact(
    "工商数据来源",
    sourceLabel(input.company.primary_source),
  )}</div></section>
${sections}<section class="panel"><h2>分析限制</h2>${limitations}</section><section class="panel"><h2>参考资料</h2>${appendix}</section><p class="foot">公开网页资料由 Ego Lite 采集，内容整理与判断由 ${escapeHtml(
    input.agentName,
  )} 完成。本报告不能替代法律、征信或专项尽职调查。</p></main></body></html>`;
}

function section(
  heading: string,
  items: ReportInsight[],
  citationNumbers: Map<string, number>,
) {
  return `<section class="panel"><h2>${escapeHtml(heading)}</h2>${
    items.length
      ? `<div class="cards">${items
          .map((item) => card(item, citationNumbers))
          .join("")}</div>`
      : "<p>当前资料不足，暂未形成该部分结论。</p>"
  }</section>`;
}

function timelineSection(
  items: ReportInsight[],
  citationNumbers: Map<string, number>,
) {
  const ordered = [...items].sort((a, b) =>
    String(b.happenedAt || "").localeCompare(String(a.happenedAt || "")),
  );
  return section("近期公开动态", ordered, citationNumbers);
}

function card(item: ReportInsight, citationNumbers: Map<string, number>) {
  return `<article class="card"><div class="card-head"><h3>${escapeHtml(
    customerReportText(item.title),
  )}</h3><span class="confidence ${item.confidence}">${confidenceLabel(
    item.confidence,
  )}</span></div>${
    item.happenedAt
      ? `<small>${escapeHtml(formatDate(item.happenedAt))}</small>`
      : ""
  }<p>${escapeHtml(customerReportText(item.summary))} ${citations(
    item.evidenceIds,
    citationNumbers,
  )}</p></article>`;
}

function citations(ids: string[], citationNumbers: Map<string, number>) {
  const valid = ids.filter((id) => citationNumbers.has(id));
  return `<span class="cite">${valid
    .map(
      (id) =>
        `<a href="#source-${citationNumbers.get(id)}">[${citationNumbers.get(
          id,
        )}]</a>`,
    )
    .join(" ")}</span>`;
}

export function customerReportText(value: string) {
  const quarterNames = ["", "一", "二", "三", "四"];
  return value
    .replace(/\\([_*()[\]{}#])/g, "$1")
    .replace(/\bev-[0-9]{3}\s*[/,，、~～—–-]\s*ev-[0-9]{3}\b/gi, "")
    .replace(/\bev-[0-9]{3}\b/gi, "")
    .replace(/\bUSCC\b/gi, "统一社会信用代码")
    .replace(/\bbroad_context\b/gi, "集团或行业背景信息")
    .replace(/\brelated_entity\b/gi, "关联主体信息")
    .replace(/\bexact_company\b/gi, "当前企业信息")
    .replace(/\bpaid_in_capital(?:_amount)?\b/gi, "实缴资本")
    .replace(/\bpaid_in\b/gi, "实缴资本")
    .replace(/\binsuredCount\b/g, "参保人数")
    .replace(/\btags\.risk\b/gi, "风险信息")
    .replace(/\bqcc\b/gi, "企查查")
    .replace(/\bcapex\b/gi, "资本开支")
    .replace(/\bAll in AI\b/gi, "全面投入人工智能")
    .replace(/\bAI\b/gi, "人工智能")
    .replace(/\bISV\b/gi, "软件服务商")
    .replace(/\bSaaS\b/gi, "软件服务")
    .replace(/\bB2B\b/gi, "企业间电子商务")
    .replace(
      /\bQ([1-4])\b/gi,
      (_, quarter: string) => `第${quarterNames[Number(quarter)]}季度`,
    )
    .replace(/\+(\d+(?:\.\d+)?)%/g, "增长$1%")
    .replace(/-(\d+(?:\.\d+)?)%/g, "下降$1%")
    .replace(/\s*[（(]www-1688\.com\.cn[）)]/gi, "")
    .replace(/([（(])\s*[/,，、;；~～—–-]+\s*/g, "$1")
    .replace(/\s*[/,，、;；~～—–-]+\s*([）)])/g, "$1")
    .replace(/[（(]\s*[）)]/g, "")
    .replace(/([（(])\s+/g, "$1")
    .replace(/\s+([，。；：、）)])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function fact(label: string, value: unknown) {
  const display =
    value === null || value === undefined || value === ""
      ? "待核实"
      : String(value);
  return `<div class="fact"><b>${escapeHtml(label)}</b><span>${escapeHtml(
    display,
  )}</span></div>`;
}

function capital(company: Record<string, unknown>) {
  const amount = company.registered_capital_amount;
  if (amount === null || amount === undefined || amount === "") return "待核实";
  const numeric = Number(amount);
  const currency = text(company.registered_capital_currency) || "CNY";
  if (!Number.isFinite(numeric)) return "待核实";
  const amountWan = numeric / 10_000;
  const formatted = amountWan.toLocaleString("zh-CN", {
    maximumFractionDigits: 4,
  });
  return currency === "CNY"
    ? `${formatted} 万元`
    : `${formatted} 万元（${currency}）`;
}

function region(company: Record<string, unknown>) {
  const normalized = [company.province, company.city, company.district]
    .map(text)
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .join(" ");
  return normalized || text(company.region_text) || "待核实";
}

function operatingStatus(value: unknown) {
  const normalized = text(value);
  if (normalized === "active") return "正常经营";
  if (normalized === "cancelled") return "注销";
  if (normalized === "revoked") return "吊销";
  return normalized || "待核实";
}

function sourceLabel(value: unknown) {
  const normalized = text(value).toLowerCase();
  if (normalized === "qcc" || normalized === "qichacha") return "企查查";
  if (normalized === "huoke_assistant") return "获客助手";
  return text(value) || "待核实";
}

function text(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : value == null
      ? ""
      : String(value);
}

function confidenceLabel(value: ReportInsight["confidence"]) {
  return value === "high"
    ? "高置信度"
    : value === "medium"
      ? "中置信度"
      : "低置信度";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Shanghai",
      }).format(date);
}

function domain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "公开网页";
  }
}

function safeUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : "#";
  } catch {
    return "#";
  }
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]!,
  );
}

function escapeAttr(value: string) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
