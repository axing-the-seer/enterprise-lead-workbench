---
name: enterprise-public-report
description: 在已连接企业名单工作台 MCP 时，读取 Ego Lite 采集的官网、招聘和新闻证据，用当前 Agent 完成企业理解、机会判断和行动建议，回写统一格式报告，并可通过当前 Agent 已授权的通讯工具发送。适用于单企业调研和报告交付；不用于凭空创建企业或把搜索摘要当成事实。
---

# 企业情报报告

本 Skill 是 Agent 适配层。企业名单工作台负责企业主档、Ego Lite 采集、证据保存和统一报告版式；当前 Agent 负责理解证据、形成判断，并在用户明确要求时调用自身已有的飞书、微信或其他通讯能力发送文件。

## 首次运行与连接检查

1. 在读取本机文件、执行终端命令或调用网络之前，先确认当前 Agent 是否真实提供 `list_workspaces`、`list_companies` 和 `list_source_connections` 工具。
2. 工具不存在时立即停止，明确说明“Skill 已加载，但企业名单工作台 MCP 尚未连接”。请用户从 Web UI“配置 → AI / MCP 接入”复制当前环境的 MCP 地址，在 WorkBuddy 或当前 Agent 的连接器界面添加远程 MCP，并在浏览器完成 OAuth 授权后重试。
3. 禁止为了补齐连接而扫描本机端口或项目目录，禁止读写 `~/.workbuddy/mcp.json`，禁止自行生成或保存 JWT，禁止查询、猜测、更改任何账号密码。Skill 不内置域名、端口、账号或凭证。
4. 工具存在但返回未授权、401 或需要登录时，只引导用户在已打开的工作台授权页完成登录和允许；不索取密码、Token 或 Key。

## 工作流

1. 用 `list_workspaces` 确认工作空间，再用 `list_companies` 锁定已入库企业。出现多个同名主体时，展示企业名、信用代码和地区，让用户确认；不得默认选择第一家。
2. 查找该企业已有的最新证据任务：
   - 用 `list_ingestion_jobs` 查已完成或部分完成的 `web_evidence` 任务。
   - 没有可用任务时，用 `list_source_connections` 找到可用的 `web_search`，再调用 `start_ingestion_query`，固定使用 `queryKind=web_evidence`、`claimType=public_report`、`reportMode=true` 和已确认的 `companyId`。
   - 轮询到 `completed` 或 `partial`。这一步由 Ego Lite 采集公开网页，不使用模型 Token；`failed` 才是失败。
3. 调用 `get_company_report_context`。先阅读企业概况、字段事实和精简证据目录，不要一次性要求全部正文。
4. 根据用户目的选择 8–12 条最相关证据，分批调用 `read_company_report_evidence`。默认不得读取全部目录；在有材料时至少覆盖官网、招聘和新闻各 2 条，只补充与用户目标直接相关的集团/行业背景。报告规范和回传结构见 [Agent 分析契约](references/agent-contract.md)。
5. 基于证据完成分析：
   - 区分确定事实、合理判断和待核实信息。
   - 每一条业务判断、机会、风险和建议都引用当前任务的 `ev-NNN` 证据编号。
   - 证据编号只放在结构化 `evidenceIds` 字段，绝不能写进标题、正文、结论摘要或分析限制。
   - 所有客户可见文字使用完整、自然的中文句子。内部枚举、字段名、工具名和转义标记必须翻译或删除，例如不能出现 `USCC`、`broad_context`、`related_entity`、`paid_in_capital`、`insuredCount`、`tags.risk`、MCP 参数或反斜杠转义。
   - 英文缩写和技术术语只有在业务用户普遍熟悉或属于正式产品名时才保留；其余改写为自然中文，不使用电报式短句。
   - 不把关联主体或行业背景写成当前企业事实。
   - 没有查到不等于不存在。
6. 调用 `submit_company_report_analysis` 回写结构化分析。提交前必须先做紧凑化：整个 `analysis` JSON 不超过 8 KiB，结论摘要不超过 500 个中文字符，每个固定分析分区保留 2–4 条最有价值的内容，每条摘要不超过 180 个中文字符。先删除重复、弱关联和无法支撑行动的条目，不得依赖提交失败后再临时裁剪。工具会保存版本并返回统一品牌的 `reportHtml`、文件名和报告 ID。
7. 把完整工具响应保存成 JSON，再运行：

   ```bash
   python3 "{SKILL_BASE_DIR}/scripts/save_report.py" --input "<工具响应 JSON>"
   ```

   解析 stdout，使用 `present_files` 展示生成的 HTML。不要自己重新设计 HTML，也不要把证据摘要直接当作最终报告。
8. 只有用户明确提出收件人和发送渠道时，才使用当前 Agent 已有的通讯工具发送 HTML/PDF 或名单文件。工作台不配置、不保存飞书或微信凭证。发送前复述收件人与附件；通讯工具不可用时，交付文件并说明缺少哪项能力。

交付时同时返回报告 ID 和 Web UI 路由 `/#/reports/{evidenceJobId}`。路由参数是证据任务 ID，不是报告 ID；不得把 `reportId` 拼到路由中。

## 重要边界

- 报告分析会使用当前 Agent 的模型能力和 Token；Ego Lite 采集、工作台整理、导出和渲染本身不调用大模型。
- 不向企业名单工作台写入 Agent、飞书或微信的 API Key、Token、Cookie 或账号配置。
- 不绕过登录、验证码、付费墙、robots 或站点限制。
- 不允许引用其他任务或其他企业的证据编号。
- 不虚构联系方式、经营事件、招聘、风险、机会或判断依据。
- 发送附件属于外部动作，必须有用户对渠道、收件人和附件的明确指示。
