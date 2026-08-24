import { describe, expect, it } from "vitest";
import { normalizeCsvDataset, createCsvAdapter } from "./csv/adapter";
import { kcAdapter, normalizeKcRecord } from "./kc/adapter";
import { kcRiskAdapter, normalizeKcRiskReport } from "./kc/risk-adapter";
import {
  QICHACHA_CLI_CN_REGISTRATION_CONTRACT,
  createQichachaAdapter,
  normalizeQichachaCliDataset,
  normalizeQichachaDataset,
  type QichachaMappingContract,
} from "./qichacha/adapter";

const RETRIEVED_AT = "2026-08-20T09:00:00+08:00";

describe("获客助手 ProviderAdapter", () => {
  it("映射名单搜索字段、风险标签和字段血缘", () => {
    const lead = normalizeKcRecord(
      {
        companyName: "示例智造有限公司",
        taxId: "91310000TEST000001",
        capitalNum: "2,000",
        insuredNum: "68",
        establishDate: "2020/2/29",
        status: "存续（在营、开业、在册）",
        tag: { blue: ["高新技术企业（2025）", "实际经营"], red: ["股权冻结"] },
      },
      { retrievedAt: RETRIEVED_AT },
    );
    expect(lead).toMatchObject({
      creditCode: "91310000TEST000001",
      registeredCapital: { valueWan: 2000, unit: "万元" },
      insuredCount: 68,
      status: { normalized: "active" },
      riskSnapshot: { severity: "high" },
    });
    expect(lead.tags.qualifications).toEqual(["高新技术企业(2025)"]);
    expect(lead.tags.operational).toEqual(["实际经营"]);
    expect(
      lead.provenance.find(
        (item) => item.fieldPath === "registeredCapital.valueWan",
      ),
    ).toMatchObject({
      sourceField: "capitalNum",
      unit: "wan_cny",
      nullMeaning: "provided",
    });
  });

  it("只保留允许的脱敏 raw 字段，不复制内部 ID 或明文联系方式", () => {
    const batch = kcAdapter.normalizeBatch(
      [
        {
          companyName: "隐私边界测试企业",
          companyId: "vendor-internal-id",
          phone: "13800138000",
          email: "sales@example.com",
        },
      ],
      { retrievedAt: RETRIEVED_AT },
      {},
    );
    const serialized = JSON.stringify(batch);
    expect(serialized).not.toContain("companyId");
    expect(serialized).not.toContain("vendor-internal-id");
    expect(serialized).not.toContain("13800138000");
    expect(serialized).not.toContain("sales@example.com");
    expect(batch.records[0].sanitizedRaw.phone).toContain("*");
  });

  it("保留 0，对缺失值不作猜测", () => {
    const zero = normalizeKcRecord(
      { companyName: "零值企业", capitalNum: 0, insuredNum: 0 },
      { retrievedAt: RETRIEVED_AT },
    );
    expect(zero.registeredCapital.valueWan).toBe(0);
    expect(zero.insuredCount).toBe(0);

    const missing = normalizeKcRecord(
      { companyName: "缺失值企业", capitalNum: null, insuredNum: null },
      { retrievedAt: RETRIEVED_AT },
    );
    expect(missing.registeredCapital).toMatchObject({
      valueWan: null,
      nullMeaning: "not_provided",
    });
    expect(missing.insuredCount).toBeNull();
    expect(missing.riskSnapshot.severity).toBe("unknown");
  });
});

describe("获客助手单企工商司法 ProviderAdapter", () => {
  it("映射工商主数据、风险区块和供应商评价，不自制风险结论", () => {
    const lead = normalizeKcRiskReport(
      {
        entInfo: {
          name: "工商司法测试企业",
          creditNo: "91310000TEST000008",
          econKind: "有限责任公司",
          registCapi: "5000万元人民币",
          operName: "李某",
          startDate: "2019-04-02",
          checkDate: "2026-07-01",
          belongOrg: "某市场监督管理局",
          status: "存续（在营、开业、在册）",
          province: "上海市",
          city: "上海市",
          domains: "软件和信息技术服务业",
          address: "上海市某路 2 号",
          scope: "软件服务",
          contact: { telephone: "13800138000", email: "risk@example.com" },
          abnormalItems: [],
        },
        entcaseList: [{ number: "penalty-1" }],
        sharesfrosts: [{ seqNo: "freeze-1" }, { seqNo: "freeze-2" }],
        disruptinfo: [],
        entEval: {
          score: 850,
          level: "A",
          number: 3,
          riskNotice: [{ key: "notice", value: "存在待核验记录" }],
        },
      },
      { retrievedAt: RETRIEVED_AT },
    );
    expect(lead).toMatchObject({
      companyType: "有限责任公司",
      registeredCapital: { valueWan: 5000 },
      approvedDate: "2026-07-01",
      registrationAuthority: "某市场监督管理局",
      status: { normalized: "active" },
      region: { province: "上海市", city: "上海市" },
      riskSnapshot: { severity: "unknown" },
    });
    expect(lead.tags.risk).toEqual(
      expect.arrayContaining(["行政处罚", "股权冻结"]),
    );
    expect(lead.riskSnapshot.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "kc:administrative_penalty",
          present: true,
          count: 1,
        }),
        expect.objectContaining({
          code: "kc:equity_freeze",
          present: true,
          count: 2,
        }),
        expect.objectContaining({
          code: "kc:dishonest",
          present: false,
          count: 0,
        }),
        expect.objectContaining({ code: "kc:enforcement", present: null }),
      ]),
    );
    expect(lead.providerRiskAssessments[0]).toEqual(
      expect.objectContaining({
        providerId: "kingdee-credit-kc-assistant",
        score: 850,
        scaleMin: 0,
        scaleMax: 1000,
        grade: "A",
        itemCount: 3,
        notices: ["存在待核验记录"],
      }),
    );
    expect(lead.contact.phoneMasked).not.toBe("13800138000");
  });

  it("风险快照不复制司法明细内部 ID 或明文联系方式", () => {
    const batch = kcRiskAdapter.normalizeBatch(
      [
        {
          entInfo: {
            name: "风险快照安全测试企业",
            contact: { telephone: "13800138000", email: "risk@example.com" },
          },
          underTaker: { id: "vendor-event-id", caseNumber: "case-1" },
        },
      ],
      { retrievedAt: RETRIEVED_AT },
      {},
    );
    const serialized = JSON.stringify(batch.records[0].sanitizedRaw);
    expect(serialized).not.toContain("vendor-event-id");
    expect(serialized).not.toContain("case-1");
    expect(serialized).not.toContain("13800138000");
    expect(serialized).not.toContain("risk@example.com");
    expect(batch.records[0].sanitizedRaw.riskCategories).toMatchObject({
      underTaker: { present: true, count: null },
    });
  });
});

describe("企查查 ProviderAdapter", () => {
  it("接受已经真实验证的 CLI 中文扁平工商 JSON", () => {
    expect(QICHACHA_CLI_CN_REGISTRATION_CONTRACT.fields.companyName).toBe(
      "企业名称",
    );
    const [lead] = normalizeQichachaCliDataset(
      [
        {
          企业名称: "示例数据科技有限公司",
          统一社会信用代码: "91310000TEST000002",
          法定代表人: "张某",
          企业类型: "有限责任公司",
          登记状态: "存续(在营、开业、在册)",
          成立日期: "2018-03-12",
          注册资本: "1234万元",
          实缴资本: "1200万元",
          人员规模: "100-499人",
          参保人数: "42",
          所属地区: "上海市",
          国标行业: "软件和信息技术服务业",
          注册地址: "上海市某路 1 号",
          经营范围: "软件服务",
          核准日期: "2026-08-01",
          登记机关: "某市场监督管理局",
        },
      ],
      { retrievedAt: RETRIEVED_AT },
    );
    expect(lead).toMatchObject({
      companyName: "示例数据科技有限公司",
      creditCode: "91310000TEST000002",
      companyType: "有限责任公司",
      registeredCapital: { valueWan: 1234 },
      paidInCapital: { valueWan: 1200 },
      approvedDate: "2026-08-01",
      registrationAuthority: "某市场监督管理局",
      region: { raw: "上海市", province: null, city: null, district: null },
      personnelScale: { raw: "100-499人", lowerBound: 100, upperBound: 499 },
      insuredCount: 42,
      status: { raw: "存续(在营、开业、在册)", normalized: "active" },
      industry: { l2: "软件和信息技术服务业" },
    });
    expect(lead.provenance[0]).toMatchObject({
      providerId: "qichacha",
      channel: "authorized_api",
      evidenceClass: "registry_fact",
    });
    for (const fieldPath of [
      "companyType",
      "paidInCapital.valueWan",
      "approvedDate",
      "registrationAuthority",
      "region.raw",
      "personnelScale.raw",
      "personnelScale.lowerBound",
      "personnelScale.upperBound",
    ]) {
      expect(lead.provenance.some((item) => item.fieldPath === fieldPath)).toBe(
        true,
      );
    }
  });

  it("保留风险扫描单维计数，不生成跨维综合分", () => {
    const contract: QichachaMappingContract = {
      contractVersion: "1.0",
      apiProduct: "get_company_registration_info + get_company_risk_scan",
      apiVersion: "reviewed-fixture-v1",
      mappingReviewedAt: "2026-08-20",
      usageScope: "internal_analysis",
      fields: {
        companyName: "registration.企业名称",
        status: "registration.登记状态",
      },
      statusValues: { 在业: "active" },
      riskScan: {
        countsPath: "risk.counts",
        expectedDimensionCount: 2,
        zeroMeansNoCurrentRecord: true,
        dimensions: {
          dishonest: {
            code: "qcc_risk:dishonest",
            label: "失信被执行人",
            severity: "critical",
          },
          highConsumption: {
            code: "qcc_risk:high_consumption",
            label: "限制高消费",
            severity: "high",
          },
        },
      },
    };
    const [lead] = normalizeQichachaDataset(
      [
        {
          registration: { 企业名称: "风险计数测试企业", 登记状态: "在业" },
          risk: { counts: { dishonest: 0, highConsumption: 2 } },
        },
      ],
      contract,
      { retrievedAt: RETRIEVED_AT },
    );
    expect(lead.riskSnapshot.severity).toBe("high");
    expect(lead.riskSnapshot).not.toHaveProperty("score");
    expect(lead.riskSnapshot.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "qcc_risk:dishonest",
          count: 0,
          present: false,
        }),
        expect.objectContaining({
          code: "qcc_risk:high_consumption",
          count: 2,
          present: true,
        }),
      ]),
    );
    expect(lead.tags.risk).toEqual(["限制高消费"]);

    expect(() =>
      normalizeQichachaDataset(
        [
          {
            registration: { 企业名称: "维度漂移企业", 登记状态: "在业" },
            risk: {
              counts: { dishonest: 0, highConsumption: 0, unexpected: 1 },
            },
          },
        ],
        contract,
      ),
    ).toThrow(/响应维度已漂移/);
  });

  it("没有明确单位或状态值域时拒绝运行", () => {
    const contract: QichachaMappingContract = {
      contractVersion: "1.0",
      apiProduct: "test",
      apiVersion: "test",
      mappingReviewedAt: "2026-08-20",
      usageScope: "internal_analysis",
      fields: {
        companyName: "name",
        registeredCapital: "capital",
        status: "status",
      },
    };
    expect(() => createQichachaAdapter(contract)).toThrow(
      /注册资本字段必须显式声明原始单位/,
    );
  });
});

describe("CSV 中文字段 ProviderAdapter", () => {
  it("识别常用中文表头，只在单位明确时换算", () => {
    const [lead] = normalizeCsvDataset(
      [
        {
          客户主体名称: "上传名单测试企业",
          统一信用代码: "91310000TEST000003",
          "注册资本（元）": "10,000,000 元",
          登记状态: "存续",
          社保人数: "88",
          联系电话: "13800138000",
          联系邮箱: "sales@example.com",
          企业资质: "高新技术企业；专精特新中小企业",
          风险提示: "经营异常",
        },
      ],
      { retrievedAt: RETRIEVED_AT, sourceFileName: "customer-list.csv" },
    );
    expect(lead.registeredCapital.valueWan).toBe(1000);
    expect(lead.status.normalized).toBe("active");
    expect(lead.insuredCount).toBe(88);
    expect(lead.contact.phoneMasked).not.toBe("13800138000");
    expect(lead.contact.emailMasked).toBe("sa****@example.com");
    expect(lead.tags.qualifications).toHaveLength(2);
    expect(lead.tags.risk).toEqual(["经营异常"]);
  });

  it("无单位资本不猜测，未映射列标记 not_collected", () => {
    const [lead] = normalizeCsvDataset([
      { 企业名称: "单位未知企业", 注册资本: "5000" },
    ]);
    expect(lead.registeredCapital).toMatchObject({
      valueWan: null,
      raw: "5000",
      nullMeaning: "unknown",
    });
    expect(
      lead.provenance.find((item) => item.fieldPath === "insuredCount"),
    ).toMatchObject({
      sourceField: null,
      nullMeaning: "not_collected",
    });
  });

  it("不在 sanitizedRaw 中留任意未映射列或明文联系方式", () => {
    const adapter = createCsvAdapter();
    const batch = adapter.normalizeBatch(
      [
        {
          企业名称: "文件安全测试企业",
          电话: "13800138000",
          内部备注: "不应复制",
        },
      ],
      { retrievedAt: RETRIEVED_AT },
      {},
    );
    const serialized = JSON.stringify(batch.records[0].sanitizedRaw);
    expect(serialized).not.toContain("内部备注");
    expect(serialized).not.toContain("不应复制");
    expect(serialized).not.toContain("13800138000");
  });
});
