import { spawn } from "node:child_process";
import { WorkerError } from "./errors";

const OUTPUT_MARKER = "EGO_PUBLIC_REPORT_JSON:";
const DEFAULT_EXECUTABLE = "ego-browser";
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

export type EgoEvidenceKind = "official_website" | "recruiting" | "news";

export type EgoEvidenceItem = {
  kind: EgoEvidenceKind;
  query: string;
  title: string;
  url: string;
  snippet: string;
  sourceName: string;
  relevance: "exact_company" | "related_entity" | "broad_context";
  linkKind: "direct" | "search_redirect";
};

export type EgoSearchResult = {
  generatedAt: string;
  engine: "ego_lite";
  companyName: string;
  coverage: Array<{
    kind: EgoEvidenceKind;
    query: string;
    status: "complete" | "partial" | "blocked";
    note: string;
    count: number;
  }>;
  items: EgoEvidenceItem[];
};

export async function testEgoBrowser(
  executable = process.env.EGO_BROWSER_PATH || DEFAULT_EXECUTABLE,
) {
  const taskName = `ego-lite-health-${process.pid}`;
  const script = `
const task = await useOrCreateTaskSpace(${JSON.stringify(taskName)})
let status = { ok: false }
try {
  await openOrReuseTab('https://example.com', { wait: true, timeout: 20 })
  const info = await pageInfo()
  status = { ok: Boolean(info && info.title), title: info && info.title }
} finally {
  cliLog(${JSON.stringify(OUTPUT_MARKER)} + JSON.stringify(status))
  await completeTaskSpace(task.id, { keep: false })
}
`;
  const parsed = await runEgoScript(executable, script, 45_000);
  if (!parsed || parsed.ok !== true) {
    throw new WorkerError(
      "EGO_LITE_HEALTH_FAILED",
      "Ego Lite 未能完成本机浏览器检查。",
    );
  }
  return { executable, browserTitle: String(parsed.title ?? "") };
}

export async function searchCompanyPublicInformation(input: {
  companyName: string;
  maxResults: number;
  executable?: string;
}): Promise<EgoSearchResult> {
  const companyName = replaceControlCharacters(input.companyName).trim();
  if (companyName.length < 2 || companyName.length > 200) {
    throw new WorkerError(
      "EGO_REPORT_COMPANY_INVALID",
      "企业名称不适合生成公开信息报告。",
    );
  }
  const maxResults = Math.max(1, Math.min(8, Math.trunc(input.maxResults)));
  const taskName = `企业公开信息报告-${companyName.slice(0, 28)}-${Date.now()}`;
  const executable =
    input.executable || process.env.EGO_BROWSER_PATH || DEFAULT_EXECUTABLE;
  const script = `
const companyName = ${JSON.stringify(companyName)}
const maxResults = ${maxResults}
const task = await useOrCreateTaskSpace(${JSON.stringify(taskName)})
const definitions = [
  { kind: 'official_website', suffix: '官网 官方网站 产品 服务' },
  { kind: 'recruiting', suffix: '招聘 招聘信息 BOSS 直聘 猎聘 智联 前程无忧' },
  { kind: 'news', suffix: '新闻 动态 报道' },
]
const output = { generatedAt: new Date().toISOString(), engine: 'ego_lite', companyName, coverage: [], items: [] }
try {
  for (const definition of definitions) {
    const query = companyName + ' ' + definition.suffix
    const url = 'https://www.baidu.com/s?wd=' + encodeURIComponent(query)
    let status = 'complete'
    let note = '已读取公开搜索结果页；未绕过登录或访问限制。'
    let items = []
    try {
      await openOrReuseTab(url, { wait: true, timeout: 25 })
      await wait(1)
      const pageText = String(await js(String.raw\`document.body ? document.body.innerText.slice(0, 3000) : ''\`))
      if (/安全验证|请输入验证码|访问受限/.test(pageText)) {
        status = 'blocked'
        note = '搜索页要求验证，已停止深入访问。'
      } else {
        items = await js(String.raw\`(() => {
          const blocks = [...document.querySelectorAll('#content_left .result, #content_left .c-container')]
          const rows = blocks.map((el) => {
            const a = el.querySelector('h3 a, a')
            const text = String(el.innerText || '').replace(/\\s+/g, ' ').trim()
            const parts = String(el.innerText || '').split('\\n').map((part) => part.trim()).filter(Boolean)
            return {
              title: String(a?.innerText || '').trim().slice(0, 300),
              url: String(a?.href || '').trim(),
              snippet: text.slice(0, 1200),
              sourceName: String(parts.at(-1) || '').slice(0, 120),
            }
          })
          return rows.filter((row) => row.title && /^https?:\\/\\//i.test(row.url) && !/baidu\\.com\\/s\\?/i.test(row.url))
        })()\`)
        if (!Array.isArray(items) || items.length === 0) {
          status = 'partial'
          note = '公开搜索页可访问，但没有提取到可引用结果。'
          items = []
        }
      }
    } catch (error) {
      status = 'partial'
      note = '该类公开来源读取不完整：' + String(error && error.message ? error.message : '页面不可访问').slice(0, 160)
      items = []
    }
    const deduped = []
    const seen = new Set()
    for (const item of items) {
      const key = item.title + '|' + item.url
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push({ kind: definition.kind, query, ...item })
      if (deduped.length >= maxResults) break
    }
    output.items.push(...deduped)
    output.coverage.push({ kind: definition.kind, query, status, note, count: deduped.length })
  }
  cliLog(${JSON.stringify(OUTPUT_MARKER)} + JSON.stringify(output))
} finally {
  await completeTaskSpace(task.id, { keep: false })
}
`;
  const parsed = await runEgoScript(executable, script, 150_000);
  return validateSearchResult(parsed, companyName);
}

export function buildPublicReportHtml(input: {
  reportId: string;
  companyName: string;
  creditCode: string | null;
  generatedAt: string;
  items: EgoEvidenceItem[];
  coverage: EgoSearchResult["coverage"];
}) {
  const official = input.items.filter(
    (item) => item.kind === "official_website",
  );
  const recruiting = input.items.filter((item) => item.kind === "recruiting");
  const news = input.items.filter((item) => item.kind === "news");
  const partial = input.coverage.some((item) => item.status !== "complete");
  const sourceCount = new Set(input.items.map((item) => item.url)).size;
  const topSummary =
    official[0]?.snippet ||
    "本次未从公开搜索结果中提取到可核验的官网与业务摘要。";
  const coverageRows = input.coverage
    .map(
      (item) =>
        `<tr><td>${kindLabel(item.kind)}</td><td><span class="status ${item.status}">${coverageLabel(item.status)}</span></td><td>${item.count}</td><td>${escapeHtml(item.note)}</td></tr>`,
    )
    .join("");
  const evidence = input.items
    .map(
      (item, index) =>
        `<li id="evidence-${index + 1}"><div class="evidence-head"><span>${escapeHtml(item.sourceName || kindLabel(item.kind))}</span><span>${kindLabel(item.kind)} · ${relevanceLabel(item.relevance)}</span></div><a href="${escapeAttribute(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a><p>${escapeHtml(item.snippet)}</p><small>${item.linkKind === "search_redirect" ? "搜索结果跳转链接 · " : "来源直达链接 · "}检索词：${escapeHtml(item.query)} · 抓取时间：${escapeHtml(input.generatedAt)}</small></li>`,
    )
    .join("");

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.companyName)}公开信息报告</title>
<style>
:root{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Microsoft YaHei",sans-serif;color:#1d1d1f;background:#f5f5f7;line-height:1.65}*{box-sizing:border-box}body{margin:0;background:#f5f5f7}.page{max-width:1080px;margin:0 auto;padding:46px 28px 80px}.cover,.section{background:#fff;border:1px solid rgba(0,0,0,.07);border-radius:24px;box-shadow:0 10px 36px rgba(0,0,0,.04)}.cover{padding:42px}.eyebrow{color:#0969da;font-size:13px;font-weight:650}.cover h1{font-size:34px;line-height:1.25;letter-spacing:-.035em;margin:14px 0 10px}.meta{color:#6e6e73;font-size:13px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:28px}.metric{background:#f5f5f7;border-radius:16px;padding:16px}.metric strong{display:block;font-size:22px}.metric span{font-size:12px;color:#6e6e73}.notice{margin-top:22px;padding:14px 16px;border-radius:14px;background:${partial ? "#fff7e8" : "#edf8f0"};color:${partial ? "#8a5300" : "#1c6533"};font-size:13px}.section{margin-top:18px;padding:30px}.section h2{font-size:21px;letter-spacing:-.02em;margin:0 0 18px}.section h3{font-size:15px;margin:22px 0 8px}.summary{font-size:15px;color:#3a3a3c}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.card{border:1px solid rgba(0,0,0,.07);border-radius:16px;padding:16px}.card a{font-weight:650;color:#075fb8;text-decoration:none}.card p{font-size:13px;color:#515154;margin:8px 0 0}.card small{color:#86868b}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:11px 10px;border-bottom:1px solid rgba(0,0,0,.07)}th{color:#6e6e73;font-weight:600}.status{padding:3px 8px;border-radius:999px;background:#edf8f0;color:#1c6533}.status.partial{background:#fff7e8;color:#8a5300}.status.blocked{background:#fff0ef;color:#a02d28}.evidence{padding-left:20px}.evidence li{padding:16px 0;border-bottom:1px solid rgba(0,0,0,.07)}.evidence a{display:block;margin-top:5px;color:#075fb8;font-weight:650;text-decoration:none}.evidence p{font-size:13px;color:#515154;margin:7px 0}.evidence small{color:#86868b}.evidence-head{display:flex;justify-content:space-between;color:#86868b;font-size:11px}.method{font-size:13px;color:#6e6e73}.footer{text-align:center;color:#86868b;font-size:11px;margin-top:22px}@media(max-width:720px){.page{padding:18px 12px 50px}.cover,.section{padding:22px;border-radius:18px}.cover h1{font-size:27px}.metrics,.cards{grid-template-columns:1fr}}
</style></head><body><main class="page">
<section class="cover"><div class="eyebrow">企业名单工作台 · 公开信息报告</div><h1>${escapeHtml(input.companyName)}</h1><p class="meta">统一社会信用代码：${escapeHtml(input.creditCode || "尚未获取")} · 报告版本：${escapeHtml(input.reportId)}</p><div class="metrics"><div class="metric"><strong>${sourceCount}</strong><span>条公开证据</span></div><div class="metric"><strong>${official.length}</strong><span>官网与业务</span></div><div class="metric"><strong>${recruiting.length + news.length}</strong><span>招聘与新闻</span></div></div><div class="notice">${partial ? "部分公开来源存在访问限制或结果不足；报告已明确标注，未绕过登录、验证码或网站限制。" : "三个公开来源类别均完成结果页检索。结论仅限本次可访问证据。"}</div></section>
<section class="section"><h2>报告摘要</h2><p class="summary">${escapeHtml(topSummary)}</p></section>
<section class="section"><h2>工商身份</h2><p class="summary">企业名称：${escapeHtml(input.companyName)}<br>统一社会信用代码：${escapeHtml(input.creditCode || "当前工商数据源未提供")}</p><p class="method">本节只展示名单工作台已有工商身份，不将网页片段覆盖为工商事实。</p></section>
<section class="section"><h2>官网与业务</h2>${cards(official)}</section>
<section class="section"><h2>招聘动态</h2>${cards(recruiting)}</section>
<section class="section"><h2>公开新闻</h2>${cards(news)}</section>
<section class="section"><h2>观察与不确定性</h2><table><thead><tr><th>来源类别</th><th>覆盖状态</th><th>结果数</th><th>说明</th></tr></thead><tbody>${coverageRows}</tbody></table><p class="method">证据按“匹配本企业、关联主体、行业背景”分级。搜索结果中的“未找到”只表示本次检索未获得证据，不表示相关事实不存在。搜索摘要可能过期或不完整，应打开原始链接复核。</p></section>
<section class="section"><h2>证据清单</h2>${evidence ? `<ol class="evidence">${evidence}</ol>` : '<p class="summary">本次没有提取到可引用的公开链接。</p>'}</section>
<section class="section"><h2>方法说明</h2><p class="method">报告由本机 Ego Lite 在隔离任务空间中生成。它分别检索“官网与业务”“招聘动态”“公开新闻”，保存标题、公开链接、搜索摘要、检索词和抓取时间。系统不绕过登录、验证码、反自动化或付费墙；不会把网页证据与企查查、获客助手工商事实合并成一个未经区分的结论。</p></section>
<p class="footer">生成时间 ${escapeHtml(input.generatedAt)} · 报告 ID ${escapeHtml(input.reportId)}</p></main></body></html>`;
}

async function runEgoScript(
  executable: string,
  script: string,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, ["nodejs"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(
        new WorkerError("EGO_LITE_TIMEOUT", "Ego Lite 公开信息检索超时。"),
      );
    }, timeoutMs);
    const finish = (error?: Error, value?: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value ?? {});
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (Buffer.byteLength(stdout) > MAX_OUTPUT_BYTES) {
        child.kill("SIGTERM");
        finish(
          new WorkerError(
            "EGO_LITE_OUTPUT_TOO_LARGE",
            "Ego Lite 返回内容超过安全限制。",
          ),
        );
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-16_000);
    });
    child.on("error", () =>
      finish(
        new WorkerError("EGO_LITE_UNAVAILABLE", "本机未能启动 Ego Lite。"),
      ),
    );
    child.on("close", (code) => {
      if (settled) return;
      // ego-browser writes cliLog to stderr when spawned without a terminal,
      // while an interactive shell commonly merges it into the visible output.
      // Accept the explicit marker from either stream and ignore all other logs.
      const markedOutput = `${stdout}\n${stderr}`;
      const markerIndex = markedOutput.lastIndexOf(OUTPUT_MARKER);
      if (markerIndex < 0) {
        finish(
          new WorkerError(
            "EGO_LITE_INVALID_OUTPUT",
            code === 0
              ? "Ego Lite 没有返回结构化结果。"
              : `Ego Lite 执行失败${stderr ? `：${safeDetail(stderr)}` : "。"}`,
          ),
        );
        return;
      }
      const jsonLine = markedOutput
        .slice(markerIndex + OUTPUT_MARKER.length)
        .split(/\r?\n/, 1)[0];
      try {
        const parsed = JSON.parse(jsonLine);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error("not object");
        finish(undefined, parsed as Record<string, unknown>);
      } catch {
        finish(
          new WorkerError(
            "EGO_LITE_INVALID_OUTPUT",
            "Ego Lite 返回的结构化结果无法解析。",
          ),
        );
      }
    });
    child.stdin.end(script);
  });
}

function validateSearchResult(
  value: Record<string, unknown>,
  companyName: string,
): EgoSearchResult {
  const coverage = Array.isArray(value.coverage) ? value.coverage : [];
  const items = Array.isArray(value.items) ? value.items : [];
  return {
    generatedAt:
      typeof value.generatedAt === "string"
        ? value.generatedAt
        : new Date().toISOString(),
    engine: "ego_lite",
    companyName,
    coverage: coverage.slice(0, 3).map((item) => {
      const row = object(item);
      const kind = evidenceKind(row.kind);
      const status = ["complete", "partial", "blocked"].includes(
        String(row.status),
      )
        ? (String(row.status) as "complete" | "partial" | "blocked")
        : "partial";
      return {
        kind,
        query: bounded(row.query, 400),
        status,
        note: bounded(row.note, 400),
        count: Math.max(0, Math.min(8, Number(row.count) || 0)),
      };
    }),
    items: rankEvidenceItems(
      items.slice(0, 24).flatMap((item) => {
        const row = object(item);
        const url = bounded(row.url, 2048);
        const title = bounded(row.title, 300);
        if (!title || !/^https?:\/\//i.test(url) || /\s/.test(url)) return [];
        const snippet = bounded(row.snippet, 1_200);
        return [
          {
            kind: evidenceKind(row.kind),
            query: bounded(row.query, 400),
            title,
            url,
            snippet,
            sourceName: bounded(row.sourceName, 120),
            relevance: classifyEvidenceRelevance(companyName, title, snippet),
            linkKind: /(?:^|\.)baidu\.com\/link\?/i.test(url)
              ? ("search_redirect" as const)
              : ("direct" as const),
          },
        ];
      }),
    ),
  };
}

export function classifyEvidenceRelevance(
  companyName: string,
  title: string,
  snippet: string,
): EgoEvidenceItem["relevance"] {
  const fullName = normalizeMatchText(companyName);
  const haystack = normalizeMatchText(`${title} ${snippet}`);
  if (fullName && haystack.includes(fullName)) return "exact_company";
  const shortName = fullName.replace(
    /(?:股份)?有限公司$|有限责任公司$|集团$/u,
    "",
  );
  return shortName.length >= 4 && haystack.includes(shortName)
    ? "related_entity"
    : "broad_context";
}

function rankEvidenceItems(items: EgoEvidenceItem[]) {
  const scores: Record<EgoEvidenceItem["relevance"], number> = {
    exact_company: 0,
    related_entity: 1,
    broad_context: 2,
  };
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) =>
        scores[left.item.relevance] - scores[right.item.relevance] ||
        left.index - right.index,
    )
    .map(({ item }) => item);
}

function normalizeMatchText(value: string) {
  return value.toLocaleLowerCase("zh-CN").replace(/[\s()（）·•._-]+/g, "");
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function bounded(value: unknown, max: number) {
  return typeof value === "string"
    ? replaceControlCharacters(value).trim().slice(0, max)
    : "";
}

function evidenceKind(value: unknown): EgoEvidenceKind {
  return value === "recruiting" || value === "news"
    ? value
    : "official_website";
}

function safeDetail(value: string) {
  return replaceControlCharacters(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function replaceControlCharacters(value: string) {
  return [...value]
    .map((character) => (character.charCodeAt(0) <= 31 ? " " : character))
    .join("");
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

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function kindLabel(kind: EgoEvidenceKind) {
  return kind === "official_website"
    ? "官网与业务"
    : kind === "recruiting"
      ? "招聘动态"
      : "公开新闻";
}

function coverageLabel(value: "complete" | "partial" | "blocked") {
  return value === "complete"
    ? "已检索"
    : value === "blocked"
      ? "访问受限"
      : "覆盖不完整";
}

function relevanceLabel(value: EgoEvidenceItem["relevance"]) {
  return value === "exact_company"
    ? "匹配本企业"
    : value === "related_entity"
      ? "关联主体"
      : "行业背景";
}

function cards(items: EgoEvidenceItem[]) {
  if (!items.length)
    return '<p class="summary">本次未提取到可引用结果；这不表示相关信息不存在。</p>';
  return `<div class="cards">${items
    .map(
      (item) =>
        `<article class="card"><small>${escapeHtml(item.sourceName || "公开网页")} · ${relevanceLabel(item.relevance)}</small><a href="${escapeAttribute(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a><p>${escapeHtml(item.snippet)}</p></article>`,
    )
    .join("")}</div>`;
}
