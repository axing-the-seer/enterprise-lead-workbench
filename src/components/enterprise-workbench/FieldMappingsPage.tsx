import { useEffect, useMemo, useState } from "react";
import {
  GitCompareArrows,
  Loader2,
  LockKeyhole,
  Plus,
  Trash2,
} from "lucide-react";
import { useCreate, useGetList, useNotify, useUpdate } from "ra-core";
import { Link } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DataBoundary,
  EmptyState,
  PageHeader,
  StatusBadge,
} from "./components";
import type {
  FieldMappingSet,
  FieldMappingVersion,
  SourceConnection,
} from "./types";
import { getErrorMessage } from "./utils";
import { useWorkspace } from "./workspace";

type MappingRow = {
  id: string;
  sourceField: string;
  targetField: string;
};

const fileColumnFields = [
  { value: "companyName", label: "企业名称" },
  { value: "creditCode", label: "统一社会信用代码" },
  { value: "legalPerson", label: "法定代表人" },
  { value: "companyType", label: "企业类型" },
  { value: "registeredCapital", label: "注册资本（原列）" },
  { value: "paidInCapital", label: "实缴资本（原列）" },
  { value: "establishedDate", label: "成立日期" },
  { value: "approvedDate", label: "核准日期" },
  { value: "registrationAuthority", label: "登记机关" },
  { value: "status", label: "经营状态（原列）" },
  { value: "industryL1", label: "一级行业" },
  { value: "industryL2", label: "二级行业" },
  { value: "regionRaw", label: "地区原始值" },
  { value: "province", label: "省" },
  { value: "city", label: "市" },
  { value: "district", label: "区县" },
  { value: "personnelScale", label: "人员规模（原列）" },
  { value: "insuredCount", label: "参保人数" },
  { value: "registeredAddress", label: "注册地址" },
  { value: "businessScope", label: "经营范围" },
  { value: "phone", label: "联系电话" },
  { value: "email", label: "邮箱" },
  { value: "phoneCount", label: "电话数量" },
  { value: "emailCount", label: "邮箱数量" },
  { value: "qualificationTags", label: "资质标签" },
  { value: "riskTags", label: "风险标签" },
  { value: "operationalTags", label: "经营标签" },
];

const capitalUnits = [
  { value: "wan_cny", label: "万元人民币" },
  { value: "cny", label: "元人民币" },
  { value: "million_cny", label: "百万元人民币" },
  { value: "yi_cny", label: "亿元人民币" },
];

function emptyRow(): MappingRow {
  return { id: crypto.randomUUID(), sourceField: "", targetField: "" };
}

function rowsFromDefinition(
  definition?: Record<string, unknown>,
): MappingRow[] {
  const columns = definition?.columns;
  if (!columns || typeof columns !== "object" || Array.isArray(columns))
    return [];
  return Object.entries(columns as Record<string, unknown>).flatMap(
    ([targetField, sourceField]) =>
      typeof sourceField === "string" && sourceField
        ? [{ id: crypto.randomUUID(), sourceField, targetField }]
        : [],
  );
}

function unitFromDefinition(
  definition: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
) {
  const units = definition?.units;
  if (!units || typeof units !== "object" || Array.isArray(units))
    return fallback;
  const value = (units as Record<string, unknown>)[key];
  return typeof value === "string" ? value : fallback;
}

export function FieldMappingsPage() {
  const { workspace } = useWorkspace();
  const notify = useNotify();
  const sets = useGetList<FieldMappingSet>("field_mapping_sets", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "updated_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });
  const versions = useGetList<FieldMappingVersion>("field_mapping_versions", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "version_number", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });
  const sources = useGetList<SourceConnection>("source_connections_safe", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "name", order: "ASC" },
    filter: { workspace_id: workspace?.id },
  });
  const [create] = useCreate();
  const [update] = useUpdate();
  const [selectedSetId, setSelectedSetId] = useState("new");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [registeredCapitalUnit, setRegisteredCapitalUnit] = useState("wan_cny");
  const [paidInCapitalUnit, setPaidInCapitalUnit] = useState("wan_cny");
  const [legalPersonShareUnit, setLegalPersonShareUnit] = useState("percent");
  const [isSaving, setIsSaving] = useState(false);

  const selectedSet = sets.data?.find((item) => item.id === selectedSetId);
  const selectedVersion = useMemo(
    () =>
      versions.data
        ?.filter((item) => item.mapping_set_id === selectedSetId)
        .sort((a, b) => b.version_number - a.version_number)[0],
    [selectedSetId, versions.data],
  );
  const fileConnection = sources.data?.find(
    (source) => source.provider === "file_upload",
  );
  const isBuiltIn = Boolean(
    selectedSet && selectedSet.provider !== "file_upload",
  );

  useEffect(() => {
    if (!selectedSet) {
      if (selectedSetId === "new") {
        setName("");
        setDescription("");
        setRows([]);
        setRegisteredCapitalUnit("wan_cny");
        setPaidInCapitalUnit("wan_cny");
        setLegalPersonShareUnit("percent");
      }
      return;
    }
    setName(selectedSet.name);
    setDescription(selectedSet.description ?? "");
    setRows(rowsFromDefinition(selectedVersion?.mapping_definition));
    setRegisteredCapitalUnit(
      unitFromDefinition(
        selectedVersion?.mapping_definition,
        "registeredCapital",
        "wan_cny",
      ),
    );
    setPaidInCapitalUnit(
      unitFromDefinition(
        selectedVersion?.mapping_definition,
        "paidInCapital",
        "wan_cny",
      ),
    );
    setLegalPersonShareUnit(
      unitFromDefinition(
        selectedVersion?.mapping_definition,
        "legalPersonShare",
        "percent",
      ),
    );
  }, [selectedSet, selectedSetId, selectedVersion]);

  const updateRow = (id: string, change: Partial<MappingRow>) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...change } : row)),
    );
  };

  const save = async () => {
    if (!fileConnection) {
      notify("请先初始化文件上传数据源。", { type: "warning" });
      return;
    }
    if (isBuiltIn) {
      notify("企查查和获客助手使用内置审计映射，不能在 GUI 中改写。", {
        type: "warning",
      });
      return;
    }
    if (!name.trim()) {
      notify("请填写映射名称。", { type: "warning" });
      return;
    }
    if (
      rows.length === 0 ||
      rows.some((row) => !row.sourceField.trim() || !row.targetField)
    ) {
      notify("请至少添加一条完整字段映射。", { type: "warning" });
      return;
    }
    if (new Set(rows.map((row) => row.targetField)).size !== rows.length) {
      notify("同一统一字段只能映射一个文件列。", { type: "warning" });
      return;
    }

    setIsSaving(true);
    try {
      let mappingSet = selectedSet;
      if (!mappingSet) {
        mappingSet = (await create(
          "field_mapping_sets",
          {
            data: {
              workspace_id: workspace!.id,
              provider: "file_upload",
              name: name.trim(),
              description: description.trim() || null,
              status: "draft",
            },
          },
          { returnPromise: true },
        )) as FieldMappingSet;
      }
      const currentVersions = (versions.data ?? []).filter(
        (version) => version.mapping_set_id === mappingSet!.id,
      );
      const nextVersion =
        Math.max(0, ...currentVersions.map((item) => item.version_number)) + 1;
      const columns = Object.fromEntries(
        rows.map((row) => [row.targetField, row.sourceField.trim()]),
      );
      await create(
        "field_mapping_versions",
        {
          data: {
            workspace_id: workspace!.id,
            mapping_set_id: mappingSet.id,
            version_number: nextVersion,
            status: "published",
            canonical_schema_version: "1.0",
            mapping_definition: {
              schemaVersion: "1.0",
              provider: "file_upload",
              columns,
              units: {
                registeredCapital: registeredCapitalUnit,
                paidInCapital: paidInCapitalUnit,
                legalPersonShare: legalPersonShareUnit,
              },
            },
            change_note: selectedSet ? "由 GUI 保存新版本" : "初始文件映射版本",
            published_at: new Date().toISOString(),
          },
        },
        { returnPromise: true },
      );
      await update(
        "field_mapping_sets",
        {
          id: mappingSet.id,
          data: {
            name: name.trim(),
            description: description.trim() || null,
            status: "active",
            current_version_number: nextVersion,
          },
          previousData: mappingSet,
        },
        { returnPromise: true },
      );
      notify(`文件字段映射 v${nextVersion} 已保存并发布。`, {
        type: "success",
      });
      setSelectedSetId(mappingSet.id);
      await Promise.all([sets.refetch(), versions.refetch()]);
    } catch (error) {
      notify(getErrorMessage(error), { type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const loading = sets.isPending || versions.isPending || sources.isPending;
  const error = sets.error || versions.error || sources.error;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="字段标准化"
        title="字段映射"
        description="获客助手与企查查采用随适配器发布的审计映射，只读不可改；用户上传文件可以按真实表头配置列映射和单位。"
        actions={
          <Button variant="outline" onClick={() => setSelectedSetId("new")}>
            <Plus />
            新建文件映射
          </Button>
        }
      />

      <DataBoundary
        isPending={loading}
        error={error}
        title="无法读取字段映射配置"
      >
        <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
          <Card className="h-fit shadow-none">
            <CardHeader>
              <CardTitle>映射方案</CardTitle>
              <CardDescription>
                供应商内置映射只读，文件映射可版本化。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <button
                type="button"
                onClick={() => setSelectedSetId("new")}
                className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                  selectedSetId === "new"
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/40"
                }`}
              >
                <span className="font-medium">新文件映射</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  使用上传文件的真实列名
                </span>
              </button>
              {sets.data?.map((mappingSet) => (
                <button
                  key={mappingSet.id}
                  type="button"
                  onClick={() => setSelectedSetId(mappingSet.id)}
                  className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                    selectedSetId === mappingSet.id
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/40"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">
                      {mappingSet.name}
                    </span>
                    {mappingSet.provider === "file_upload" ? (
                      <StatusBadge status={mappingSet.status} />
                    ) : (
                      <Badge variant="outline">
                        <LockKeyhole />
                        内置
                      </Badge>
                    )}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {mappingSet.provider} · v
                    {mappingSet.current_version_number ?? "—"}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>

          {isBuiltIn ? (
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LockKeyhole className="size-5" />
                  {selectedSet?.name}
                </CardTitle>
                <CardDescription>
                  该映射属于生产适配器合同，随代码审计和测试发布，GUI
                  不允许改写供应商字段语义。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <GitCompareArrows />
                  <AlertTitle>只读审计合同</AlertTitle>
                  <AlertDescription>
                    如供应商字段升级，应修改对应适配器、补充映射测试并发布新版本，不能由普通用户临时改变口径。
                  </AlertDescription>
                </Alert>
                <div className="rounded-xl border bg-slate-950 p-4 text-slate-100">
                  <pre className="max-h-[520px] overflow-auto text-xs leading-6">
                    {JSON.stringify(
                      selectedVersion?.mapping_definition ?? {},
                      null,
                      2,
                    )}
                  </pre>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-none">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>文件映射编辑器</CardTitle>
                    <CardDescription className="mt-1.5">
                      源字段填写 CSV / Excel 表头或 JSON
                      字段名；系统只保存已明确选择的映射。
                    </CardDescription>
                  </div>
                  {selectedVersion ? (
                    <Badge variant="outline">
                      当前 v{selectedVersion.version_number}
                    </Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <Alert>
                  <GitCompareArrows />
                  <AlertTitle>当前为手工表头映射</AlertTitle>
                  <AlertDescription>
                    浏览器不解析或持久化文件前 10
                    行样例；请依据真实表头填写。文件上传后，后端会用所选映射解析，不匹配的列会在导入任务中真实报错。
                  </AlertDescription>
                </Alert>
                {!fileConnection ? (
                  <Alert>
                    <GitCompareArrows />
                    <AlertTitle>请先初始化文件上传数据源</AlertTitle>
                    <AlertDescription>
                      没有 file_upload 连接时不会保存孤立映射。
                      <Button asChild variant="link" className="h-auto px-1">
                        <Link to="/sources">前往数据源</Link>
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="mapping-name">方案名称</Label>
                    <Input
                      id="mapping-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="例如：客户名单模板 2026"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>适配器</Label>
                    <Input
                      aria-label="适配器"
                      value="file_upload"
                      readOnly
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="mapping-description">说明</Label>
                    <Input
                      id="mapping-description"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="记录文件模板来源和适用范围"
                    />
                  </div>
                </div>

                <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-3">
                  <UnitSelect
                    label="注册资本原列单位"
                    value={registeredCapitalUnit}
                    onChange={setRegisteredCapitalUnit}
                  />
                  <UnitSelect
                    label="实缴资本原列单位"
                    value={paidInCapitalUnit}
                    onChange={setPaidInCapitalUnit}
                  />
                  <div className="space-y-2">
                    <Label>法人持股比例单位</Label>
                    <Select
                      value={legalPersonShareUnit}
                      onValueChange={setLegalPersonShareUnit}
                    >
                      <SelectTrigger
                        aria-label="法人持股比例单位"
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">百分数（如 25）</SelectItem>
                        <SelectItem value="ratio">比例（如 0.25）</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">文件列映射</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        页面不提供未接入执行器的“转换”选项，避免配置保存后实际不生效。
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setRows((current) => [...current, emptyRow()])
                      }
                    >
                      <Plus />
                      添加字段
                    </Button>
                  </div>

                  {rows.length === 0 ? (
                    <EmptyState
                      title="尚未添加文件列"
                      description="查看真实文件表头后，再把列名映射到统一字段。"
                      action={
                        <Button
                          className="mt-5"
                          onClick={() => setRows([emptyRow()])}
                        >
                          添加第一条映射
                        </Button>
                      }
                    />
                  ) : (
                    <div className="space-y-3">
                      {rows.map((row, index) => (
                        <div
                          key={row.id}
                          className="grid gap-3 rounded-xl border p-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end"
                        >
                          <div className="space-y-2">
                            <Label htmlFor={`source-${row.id}`}>
                              文件列 {index + 1}
                            </Label>
                            <Input
                              id={`source-${row.id}`}
                              value={row.sourceField}
                              onChange={(event) =>
                                updateRow(row.id, {
                                  sourceField: event.target.value,
                                })
                              }
                              placeholder="真实表头或 JSON 字段名"
                              className="font-mono text-xs"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>统一字段</Label>
                            <Select
                              value={row.targetField}
                              onValueChange={(value) =>
                                updateRow(row.id, { targetField: value })
                              }
                            >
                              <SelectTrigger
                                aria-label={`文件列 ${index + 1} 的统一字段`}
                                className="w-full"
                              >
                                <SelectValue placeholder="选择目标字段" />
                              </SelectTrigger>
                              <SelectContent>
                                {fileColumnFields.map((field) => (
                                  <SelectItem
                                    key={field.value}
                                    value={field.value}
                                  >
                                    {field.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="删除字段映射"
                            onClick={() =>
                              setRows((current) =>
                                current.filter((item) => item.id !== row.id),
                              )
                            }
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end border-t pt-5">
                  <Button onClick={save} disabled={isSaving || !fileConnection}>
                    {isSaving ? <Loader2 className="animate-spin" /> : null}
                    保存为新版本
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DataBoundary>
    </div>
  );
}

function UnitSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {capitalUnits.map((unit) => (
            <SelectItem key={unit.value} value={unit.value}>
              {unit.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
