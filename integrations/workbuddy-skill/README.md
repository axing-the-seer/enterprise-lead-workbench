# 企业名单工作台 Skills

本包包含两个相互独立的 Skill：

- `enterprise-lead-workbench`：收敛找企业条件、说明调用量、生成和管理真实企业名单。
- `enterprise-public-report`：由 Ego Lite 采集官网、招聘和新闻证据，再由 WorkBuddy 或其他 Agent 完成判断，回写统一版式的 HTML 报告。

两者依赖同一个企业名单工作台 MCP。WorkBuddy 可把本目录作为插件安装；其他支持 `SKILL.md` 的 Agent 可分别安装两个 Skill 目录。工作台不保存 Agent、飞书或微信凭证；发送由用户当前使用的 Agent 调用其已授权通讯工具完成。
