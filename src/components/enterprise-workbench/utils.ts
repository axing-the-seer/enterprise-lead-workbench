export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatNumber(value?: number | null) {
  return typeof value === "number"
    ? new Intl.NumberFormat("zh-CN").format(value)
    : "—";
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "发生未知错误";
}

export const statusLabels: Record<string, string> = {
  active: "可用",
  configured: "已配置",
  connected: "已连接",
  disabled: "已停用",
  degraded: "能力受限",
  draft: "草稿",
  error: "失败",
  failed: "失败",
  inactive: "未启用",
  pending: "待处理",
  queued: "排队中",
  ready: "就绪",
  running: "执行中",
  succeeded: "已完成",
  completed: "已完成",
  needs_review: "待核验",
  open: "待处理",
  resolved: "已解决",
};

export function translateStatus(value?: string | null) {
  if (!value) return "未知";
  return statusLabels[value] ?? value;
}

export function statusTone(value?: string | null) {
  if (
    ["active", "connected", "ready", "succeeded", "completed"].includes(
      value ?? "",
    )
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300";
  }
  if (["error", "failed"].includes(value ?? "")) {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300";
  }
  if (
    ["queued", "pending", "running", "needs_review", "open"].includes(
      value ?? "",
    )
  ) {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300";
  }
  return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300";
}
