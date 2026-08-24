import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CaretLeft,
  CaretRight,
  CheckCircle,
  DownloadSimple,
  FileHtml,
  Funnel,
  IdentificationCard,
  MagnifyingGlass,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import { useGetList, useGetOne, useNotify, useUpdate } from "ra-core";
import { Link, useParams } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CompanyDetailDrawer } from "./CompanyDetailDrawer";
import { exportCompanies } from "./listExport";
import type {
  Company,
  CompanyList,
  CompanyListMember,
  CompanyReport,
  IngestionJob,
  SourceConnection,
  SourceQuery,
  SourceSnapshot,
} from "./types";
import {
  displayCompanyRegion,
  enrichCompanyFromSnapshot,
  formatCapitalWan,
  isNormalOperatingStatus,
  operatingStatusLabel,
} from "./companyPresentation";
import { formatDateTime, getErrorMessage } from "./utils";
import { useWorkspace } from "./workspace";
import { createIdempotencyKey, runWorkbenchAction } from "./workbenchActions";

const PAGE_SIZE = 20;

export function ListDetailPage() {
  const { listId = "" } = useParams();
  const { workspace } = useWorkspace();
  const notify = useNotify();
  const list = useGetOne<CompanyList>(
    "company_lists",
    { id: listId },
    { enabled: Boolean(listId) },
  );
  const members = useGetList<CompanyListMember>("company_list_members", {
    pagination: { page: 1, perPage: 5000 },
    sort: { field: "added_at", order: "DESC" },
    filter: { workspace_id: workspace?.id, company_list_id: listId },
  });
  const companies = useGetList<Company>("companies", {
    pagination: { page: 1, perPage: 5000 },
    sort: { field: "updated_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });
  const sources = useGetList<SourceConnection>("source_connections_safe", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "name", order: "ASC" },
    filter: { workspace_id: workspace?.id },
  });
  const jobs = useGetList<IngestionJob>(
    "ingestion_jobs",
    {
      pagination: { page: 1, perPage: 500 },
      sort: { field: "requested_at", order: "DESC" },
      filter: { workspace_id: workspace?.id },
    },
    {
      refetchInterval: (result) =>
        (result.state.data?.data ?? []).some((job) =>
          ["queued", "running"].includes(job.status),
        )
          ? 2_000
          : false,
    },
  );
  const agentReports = useGetList<CompanyReport>("company_reports", {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: "submitted_at", order: "DESC" },
    filter: { workspace_id: workspace?.id, is_current: true },
  });
  const queries = useGetList<SourceQuery>("source_queries", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "created_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });
  const snapshots = useGetList<SourceSnapshot>("source_snapshots", {
    pagination: { page: 1, perPage: 5000 },
    sort: { field: "captured_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });
  const [updateMember] = useUpdate<CompanyListMember>();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [reportStatus, setReportStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerCompany, setDrawerCompany] = useState<Company | null>(null);
  const [drawerTab, setDrawerTab] = useState<"profile" | "sources" | "report">(
    "profile",
  );
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"csv" | "json" | "xlsx">(
    "xlsx",
  );
  const [exporting, setExporting] = useState(false);
  const [excludeOpen, setExcludeOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const refreshedJobSignature = useRef("");

  const completedJobSignature = (jobs.data ?? [])
    .filter((job) => ["completed", "partial", "failed"].includes(job.status))
    .map((job) => `${job.id}:${job.completed_at ?? job.status}`)
    .sort()
    .join("|");

  useEffect(() => {
    if (
      !completedJobSignature ||
      completedJobSignature === refreshedJobSignature.current
    )
      return;
    refreshedJobSignature.current = completedJobSignature;
    void Promise.all([companies.refetch(), snapshots.refetch()]);
  }, [completedJobSignature, companies, snapshots]);

  const memberMap = useMemo(
    () =>
      new Map(
        (members.data ?? []).map((member) => [
          String(member.company_id),
          member,
        ]),
      ),
    [members.data],
  );
  const snapshotsByCompany = useMemo(() => {
    const map = new Map<string, SourceSnapshot[]>();
    for (const snapshot of snapshots.data ?? []) {
      if (snapshot.company_id != null) {
        const key = String(snapshot.company_id);
        map.set(key, [...(map.get(key) ?? []), snapshot]);
      }
    }
    return map;
  }, [snapshots.data]);
  const listCompanies = useMemo(
    () =>
      (companies.data ?? [])
        .filter((company) => memberMap.has(String(company.id)))
        .map((company) =>
          (snapshotsByCompany.get(String(company.id)) ?? []).reduce(
            (enriched, snapshot) =>
              enrichCompanyFromSnapshot(enriched, snapshot),
            company,
          ),
        ),
    [companies.data, memberMap, snapshotsByCompany],
  );
  const reportsByCompany = useMemo(() => {
    const map = new Map<string, IngestionJob>();
    for (const job of jobs.data ?? []) {
      const companyId = reportCompanyId(job);
      if (companyId && !map.has(companyId)) map.set(companyId, job);
    }
    return map;
  }, [jobs.data]);
  const completedReportsByCompany = useMemo(
    () =>
      new Map(
        (agentReports.data ?? []).map((report) => [
          String(report.company_id),
          report,
        ]),
      ),
    [agentReports.data],
  );
  const activeListCompanies = useMemo(
    () =>
      listCompanies.filter(
        (company) =>
          memberMap.get(String(company.id))?.membership_status !== "excluded",
      ),
    [listCompanies, memberMap],
  );
  const filtered = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("zh-CN");
    return activeListCompanies.filter((company) => {
      if (
        keyword &&
        ![
          company.name,
          company.unified_social_credit_code,
          company.legal_representative,
          company.industry_name,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLocaleLowerCase("zh-CN").includes(keyword),
          )
      )
        return false;
      if (status !== "all" && company.operating_status !== status) return false;
      const report = reportsByCompany.get(String(company.id));
      if (
        reportStatus === "ready" &&
        !completedReportsByCompany.has(String(company.id))
      )
        return false;
      if (
        reportStatus === "missing" &&
        (completedReportsByCompany.has(String(company.id)) ||
          ["queued", "running"].includes(report?.status ?? ""))
      )
        return false;
      return true;
    });
  }, [
    activeListCompanies,
    completedReportsByCompany,
    reportStatus,
    reportsByCompany,
    search,
    status,
  ]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const query = (queries.data ?? []).find(
    (item) => item.id === list.data?.source_query_id,
  );
  const chips = queryCriteriaChips(query?.criteria);
  const qcc = (sources.data ?? []).find(
    (source) =>
      source.provider === "qcc" &&
      ["ready", "degraded"].includes(source.status),
  );
  const selectedCompanies = activeListCompanies.filter((company) =>
    selected.has(String(company.id)),
  );
  const exportTargets = selected.size ? selectedCompanies : filtered;
  const readyReportCount = activeListCompanies.filter((company) =>
    completedReportsByCompany.has(String(company.id)),
  ).length;

  const toggleVisible = (checked: boolean | "indeterminate") => {
    setSelected((current) => {
      const next = new Set(current);
      for (const company of visible) {
        if (checked === true) next.add(String(company.id));
        else next.delete(String(company.id));
      }
      return next;
    });
  };

  const doExport = async () => {
    setExporting(true);
    try {
      await exportCompanies(
        exportTargets,
        exportFormat,
        list.data?.name || "企业名单",
      );
      notify(`已导出 ${exportTargets.length} 家企业。`, {
        type: "success",
      });
      setExportOpen(false);
    } catch (error) {
      notify(`导出失败：${friendlyExportError(error)}`, { type: "error" });
    } finally {
      setExporting(false);
    }
  };

  const verifySelected = async () => {
    if (!qcc || !workspace) return;
    const targets = selectedCompanies.slice(0, 5);
    setVerifyOpen(false);
    setVerifying(true);
    let succeeded = 0;
    try {
      for (const company of targets) {
        await runWorkbenchAction(
          "start_ingestion",
          workspace.id,
          {
            sourceConnectionId: qcc.id,
            queryKind: "company_detail",
            queryText: `核验 ${company.name} 工商登记信息`,
            listName: list.data?.name || "企查查核验名单",
            criteria: {
              searchKey: company.unified_social_credit_code || company.name,
            },
          },
          createIdempotencyKey("qcc-batch-verify"),
        );
        succeeded += 1;
      }
      notify(`已顺序提交 ${succeeded} 家企查查核验；任务不会并发轰炸接口。`, {
        type: "info",
      });
      await jobs.refetch();
    } catch (error) {
      notify(`已提交 ${succeeded} 家，后续中止：${getErrorMessage(error)}`, {
        type: "warning",
      });
    } finally {
      setVerifying(false);
    }
  };

  const excludeSelected = async () => {
    const targets = (members.data ?? []).filter((member) =>
      selected.has(String(member.company_id)),
    );
    if (!targets.length) return;
    try {
      for (const member of targets) {
        await updateMember(
          "company_list_members",
          {
            id: member.id,
            data: { membership_status: "excluded" },
            previousData: member,
          },
          { returnPromise: true },
        );
      }
      setSelected(new Set());
      setExcludeOpen(false);
      await members.refetch();
      notify(`已从当前名单移出 ${targets.length} 家，原始企业主档仍保留。`, {
        type: "success",
      });
    } catch (error) {
      notify(getErrorMessage(error), { type: "error" });
    }
  };

  if (list.error) {
    return (
      <Alert variant="destructive">
        <WarningCircle />
        <AlertTitle>无法打开名单</AlertTitle>
        <AlertDescription>{getErrorMessage(list.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mx-auto max-w-[1540px] space-y-6">
      <div>
        <Button
          asChild
          variant="ghost"
          className="-ml-3 rounded-full text-slate-500"
        >
          <Link to="/lists">
            <ArrowLeft />
            返回全部名单
          </Link>
        </Button>
      </div>
      <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-[38px]">
            {list.data?.name ?? "正在读取名单…"}{" "}
            <span className="font-normal text-slate-400">
              · {activeListCompanies.length} 家
            </span>
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            创建于 {formatDateTime(list.data?.created_at)}
            {list.data?.created_by_agent
              ? ` · ${list.data.created_by_agent} 创建`
              : ""}
          </p>
          {chips.length ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <Badge
                  key={chip}
                  variant="outline"
                  className="rounded-full bg-white px-3 py-1.5"
                >
                  {chip}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="h-11 rounded-xl bg-white"
            onClick={() => setExportOpen(true)}
          >
            <DownloadSimple />
            导出
          </Button>
          <Button
            className="h-11 rounded-xl bg-[#0969da] px-5"
            disabled={verifying || !qcc || selected.size === 0}
            onClick={() => setVerifyOpen(true)}
          >
            {verifying ? (
              <SpinnerGap className="animate-spin" />
            ) : (
              <IdentificationCard />
            )}
            {selected.size ? `核验所选 ${selected.size} 家` : "企查查核验"}
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-5 border-y border-black/[0.06] py-4 text-sm">
        <span className="flex items-center gap-2">
          <i className="size-2 rounded-full bg-emerald-500" />
          {activeListCompanies.length} 家可用企业
        </span>
        <span className="flex items-center gap-2">
          <i className="size-2 rounded-full bg-[#0969da]" />
          {readyReportCount} 份企业报告
        </span>
      </div>

      <section className="overflow-hidden rounded-[22px] border border-black/[0.07] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.035)]">
        <div className="flex flex-col gap-3 border-b border-black/[0.06] p-4 lg:flex-row lg:items-center">
          <div className="relative min-w-60 flex-1">
            <MagnifyingGlass className="absolute left-3.5 top-3.5 size-4 text-slate-400" />
            <Input
              aria-label="搜索名单内企业"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="搜索名称、信用代码、法人或行业"
              className="h-11 rounded-xl bg-slate-50 pl-10"
            />
          </div>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          >
            <SelectTrigger
              aria-label="经营状态筛选"
              className="h-11 w-full rounded-xl lg:w-44"
            >
              <Funnel />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部经营状态</SelectItem>
              <SelectItem value="active">正常经营</SelectItem>
              <SelectItem value="cancelled">已注销</SelectItem>
              <SelectItem value="revoked">已吊销</SelectItem>
              <SelectItem value="inactive">非正常</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={reportStatus}
            onValueChange={(value) => {
              setReportStatus(value);
              setPage(1);
            }}
          >
            <SelectTrigger
              aria-label="企业报告状态筛选"
              className="h-11 w-full rounded-xl lg:w-44"
            >
              <FileHtml />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部报告状态</SelectItem>
              <SelectItem value="ready">报告已完成</SelectItem>
              <SelectItem value="missing">报告未完成</SelectItem>
            </SelectContent>
          </Select>
          {selected.size ? (
            <Button
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => setExcludeOpen(true)}
            >
              移出 {selected.size} 家
            </Button>
          ) : null}
        </div>

        <p className="border-b border-black/[0.04] bg-slate-50/70 px-4 py-2 text-[11px] text-slate-500 sm:hidden">
          左右滑动表格可查看信用代码、联系方式和报告状态
        </p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/70">
                <TableHead className="w-11">
                  <Checkbox
                    checked={
                      visible.length > 0 &&
                      visible.every((company) =>
                        selected.has(String(company.id)),
                      )
                    }
                    onCheckedChange={toggleVisible}
                    aria-label="选择当前页"
                  />
                </TableHead>
                <TableHead className="min-w-56">企业名称</TableHead>
                <TableHead className="min-w-44">统一社会信用代码</TableHead>
                <TableHead className="min-w-32">地区</TableHead>
                <TableHead className="min-w-36">行业</TableHead>
                <TableHead>经营状态</TableHead>
                <TableHead>注册资本</TableHead>
                <TableHead>成立日期</TableHead>
                <TableHead>参保人数</TableHead>
                <TableHead>联系方式</TableHead>
                <TableHead className="min-w-32">企业报告</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((company) => {
                const report = reportsByCompany.get(String(company.id));
                const agentReport = completedReportsByCompany.get(
                  String(company.id),
                );
                return (
                  <TableRow
                    key={company.id}
                    tabIndex={0}
                    className="cursor-pointer hover:bg-[#f7faff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0969da]"
                    onClick={() => {
                      setDrawerCompany(company);
                      setDrawerTab("profile");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setDrawerCompany(company);
                        setDrawerTab("profile");
                      }
                    }}
                  >
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(String(company.id))}
                        onCheckedChange={(checked) =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (checked === true) next.add(String(company.id));
                            else next.delete(String(company.id));
                            return next;
                          })
                        }
                        aria-label={`选择${company.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <p className="font-semibold leading-6 text-[#12304f]">
                        {company.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {company.legal_representative
                          ? `法人：${company.legal_representative}`
                          : "法人待核验"}
                      </p>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">
                      {company.unified_social_credit_code ?? "—"}
                    </TableCell>
                    <TableCell>
                      {displayCompanyRegion(company) ?? "—"}
                    </TableCell>
                    <TableCell>{company.industry_name ?? "—"}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        <i
                          className={`size-1.5 rounded-full ${isNormalOperatingStatus(company.operating_status) ? "bg-emerald-500" : "bg-slate-300"}`}
                        />
                        {operatingStatusLabel(company.operating_status)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {formatCapitalWan(company.registered_capital_amount) ??
                        "—"}
                    </TableCell>
                    <TableCell>{company.established_on ?? "—"}</TableCell>
                    <TableCell>
                      {company.insured_employee_count ?? "—"}
                    </TableCell>
                    <TableCell>
                      {company.phone_number || company.phone || "—"}
                    </TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full"
                        onClick={() => {
                          setDrawerCompany(company);
                          setDrawerTab("report");
                        }}
                      >
                        {agentReport ? (
                          <>
                            <CheckCircle className="text-emerald-600" />
                            查看报告
                          </>
                        ) : report &&
                          ["queued", "running"].includes(report.status) ? (
                          <>
                            <SpinnerGap className="animate-spin" />
                            采集中
                          </>
                        ) : report &&
                          ["completed", "partial"].includes(report.status) ? (
                          <>
                            <FileHtml />
                            等待 Agent
                          </>
                        ) : (
                          <>
                            <FileHtml />
                            准备报告
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!visible.length ? (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="h-40 text-center text-sm text-slate-500"
                  >
                    当前条件下没有企业
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col gap-3 border-t border-black/[0.06] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-slate-500">
            {filtered.length
              ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} / ${filtered.length}`
              : "0 家企业"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              <CaretLeft />
              上一页
            </Button>
            <span className="grid size-9 place-items-center rounded-lg bg-[#0969da] font-medium text-white">
              {page}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg"
              disabled={page >= totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              下一页
              <CaretRight />
            </Button>
          </div>
        </div>
      </section>

      <CompanyDetailDrawer
        company={drawerCompany}
        open={Boolean(drawerCompany)}
        onOpenChange={(open) => !open && setDrawerCompany(null)}
        workspaceId={workspace!.id}
        listName={list.data?.name ?? "企业名单"}
        sources={sources.data ?? []}
        jobs={jobs.data ?? []}
        defaultTab={drawerTab}
        onJobsChanged={async () => {
          await jobs.refetch();
        }}
      />

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="rounded-[24px]">
          <DialogHeader>
            <DialogTitle>导出企业名单</DialogTitle>
            <DialogDescription>
              {selected.size
                ? `导出已选 ${exportTargets.length} 家`
                : `导出当前筛选结果 ${exportTargets.length} 家`}
              ，只包含已经入库的真实字段。
            </DialogDescription>
          </DialogHeader>
          <Select
            value={exportFormat}
            onValueChange={(value) =>
              setExportFormat(value as typeof exportFormat)
            }
          >
            <SelectTrigger
              aria-label="导出格式"
              className="h-12 w-full rounded-xl"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="xlsx">Excel（推荐）</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setExportOpen(false)}
            >
              取消
            </Button>
            <Button
              className="rounded-full"
              onClick={doExport}
              disabled={exporting}
            >
              {exporting ? (
                <SpinnerGap className="animate-spin" />
              ) : (
                <DownloadSimple />
              )}
              开始导出
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent className="rounded-[24px]">
          <DialogHeader>
            <DialogTitle>确认企查查核验</DialogTitle>
            <DialogDescription>
              企查查当前生产能力只支持按完整企业名称或统一社会信用代码逐家核验工商登记信息。
            </DialogDescription>
          </DialogHeader>
          <Alert className="border-amber-200 bg-amber-50/70">
            <IdentificationCard />
            <AlertTitle>本次最多调用 5 家</AlertTitle>
            <AlertDescription>
              当前将顺序核验 {Math.min(5, selectedCompanies.length)} 家；超过 5
              家请分批处理。每次查询都可能消耗企查查积分。
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setVerifyOpen(false)}
            >
              取消
            </Button>
            <Button
              className="rounded-full bg-[#0969da]"
              onClick={verifySelected}
            >
              确认并开始核验
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={excludeOpen} onOpenChange={setExcludeOpen}>
        <DialogContent className="rounded-[24px]">
          <DialogHeader>
            <DialogTitle>确认移出企业</DialogTitle>
            <DialogDescription>
              将从当前名单移出 {selected.size}{" "}
              家企业。企业主档、来源快照和公开证据仍会保留，只改变本名单的成员状态。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setExcludeOpen(false)}
            >
              取消
            </Button>
            <Button className="rounded-full" onClick={excludeSelected}>
              确认移出 {selected.size} 家
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function reportCompanyId(job: IngestionJob) {
  const criteria = job.input_params?.criteria;
  if (criteria && typeof criteria === "object" && "companyId" in criteria) {
    return String((criteria as Record<string, unknown>).companyId);
  }
  const result = job.result;
  if (result && "company_id" in result && result.company_id != null) {
    return String(result.company_id);
  }
  return null;
}

function friendlyExportError(error: unknown) {
  const message = getErrorMessage(error);
  if (/dynamically imported module|Failed to fetch|jszip/i.test(message)) {
    return "Excel 组件未能加载，请刷新页面后重试";
  }
  return message;
}

function queryCriteriaChips(criteria?: Record<string, unknown> | null) {
  if (!criteria) return [];
  const chips: string[] = [];
  const regions = Array.isArray(criteria.regions) ? criteria.regions : [];
  const industries = Array.isArray(criteria.industries)
    ? criteria.industries
    : [];
  for (const item of regions)
    if (item && typeof item === "object" && "label" in item)
      chips.push(String(item.label));
  for (const item of industries)
    if (item && typeof item === "object" && "label" in item)
      chips.push(String(item.label));
  if (typeof criteria.keyword === "string" && criteria.keyword)
    chips.push(`关键词：${criteria.keyword}`);
  if (Array.isArray(criteria.statuses) && criteria.statuses.length)
    chips.push(`经营状态：${criteria.statuses.join("、")}`);
  if (
    Array.isArray(criteria.contactRequirements) &&
    criteria.contactRequirements.length
  )
    chips.push(
      criteria.contactRequirements.includes("email")
        ? "有电话及邮箱"
        : "有电话",
    );
  if (criteria.actualOperatingOnly) chips.push("实际经营");
  return chips.slice(0, 8);
}
