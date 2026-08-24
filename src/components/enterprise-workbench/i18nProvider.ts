import { mergeTranslations } from "ra-core";
import englishMessages from "ra-language-english";
import polyglotI18nProvider from "ra-i18n-polyglot";
import { raSupabaseEnglishMessages } from "ra-supabase-language-english";
import { englishCrmMessages } from "@/components/atomic-crm/providers/commons/englishCrmMessages";

const chineseOverrides = {
  ra: {
    action: {
      add_filter: "添加筛选",
      back: "返回",
      cancel: "取消",
      clear_input_value: "清空",
      close: "关闭",
      confirm: "确认",
      create: "新建",
      delete: "删除",
      edit: "编辑",
      export: "导出",
      list: "列表",
      refresh: "刷新",
      remove_filter: "移除筛选",
      save: "保存",
      search: "搜索",
      show: "查看",
      sort: "排序",
      undo: "撤销",
    },
    auth: {
      auth_check_error: "请登录后继续",
      email: "邮箱",
      password: "密码",
      sign_in: "登录",
      sign_in_error: "登录失败，请检查邮箱和密码",
      user_menu: "账号",
      username: "用户名",
    },
    message: {
      error: "请求失败，请稍后重试",
      invalid_form: "部分字段填写有误，请检查",
      loading: "正在加载",
      no: "否",
      not_found: "未找到页面",
      yes: "是",
    },
    navigation: {
      no_results: "暂无数据",
      no_more_results: "没有更多数据",
      page_out_of_boundaries: "页码超出范围",
      page_out_from_end: "已到最后一页",
      page_out_from_begin: "已到第一页",
      page_range_info: "%{offsetBegin}-%{offsetEnd} / %{total}",
      partial_page_range_info: "%{offsetBegin}-%{offsetEnd}",
      skip_nav: "跳到主要内容",
    },
    notification: {
      created: "已创建",
      deleted: "已删除",
      updated: "已更新",
      item_doesnt_exist: "记录不存在",
      http_error: "服务请求失败",
    },
    page: {
      dashboard: "工作台",
      empty: "暂无数据",
      error: "发生错误",
      list: "%{name}",
      loading: "正在加载",
      not_found: "页面不存在",
    },
    validation: {
      required: "必填",
    },
  },
  "ra-supabase": {
    auth: {
      forgot_password: "忘记密码？",
      missing_tokens: "密码重置链接已失效，请重新申请。",
      password_reset: "重置密码邮件已发送，请检查邮箱。",
    },
    validation: {
      password_mismatch: "两次输入的密码不一致",
    },
  },
  crm: {
    ...englishCrmMessages.crm,
    auth: {
      ...englishCrmMessages.crm.auth,
      recovery_email_sent: "如果账号存在，系统会发送密码重置邮件。",
      sign_in_google_workspace: "使用企业 Google 账号登录",
    },
    navigation: { label: "主导航" },
    profile: { title: "个人资料" },
    settings: { title: "系统设置" },
  },
};

const catalog = mergeTranslations(
  englishMessages,
  raSupabaseEnglishMessages,
  englishCrmMessages,
  chineseOverrides,
);

export const workbenchI18nProvider = polyglotI18nProvider(
  () => catalog,
  "zh",
  [{ locale: "zh", name: "简体中文" }],
  { allowMissing: true },
);
