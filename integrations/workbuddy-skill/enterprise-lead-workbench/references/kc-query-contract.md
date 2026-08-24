# 获客助手查询合同

以下字段已经与生产适配器对齐。Agent 只构造用户已确认的条件，不传空占位值。

| 用户条件 | `criteria` 字段 | 约束 |
|---|---|---|
| 关键词 | `keyword` | 2–100 字符 |
| 地区 | `regions` | `{label, providerValues}`；值必须来自获客助手地区目录，执行器会按 `label` 重新规范为当前目录的完整范围 |
| 行业 | `industries` | `{label, providerValues}`；值必须来自获客助手行业目录 |
| 经营状态 | `statuses` | UI 当前使用 `正常` |
| 企业类型 | `enterpriseTypes` | `company`、`cooperative`、`individual` |
| 联系方式 | `contactRequirements` | `phone`、`email`；同时传表示同时满足 |
| 资质 | `qualificationTags` | 使用目录中精确标签，例如高新技术企业、专精特新中小企业 |
| 实际经营 | `actualOperatingOnly` | boolean |
| 注册资本 | `registeredCapitalWan` | `[{min?,max?}]`，单位万元 |
| 参保人数 | `insuredCount` | `[{min?,max?}]`，单位人 |
| 成立时间 | `establishedBetween` | `[{start,end}]`，ISO 日期 |
| 法人持股 | `legalPersonSharePercent` | `[{min?,max?}]`，百分比 |
| 法人变更 | `legalChangedBetween` / `legalUnchangedBetween` | ISO 日期范围 |
| 风险 | `riskFlags` | `businessAbnormal`、`equityFreeze`、`severeViolation`、`administrativePenalty`；值为 `has` 或 `none` |

分页字段为 `page`（从 1 开始）和 `pageSize`（最多 10）。前端要求至少选择两类有效范围条件，Skill 也应遵循，以减少无边界查询和额度消耗。

同名名单会去重追加而不会覆盖或清空。同一轮分页和幂等重试必须沿用同一名称；已确认受污染的测试名单需隔离重建时，才使用用户可理解的新名称，不自动附加日期或时间。

市级地区不能只提交省级值和裸市级值后宣称筛选完成；执行器会依据中文目录标签补齐该市全部有效区县，并排除“市辖区”等无效占位节点。目录标签不存在或同名不明确时任务必须失败并要求重新选择，不能扩大到整省。

本文件中的字段名仅用于 Agent 内部构造调用。用户回复不得出现供应商目录令牌、行业编码或 MCP 原始参数。

名单结果中的联系方式只允许使用供应商返回的脱敏值。不得要求、输出或推断完整手机号和邮箱。
