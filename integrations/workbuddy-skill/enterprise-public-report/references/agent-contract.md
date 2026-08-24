# Agent 分析契约

## 读取策略

`get_company_report_context` 返回企业工商概况、当前字段事实和证据目录。目录只用于选材；形成判断前，用 `read_company_report_evidence` 读取 8–12 条相关证据正文，不要为了“覆盖全”而读取整个目录。每次最多读取 10 条，优先读取：

1. 与企业全称匹配且来源为官网的材料。
2. 与用户目标相关的招聘、新闻和业务材料。
3. 用于交叉验证同一事件的第二来源。

`related_entity` 只能作为关联主体线索，`broad_context` 只能作为行业背景。

这些值只用于 Agent 内部判断，不能出现在客户报告文字中。报告正文应写成“关联主体公开信息”或“集团及行业背景信息”，并明确说明它们不代表当前工商主体。

提交体积是兼容性合同：`analysis` JSON 必须不超过 8 KiB。默认每个分析分区保留 2–4 条，`executiveSummary` 不超过 500 个中文字符，每条 `summary` 不超过 180 个中文字符，分析限制不超过 5 条。这些是上限而不是填充目标；没有足够证据的分区可以为空。

## 回传结构

提交给 `submit_company_report_analysis` 的 `analysis` 必须符合：

```json
{
  "schemaVersion": "company-agent-analysis.v1",
  "title": "可选的报告标题",
  "executiveSummary": "面向业务用户的简明结论",
  "executiveEvidenceIds": ["ev-001"],
  "businessProfile": [],
  "growthSignals": [],
  "recentEvents": [],
  "opportunities": [],
  "risks": [],
  "recommendedActions": [],
  "limitations": []
}
```

六个分析数组中的每一项使用相同结构：

```json
{
  "title": "短标题",
  "summary": "说明事实、判断依据及与用户目标的关系",
  "confidence": "high",
  "evidenceIds": ["ev-001", "ev-003"],
  "happenedAt": "2026-08-24T00:00:00+08:00"
}
```

- `confidence` 只允许 `high`、`medium`、`low`。
- `happenedAt` 可省略；不得根据抓取时间猜测事件发生时间。
- `opportunities` 必须结合用户的产品、服务或本次分析目的；未提供业务背景时，写成“待结合用户业务验证”的中性机会线索。
- `risks` 同时包含负面事实与数据不确定性，但不得把未检索到写成无风险。
- `recommendedActions` 必须具体到下一步动作，并引用触发该动作的证据。

## 客户可见文字

`title`、`executiveSummary`、各分区的 `title` 与 `summary`、`limitations` 都会直接展示给业务用户，必须满足：

- 使用完整、自然的中文句子，不写数据字段拼接、日志摘要或电报式短语。
- 证据编号只写入 `executiveEvidenceIds` 和每项的 `evidenceIds`，正文不得出现 `ev-NNN`；HTML 模板会自动生成“资料 1、资料 2”引用。
- 不得出现内部枚举或字段名，例如 `USCC`、`broad_context`、`related_entity`、`exact_company`、`paid_in_capital`、`insuredCount`、`tags.risk`、`company_detail`。
- 不得出现 Markdown 或代码转义残留，例如 `\_`、反引号、JSON 键名、MCP 工具名和参数。
- 将内部术语翻译成客户语言，例如把 `USCC` 写成“统一社会信用代码”，把 `capex` 写成“资本开支”，把 `Q1` 写成“第一季度”。
- 区分工商主体与集团：写成“以下信息属于集团层面的公开动态，不能直接视为该公司的经营表现”，不要暴露相关性分类值。
- 对缩写或专业名词，除正式产品名外，优先使用中文全称；确需保留时首次出现应给出中文解释。

## 报告质量

统一模板固定展示：结论摘要、企业概况、企业与业务理解、发展与招聘信号、近期公开动态、潜在合作机会、风险与不确定性、建议下一步、分析限制和证据附录。Agent 只提交结构化内容，不自行编写 HTML 或修改品牌版式。
