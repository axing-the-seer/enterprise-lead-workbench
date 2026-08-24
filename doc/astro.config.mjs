// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  base: "/enterprise-lead-workbench/doc/",
  vite: {
    plugins: [tailwindcss()],
  },
  build: {
    assets: "assets",
  },
  integrations: [
    starlight({
      title: "企业名单工作台",
      favicon: "./favicon.svg",
      customCss: ["./src/styles/global.css"],
      logo: {
        dark: "./public/logo_enterprise_workbench_dark.svg",
        light: "./public/logo_enterprise_workbench_light.svg",
      },
      head: [
        {
          tag: "meta",
          attrs: {
            property: "og:title",
            content: "企业名单工作台文档",
          },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:description",
            content:
              "获客助手、企查查、文件导入与公开信息报告的一体化企业名单工作台。",
          },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:type",
            content: "website",
          },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:locale",
            content: "zh_CN",
          },
        },
      ],
      sidebar: [
        {
          label: "快速开始",
          link: "/",
        },
        {
          label: "使用说明",
          items: [{ label: "初始化", link: "/users/initialization" }],
        },
        {
          label: "生产与集成",
          items: [
            {
              label: "系统架构",
              link: "/developers/workbench-architecture",
            },
            {
              label: "数据源映射",
              link: "/developers/provider-mapping",
            },
            { label: "生产部署", link: "/developers/deploy" },
          ],
        },
      ],
    }),
  ],
});
