# Third-Party Notices / 第三方开源声明

企业名单工作台包含或改编了下列开源软件。商业发布物必须同时保留本文件、
`LICENSE.md`、`compliance/THIRD_PARTY_LICENSES.txt` 和
`compliance/sbom.cdx.json`。机器生成的完整组件清单与许可证原文以后两个文件为准。

## Copied and adapted source / 复用与改编源码

### Atomic CRM

- Upstream: <https://github.com/marmelab/atomic-crm>
- Source baseline: `167a4cdb652b1ab2b4b030831cfa7adcf2099321`
- License: MIT
- Copyright: `Copyright (c) 2024-present, Francois Zaninotto, Marmelab`

完整 MIT 原文保留在根目录 `LICENSE.md`。MIT 不授予 Atomic CRM 或
Marmelab 的商标使用权；产品对外图标、PWA 图标和默认页面已使用本项目自有品牌标识。

### Shadcn Admin Kit

- Upstream: <https://github.com/marmelab/shadcn-admin-kit>
- Imported baseline: `v1.6.0`
- Location: `src/components/admin`
- License: MIT
- Copyright: `Copyright (c) 2025 marmelab`

### shadcn/ui

- Upstream: <https://github.com/shadcn-ui/ui>
- Location: `src/components/ui`
- License: MIT
- Copyright: `Copyright (c) 2023 shadcn`

## Fonts / 字体

Inter 通过 `@fontsource-variable/inter` 随 Web 产物分发。

- Upstream: <https://github.com/rsms/inter>
- License: SIL Open Font License 1.1 (`OFL-1.1`)
- Copyright: `Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)`

完整 OFL 条款已纳入自动生成的许可证合集。本项目没有为修改字体声明保留字体名。

## Runtime dependencies / 运行时依赖

完整清单由生产 source map、provider worker 运行时导入、Supabase Edge Function
导入与锁文件闭包生成。它包括当前实际分发的 React Query Builder、ExcelJS、
JSZip、Supabase JavaScript SDK、Model Context Protocol SDK 以及所有可达的传递依赖。

对 npm 发布包漏带许可证文件、但精确上游版本或源码提供了原文的少数组件，
经核验的原文、固定上游链接和原因登记在
`compliance/license-overrides.json` 与 `compliance/license-overrides/`。生成器不会为未登记的组件猜测许可证。

## Dual-license choices / 双许可选择

- JSZip 声明 `(MIT OR GPL-3.0-or-later)`；本产品明确选择 MIT。
- DOMPurify 声明 `(MPL-2.0 OR Apache-2.0)`。当前生产构建未包含 DOMPurify，
  因此它不在当前 SBOM 中；若未来进入生产产物，生成器将选择 Apache-2.0
  并保留 Apache LICENSE，不选择 MPL-2.0。

## Reproducible release check / 可复现发布校验

从干净 checkout 开始，使用 Node.js 22、npm 与 Deno 2 执行：

```sh
npm ci
deno cache --frozen --config deno.json --lock deno.lock \
  supabase/functions/bootstrap-admin/index.ts \
  supabase/functions/delete_note_attachments/index.ts \
  supabase/functions/mcp/index.ts \
  supabase/functions/merge_contacts/index.ts \
  supabase/functions/postmark/index.ts \
  supabase/functions/update_password/index.ts \
  supabase/functions/users/index.ts \
  supabase/functions/workbench-api/index.ts \
  supabase/functions/workbench-jobs/index.ts
npm run build:worker
npm run build
npm run compliance:generate
npm run compliance:check
```

`--check` 必须以 0 退出，且 `compliance/SBOM_BLOCKERS.md` 必须显示
`No blockers detected.`。`--allow-incomplete` 只用于开发期定位，不能作为商业发布依据。

## Excluded external services / 不随产品分发的服务

企查查 CLI/MCP、金蝶征信获客助手、腾讯云 WSA、Postmark 和 Supabase 托管服务是外部服务或用户自行安装的工具，不在静态产品 SBOM 中冒充为本项目分发组件。它们的数据使用、缓存、展示、转授权和计费范围以对应服务合同为准，不由开源许可证覆盖。
