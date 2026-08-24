import { z } from "zod";

export const SourceChannelSchema = z.enum([
  "authorized_api",
  "government_open_data",
  "customer_upload",
  "customer_system",
  "web_search",
  "manual",
]);

export const EvidenceClassSchema = z.enum([
  "registry_fact",
  "provider_fact",
  "provider_tag",
  "customer_assertion",
  "web_clue",
]);

export const FieldUnitSchema = z.enum([
  "none",
  "text",
  "wan_cny",
  "cny",
  "person",
  "count",
  "date",
  "percent",
  "boolean",
]);

export const NullMeaningSchema = z.enum([
  "provided",
  "not_provided",
  "not_collected",
  "not_authorized",
  "not_applicable",
  "redacted",
  "not_found",
  "unknown",
]);

export const UsageScopeSchema = z.enum([
  "internal_analysis",
  "redistributable",
  "link_only",
  "unknown",
]);

/**
 * A canonical value is never accepted without a field-level source trace.
 * Blank, zero, unavailable and unauthorised are deliberately different states.
 */
export const ProvenanceSchema = z.object({
  fieldPath: z.string().min(1),
  providerId: z.string().min(1),
  providerName: z.string().min(1),
  channel: SourceChannelSchema,
  evidenceClass: EvidenceClassSchema,
  sourceField: z.string().min(1).nullable().default(null),
  retrievedAt: z.string().min(10),
  sourceUpdatedAt: z.string().min(4).nullable().default(null),
  sourceUrl: z.url().nullable().default(null),
  unit: FieldUnitSchema.default("none"),
  nullMeaning: NullMeaningSchema,
  confidence: z.number().min(0).max(1).default(1),
  usageScope: UsageScopeSchema.default("internal_analysis"),
  note: z.string().nullable().default(null),
});

export type Provenance = z.infer<typeof ProvenanceSchema>;

export const CapitalSchema = z.object({
  valueWan: z.number().finite().nonnegative().nullable(),
  raw: z.union([z.string(), z.number()]).nullable(),
  currency: z.literal("CNY"),
  unit: z.literal("万元"),
  nullMeaning: NullMeaningSchema,
});

export const CompanyStatusSchema = z.object({
  raw: z.string().nullable(),
  normalized: z.enum([
    "active",
    "cancelled",
    "revoked",
    "suspended",
    "liquidating",
    "relocated",
    "inactive",
    "unknown",
  ]),
});

export const IndustrySchema = z.object({
  l1: z.string().nullable(),
  l2: z.string().nullable(),
});

export const RegionSchema = z.object({
  raw: z.string().nullable(),
  province: z.string().nullable(),
  city: z.string().nullable(),
  district: z.string().nullable(),
});

export const PersonnelScaleSchema = z.object({
  raw: z.string().nullable(),
  lowerBound: z.number().int().nonnegative().nullable(),
  upperBound: z.number().int().nonnegative().nullable(),
});

export const ContactSchema = z.object({
  phoneMasked: z.string().nullable(),
  emailMasked: z.string().nullable(),
  phoneCount: z.number().int().nonnegative().nullable(),
  emailCount: z.number().int().nonnegative().nullable(),
  phoneSourceYear: z.string().nullable(),
  emailSourceYear: z.string().nullable(),
});

export const LeadTagsSchema = z.object({
  qualifications: z.array(z.string()),
  risk: z.array(z.string()),
  operational: z.array(z.string()),
});

export const RiskSignalSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  present: z.boolean().nullable(),
  count: z.number().int().nonnegative().nullable().optional(),
  severity: z.enum(["info", "low", "medium", "high", "critical", "unknown"]),
  sourceProviderIds: z.array(z.string().min(1)),
});

export const RiskSnapshotSchema = z.object({
  asOf: z.string().min(10),
  severity: z.enum([
    "none",
    "info",
    "low",
    "medium",
    "high",
    "critical",
    "unknown",
  ]),
  signals: z.array(RiskSignalSchema),
  note: z.string().nullable(),
});

export const ProviderRiskAssessmentSchema = z.object({
  providerId: z.string().min(1),
  score: z.number().finite().nullable(),
  scaleMin: z.number().finite().nullable(),
  scaleMax: z.number().finite().nullable(),
  grade: z.string().nullable(),
  itemCount: z.number().int().nonnegative().nullable(),
  notices: z.array(z.string()),
  assessedAt: z.string().min(10),
  note: z.string().nullable(),
});

export const WebEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  companyName: z.string().min(1),
  title: z.string().min(1),
  snippet: z.string(),
  url: z.url(),
  sourceName: z.string().nullable(),
  publishedAt: z.string().nullable(),
  retrievedAt: z.string().min(10),
  claimType: z.enum([
    "official_website",
    "product",
    "award",
    "tender",
    "recruiting",
    "news",
    "other",
  ]),
  confidence: z.number().min(0).max(1),
  usageScope: z.literal("link_only"),
});

export const ConflictSchema = z.object({
  fieldPath: z.string().min(1),
  resolution: z.enum([
    "provider_priority",
    "newer_source_update",
    "newer_retrieval",
    "non_null_preferred",
    "stable_provider_id",
    "kept_separate",
  ]),
  chosenProviderId: z.string().min(1),
  candidates: z.array(
    z.object({
      providerId: z.string().min(1),
      displayValue: z.string(),
    }),
  ),
});

export const LeadSchema = z.object({
  leadId: z.string().min(1),
  companyName: z.string().min(1),
  creditCode: z.string().nullable(),
  legalPerson: z.string().nullable(),
  legalChangeDate: z.string().nullable(),
  legalPersonSharePercent: z.number().min(0).max(100).nullable(),
  companyType: z.string().nullable(),
  registeredCapital: CapitalSchema,
  paidInCapital: CapitalSchema,
  establishedDate: z.string().nullable(),
  approvedDate: z.string().nullable(),
  registrationAuthority: z.string().nullable(),
  status: CompanyStatusSchema,
  industry: IndustrySchema,
  region: RegionSchema,
  personnelScale: PersonnelScaleSchema,
  insuredCount: z.number().int().nonnegative().nullable(),
  registeredAddress: z.string().nullable(),
  businessScope: z.string().nullable(),
  contact: ContactSchema,
  tags: LeadTagsSchema,
  riskSnapshot: RiskSnapshotSchema,
  providerRiskAssessments: z.array(ProviderRiskAssessmentSchema).default([]),
  webEvidence: z.array(WebEvidenceSchema).default([]),
  provenance: z.array(ProvenanceSchema).min(1),
  conflicts: z.array(ConflictSchema).default([]),
});

export type Lead = z.infer<typeof LeadSchema>;
export type RiskSnapshot = z.infer<typeof RiskSnapshotSchema>;
export type WebEvidence = z.infer<typeof WebEvidenceSchema>;
export type Conflict = z.infer<typeof ConflictSchema>;

export const TriStateSchema = z.enum(["match", "no_match", "unknown"]);
export type TriState = z.infer<typeof TriStateSchema>;

export const RuleOperatorSchema = z.enum([
  "eq",
  "not_eq",
  "gte",
  "lte",
  "contains",
  "not_contains",
  "in",
  "not_in",
  "present",
  "absent",
  "intersects",
]);

export const MissingPolicySchema = z.enum(["review", "pass", "fail"]);

export type EligibilityCondition = {
  id: string;
  label: string;
  field: string;
  operator: z.infer<typeof RuleOperatorSchema>;
  value?: unknown;
  missingPolicy: z.infer<typeof MissingPolicySchema>;
  enabled: boolean;
};

export type EligibilityNode = EligibilityCondition | EligibilityGroup;

export type EligibilityGroup = {
  id: string;
  combinator: "and" | "or";
  rules: EligibilityNode[];
};

export type EligibilityConfig = {
  root: EligibilityGroup;
  onNoMatch: "exclude";
  onUnknown: "review" | "exclude" | "pass";
};

export const EligibilityConditionSchema: z.ZodType<EligibilityCondition> =
  z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    field: z.string().min(1),
    operator: RuleOperatorSchema,
    value: z.unknown().optional(),
    missingPolicy: MissingPolicySchema,
    enabled: z.boolean(),
  });

export const EligibilityGroupSchema: z.ZodType<EligibilityGroup> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    combinator: z.enum(["and", "or"]),
    rules: z
      .array(z.union([EligibilityConditionSchema, EligibilityGroupSchema]))
      .min(1),
  }),
);

export const MAX_ELIGIBILITY_DEPTH = 5;
export const MAX_ELIGIBILITY_CONDITIONS = 200;

export const EligibilitySchema: z.ZodType<EligibilityConfig> = z
  .object({
    root: EligibilityGroupSchema,
    onNoMatch: z.literal("exclude"),
    onUnknown: z.enum(["review", "exclude", "pass"]),
  })
  .superRefine((eligibility, context) => {
    let maximumDepth = 0;
    let conditionCount = 0;
    const identifiers = new Set<string>();
    const duplicates = new Set<string>();

    const recordIdentifier = (identifier: string) => {
      if (identifiers.has(identifier)) duplicates.add(identifier);
      identifiers.add(identifier);
    };
    const visit = (group: EligibilityGroup, depth: number) => {
      maximumDepth = Math.max(maximumDepth, depth);
      recordIdentifier(group.id);
      for (const node of group.rules) {
        if ("combinator" in node) visit(node, depth + 1);
        else {
          conditionCount += 1;
          recordIdentifier(node.id);
        }
      }
    };
    visit(eligibility.root, 1);

    if (maximumDepth > MAX_ELIGIBILITY_DEPTH) {
      context.addIssue({
        code: "custom",
        path: ["root"],
        message: `准入条件树最多允许 ${MAX_ELIGIBILITY_DEPTH} 层`,
      });
    }
    if (conditionCount > MAX_ELIGIBILITY_CONDITIONS) {
      context.addIssue({
        code: "custom",
        path: ["root", "rules"],
        message: `准入条件树最多允许 ${MAX_ELIGIBILITY_CONDITIONS} 个条件`,
      });
    }
    if (duplicates.size > 0) {
      context.addIssue({
        code: "custom",
        path: ["root"],
        message: `准入条件树 ID 不能重复：${[...duplicates].sort().join(", ")}`,
      });
    }
  });

export const LeadRuleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["priority", "risk_gate"]),
  field: z.string().min(1),
  operator: RuleOperatorSchema,
  value: z.unknown().optional(),
  weight: z.number().min(0).default(0),
  onMatch: z.enum(["score", "review", "block"]).default("score"),
  missingPolicy: MissingPolicySchema.default("review"),
  enabled: z.boolean().default(true),
});

export const RuleTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  eligibility: EligibilitySchema.optional(),
  rules: z.array(LeadRuleSchema),
  thresholds: z
    .object({
      p1: z.number().min(0).max(100),
      p2: z.number().min(0).max(100),
      minimumCompleteness: z.number().min(0).max(100).default(60),
    })
    .refine((value) => value.p1 >= value.p2, {
      message: "P1 阈值不能低于 P2 阈值",
    }),
});

export type LeadRule = z.infer<typeof LeadRuleSchema>;
export type RuleTemplate = z.infer<typeof RuleTemplateSchema>;

export const RuleTraceSchema = z.object({
  ruleId: z.string(),
  label: z.string(),
  state: TriStateSchema,
  actual: z.unknown().nullable(),
  expected: z.unknown().nullable(),
  contribution: z.number(),
  reason: z.string(),
});

export const EligibilityTraceSchema = z.object({
  conditionId: z.string().min(1),
  label: z.string().min(1),
  path: z.array(z.string().min(1)).min(1),
  state: TriStateSchema,
  effectiveState: TriStateSchema,
  actual: z.unknown().nullable(),
  expected: z.unknown().nullable(),
  missingPolicy: MissingPolicySchema,
  reason: z.string().min(1),
});

export const EligibilityEvaluationSchema = z.object({
  state: TriStateSchema,
  reasons: z.array(z.string()),
  traces: z.array(EligibilityTraceSchema),
});

export type EligibilityTrace = z.infer<typeof EligibilityTraceSchema>;
export type EligibilityEvaluation = z.infer<typeof EligibilityEvaluationSchema>;

export const LeadEvaluationSchema = z.object({
  leadId: z.string(),
  eligibility: EligibilityEvaluationSchema,
  priority: z.enum(["P1", "P2", "待核验", "排除"]),
  score: z.number().min(0).max(100),
  riskGate: z.object({
    status: z.enum(["pass", "review", "blocked"]),
    reasons: z.array(z.string()),
  }),
  matchedRules: z.array(RuleTraceSchema),
  unknownRules: z.array(RuleTraceSchema),
  evaluatedRules: z.array(RuleTraceSchema),
  evidenceCompleteness: z.number().min(0).max(100),
  nextAction: z.string(),
});

export type LeadEvaluation = z.infer<typeof LeadEvaluationSchema>;
