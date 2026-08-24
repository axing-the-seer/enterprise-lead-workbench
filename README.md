# 企业名单工作台

企业名单工作台是一套可独立运行的 Web 软件。用户完成管理员、数据库和数据源初始化后，可以不依赖 Agent，通过图形界面完成企业名单接入、字段映射、去重与冲突检查、规则配置、批量执行、证据审阅和结果导出。

WorkBuddy 与其他 AI 客户端通过受控 MCP 或 REST/OpenAPI 调用同一套应用服务；Agent 是可选入口，不是系统运行依赖。

## 产品演示

[![企业名单工作台产品演示](./docs/screenshots/01-find-companies.png)](./docs/media/enterprise-lead-workbench-demo.mp4)

[播放或下载 1 分 29 秒产品演示（MP4，6.5 MB）](./docs/media/enterprise-lead-workbench-demo.mp4)

演示覆盖找企业、我的名单、企业详情和企业调研报告。画面中的联系电话均已脱敏。

## 首批数据源

- 获客助手：由金蝶征信有限公司提供企业名单检索及单企工商司法能力。
- 企查查：首版通过用户自行授权并已实测的 `qcc-agent-cli` 查询企业基本工商登记信息；其他企查查产品只有在取得对应响应契约、授权并完成适配器验收后才开放。
- 文件导入：CSV、XLSX 和 JSON 企业名单。
- Web 证据：通过用户自行开通的腾讯云联网搜索 WSA 为已存在企业补充链接证据；不用网页结果新建企业，不覆盖工商事实。

所有供应商响应先保存原始快照，再按版本化映射生成统一企业字段。字段冲突保留来源和时间，缺失值保持未知，不由模型猜测补全。

## 产品主流程

1. 配置并验证数据源连接。
2. 查询企业或导入已有名单。
3. 确认字段映射、企业身份和数据冲突。
4. 使用可视化规则编辑器创建版本化规则。
5. 执行规则和按需补充核验。
6. 审阅命中证据、人工结论与审计记录。
7. 导出 CSV、XLSX、JSON、HTML，或通过 API/MCP 读取。

## 本地开发

前置环境：Node.js 22、Make、Docker。

```sh
npm ci
WORKBENCH_BOOTSTRAP_TOKEN='<至少 24 字节的随机初始化码>' make start
```

该命令会启动 Supabase、供应商任务执行器和 Web UI；只启动前端会导致查询、导入、规则和导出任务一直排队。前端默认地址为 `http://localhost:3101/`，Supabase Studio 默认地址为 `http://localhost:54323/`。

首次打开 Web UI 时输入同一初始化码，创建首位管理员，然后进入工作空间初始化。初始化码只进入服务端进程环境，不得写入前端环境变量；初始化完成后数据库会永久关闭该入口。普通 Supabase 公开注册默认关闭，后续成员由管理员在系统内创建或通过已审批的组织 SSO 加入。

```sh
npm run typecheck
npm run typecheck:worker
npm run lint
npm run test:unit:all
npm run test:unit:app
npm run test:unit:functions
npm run test:unit:worker
npm run build:worker
npm run build
npm run compliance:generate
npm run compliance:check
```

人工验收证据与真实数据链路结果见 [design-qa.md](./design-qa.md)。商用发布时应把 `compliance/sbom.cdx.json`、`compliance/THIRD_PARTY_LICENSES.txt` 和项目版权声明一起归档；合规检查有阻塞项时不得标记为可发布版本。

### 隔离人工验收

如果本机的默认 Supabase 端口已被其他项目或 SSH 隧道占用，可启动一套隔离的完整验收环境：

```sh
WORKBENCH_BOOTSTRAP_TOKEN='<至少 24 字节的随机初始化码>' npm run start:acceptance
```

浏览器打开 `http://127.0.0.1:5175/`。该环境仍运行生产 Web UI、数据库迁移、Edge Functions 和供应商任务执行器，不使用模拟名单；数据库单独保存在 `.supabase-acceptance`，不会覆盖默认开发数据库。退出前台进程不会删除验收数据，停止隔离 Supabase 可执行 `npm run stop:acceptance`。

生产环境必须在含开发依赖的构建阶段执行 `npm run build:worker`，再把
`services/provider-worker/dist` 与生产依赖一起交付。运行阶段使用
`npm run worker:start`，它只调用 Node.js 和预编译 JavaScript，不依赖 `tsx`
或 TypeScript。`worker:dev` 仅供本地开发使用。

供应商凭证只能保存在服务端 Secret/Vault 中，不得进入浏览器、日志、示例数据、Git 历史或发布包。

## 开源基础与许可证

本项目直接基于 [Atomic CRM](https://github.com/marmelab/atomic-crm) 修改，保留其 React、Supabase、认证、数据访问、管理组件和部署骨架，并重建企业数据、来源证据、规则运行和审计领域。

Atomic CRM 由 Marmelab 以 MIT License 发布。原始版权和许可见 [LICENSE.md](./LICENSE.md)，其他主要依赖声明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。开源代码许可不等同于企查查或金蝶征信数据的缓存、展示及再分发授权，商用范围以对应数据服务合同为准。
