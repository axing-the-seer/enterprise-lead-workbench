import type { CompanyFieldFact } from "./types";
import { operatingStatusLabel } from "./companyPresentation";

export const factLabels: Record<string, string> = {
  approvedDate: "核准日期",
  businessScope: "经营范围",
  companyName: "企业名称",
  companyType: "企业类型",
  creditCode: "统一社会信用代码",
  establishedDate: "成立日期",
  "industry.l1": "一级行业",
  "industry.l2": "二级行业",
  insuredCount: "参保人数",
  legalChangeDate: "法人最近变更日期",
  legalPerson: "法定代表人",
  legalPersonSharePercent: "法人持股比例",
  "paidInCapital.valueWan": "实缴资本（万元）",
  "personnelScale.lowerBound": "人员规模下限",
  "personnelScale.raw": "人员规模（来源原值）",
  "personnelScale.upperBound": "人员规模上限",
  "region.city": "市",
  "region.district": "区县",
  "region.province": "省",
  "region.raw": "所属地区（来源原值）",
  registeredAddress: "注册地址",
  "registeredCapital.valueWan": "注册资本（万元）",
  registrationAuthority: "登记机关",
  "status.normalized": "经营状态（标准值）",
  "status.raw": "经营状态（来源原值）",
  "tags.operational": "经营标签",
  "tags.qualifications": "资质标签",
  "tags.risk": "风险标签",
  "identity.companyName": "企业名称",
  "identity.creditCode": "统一社会信用代码",
  "identity.legalRepresentative": "法定代表人",
  "registration.status": "经营状态",
  "registration.registeredCapitalWan": "注册资本",
  "registration.establishedOn": "成立日期",
  "operation.insuredEmployeeCount": "参保人数",
  "location.address": "注册地址",
  "contact.phone": "联系电话",
  "contact.website": "网站",
};

export function displayFact(fact: CompanyFieldFact) {
  if (fact.value_text) return formatFactValue(fact.field_name, fact.value_text);
  if (fact.value_json === null || fact.value_json === undefined)
    return "未提供";
  const wrapped =
    typeof fact.value_json === "object" && !Array.isArray(fact.value_json)
      ? (fact.value_json as Record<string, unknown>)
      : null;
  const value = wrapped && "value" in wrapped ? wrapped.value : fact.value_json;
  if (value === null || value === undefined) return "未提供";
  return formatFactValue(fact.field_name, value);
}

function formatFactValue(fieldName: string, value: unknown) {
  if (fieldName === "status.normalized") {
    return operatingStatusLabel(String(value));
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numeric)) {
    if (
      fieldName === "insuredCount" ||
      fieldName === "personnelScale.lowerBound" ||
      fieldName === "personnelScale.upperBound"
    ) {
      return `${numeric.toLocaleString("zh-CN")} 人`;
    }
    if (
      fieldName === "registeredCapital.valueWan" ||
      fieldName === "paidInCapital.valueWan"
    ) {
      return `${numeric.toLocaleString("zh-CN")} 万元`;
    }
    if (fieldName === "legalPersonSharePercent") {
      return `${numeric.toLocaleString("zh-CN")}%`;
    }
  }
  return displayUnknownValue(value);
}

function displayUnknownValue(value: unknown): string {
  if (value === null || value === undefined) return "未提供";
  if (Array.isArray(value)) {
    return value.length ? value.map(displayUnknownValue).join("、") : "未提供";
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length
      ? entries
          .map(([key, entry]) => `${key}：${displayUnknownValue(entry)}`)
          .join("；")
      : "未提供";
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))
    ) {
      try {
        return displayUnknownValue(JSON.parse(trimmed));
      } catch {
        // Keep provider text when it only resembles JSON.
      }
    }
    return trimmed || "未提供";
  }
  return String(value);
}

export function providerLabel(provider: string) {
  if (
    [
      "huoke_assistant",
      "kc",
      "kingdee_credit",
      "kingdee-credit-kc-assistant",
    ].includes(provider)
  )
    return "获客助手";
  if (["qcc", "qichacha"].includes(provider)) return "企查查";
  if (["ego_lite", "web_search", "tencent_wsa"].includes(provider))
    return "公开网页";
  if (["file_upload", "csv-upload"].includes(provider)) return "用户上传";
  return provider;
}
