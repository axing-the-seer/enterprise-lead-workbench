import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  FileSpreadsheet,
  Loader2,
  Search,
  UploadCloud,
} from "lucide-react";
import { useGetList, useNotify } from "ra-core";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
import {
  DataBoundary,
  EmptyState,
  PageHeader,
  StatusBadge,
} from "./components";
import type {
  CompanyList,
  FieldMappingSet,
  FieldMappingVersion,
  IngestionJob,
  SourceConnection,
  WorkbenchJobResponse,
} from "./types";
import { formatDateTime, formatNumber, getErrorMessage } from "./utils";
import { useWorkspace } from "./workspace";
import { SourceQueryDialog } from "./SourceQueryDialog";
import {
  createIdempotencyKey,
  runWorkbenchAction,
  uploadWorkbenchImport,
} from "./workbenchActions";
import { createFilePreview, type FilePreview } from "./filePreview";

export function BatchesPage() {
  const { workspace } = useWorkspace();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [queryOpen, setQueryOpen] = useState(false);
  const lists = useGetList<CompanyList>("company_lists", {
    pagination: { page: 1, perPage: 50 },
    sort: { field: "created_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });
  const jobs = useGetList<IngestionJob>("ingestion_jobs", {
    pagination: { page: 1, perPage: 20 },
    sort: { field: "requested_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });
  const sources = useGetList<SourceConnection>("source_connections_safe", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "name", order: "ASC" },
    filter: { workspace_id: workspace?.id },
  });
  const mappingSets = useGetList<FieldMappingSet>("field_mapping_sets", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "updated_at", order: "DESC" },
    filter: { workspace_id: workspace?.id, provider: "file_upload" },
  });
  const mappingVersions = useGetList<FieldMappingVersion>(
    "field_mapping_versions",
    {
      pagination: { page: 1, perPage: 500 },
      sort: { field: "created_at", order: "DESC" },
      filter: { workspace_id: workspace?.id, status: "published" },
    },
  );

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="名单来源"
        title="数据批次"
        description="从获客助手、企查查等已验证连接发起查询，或上传本地文件。每次取数都形成独立批次，保存来源、条件、时间与原始记录。"
        actions={
          <>
            <Button variant="outline" onClick={() => setUploadOpen(true)}>
              <UploadCloud />
              上传文件
            </Button>
            <Button onClick={() => setQueryOpen(true)}>
              <Search />
              从数据源查询
            </Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>企业名单批次</CardTitle>
            <CardDescription>
              规则执行只使用已锁定的名单输入，不在执行途中偷偷追加企业。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataBoundary
              isPending={lists.isPending}
              error={lists.error}
              title="无法读取企业名单批次"
            >
              {(lists.data?.length ?? 0) === 0 ? (
                <EmptyState
                  title="还没有企业名单批次"
                  description="先上传真实名单，或从已验证的获客助手、企查查连接发起查询。后台完成解析、映射和去重后，批次会出现在这里。"
                  action={
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setUploadOpen(true)}
                      >
                        上传文件
                      </Button>
                      <Button onClick={() => setQueryOpen(true)}>
                        发起查询
                      </Button>
                    </div>
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>批次名称</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>创建时间</TableHead>
                      <TableHead className="text-right">下一步</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lists.data?.map((list) => (
                      <TableRow key={list.id}>
                        <TableCell>
                          <p className="font-medium">{list.name}</p>
                          {list.description ? (
                            <p className="mt-1 max-w-sm truncate text-xs text-muted-foreground">
                              {list.description}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={list.status} />
                        </TableCell>
                        <TableCell>{formatDateTime(list.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="ghost" size="sm">
                            <Link to={`/rules?companyListId=${list.id}`}>
                              配置规则
                              <ArrowRight />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </DataBoundary>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>接入任务</CardTitle>
            <CardDescription>
              “文件已上传”和“导入已完成”是两个不同状态。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataBoundary
              isPending={jobs.isPending}
              error={jobs.error}
              title="无法读取接入任务"
            >
              <div className="space-y-3">
                {jobs.data?.map((job) => (
                  <div key={job.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">
                        {job.job_kind === "import" ? "文件导入" : "数据源查询"}
                      </p>
                      <StatusBadge status={job.status} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatDateTime(job.requested_at)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline">
                        接收 {formatNumber(job.received_count)}
                      </Badge>
                      <Badge variant="outline">
                        接纳 {formatNumber(job.accepted_count)}
                      </Badge>
                      <Badge variant="outline">
                        拒绝 {formatNumber(job.rejected_count)}
                      </Badge>
                    </div>
                    {job.error_message ? (
                      <p className="mt-3 text-xs text-red-600">
                        {job.error_code ? `${job.error_code}：` : ""}
                        {job.error_message}
                      </p>
                    ) : null}
                  </div>
                ))}
                {(jobs.data?.length ?? 0) === 0 ? (
                  <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    暂无接入任务
                  </p>
                ) : null}
              </div>
            </DataBoundary>
          </CardContent>
        </Card>
      </div>

      <FileUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        workspaceId={workspace!.id}
        sources={sources.data ?? []}
        sourcesError={sources.error}
        mappingSets={mappingSets.data ?? []}
        mappingVersions={mappingVersions.data ?? []}
        mappingsError={mappingSets.error || mappingVersions.error}
        onSubmitted={() => void jobs.refetch()}
      />
      <SourceQueryDialog
        open={queryOpen}
        onOpenChange={setQueryOpen}
        workspaceId={workspace!.id}
        sources={sources.data ?? []}
        sourcesError={sources.error}
        onSubmitted={() => void jobs.refetch()}
      />
    </div>
  );
}

export function FileUploadDialog({
  open,
  onOpenChange,
  workspaceId,
  sources,
  sourcesError,
  mappingSets,
  mappingVersions,
  mappingsError,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  sources: SourceConnection[];
  sourcesError: unknown;
  mappingSets: FieldMappingSet[];
  mappingVersions: FieldMappingVersion[];
  mappingsError: unknown;
  onSubmitted: (receipt: WorkbenchJobResponse) => void;
}) {
  const notify = useNotify();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileSources = useMemo(
    () => sources.filter((source) => source.provider === "file_upload"),
    [sources],
  );
  const [sourceId, setSourceId] = useState("");
  const [mappingVersionId, setMappingVersionId] = useState("auto");
  const [file, setFile] = useState<File | null>(null);
  const [previewState, setPreviewState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; preview: FilePreview }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<WorkbenchJobResponse | null>(null);
  const defaultMappingAppliedRef = useRef(false);
  const previewRequestRef = useRef(0);
  const retryRef = useRef<{
    fingerprint: string;
    storagePath: string;
    idempotencyKey: string;
  } | null>(null);
  const selectedSource = fileSources.find((source) => source.id === sourceId);
  const fileMappingSetIds = useMemo(
    () => new Set(mappingSets.map((mappingSet) => mappingSet.id)),
    [mappingSets],
  );
  const publishedFileVersions = useMemo(
    () =>
      mappingVersions.filter((version) =>
        fileMappingSetIds.has(version.mapping_set_id),
      ),
    [fileMappingSetIds, mappingVersions],
  );
  const mappingSetNames = useMemo(
    () =>
      new Map(
        mappingSets.map((mappingSet) => [mappingSet.id, mappingSet.name]),
      ),
    [mappingSets],
  );

  const resetSubmission = () => {
    retryRef.current = null;
    setReceipt(null);
  };

  useEffect(() => {
    if (fileSources.length === 1) setSourceId(fileSources[0].id);
  }, [fileSources]);

  useEffect(() => {
    if (!defaultMappingAppliedRef.current && publishedFileVersions.length > 0) {
      defaultMappingAppliedRef.current = true;
      setMappingVersionId(publishedFileVersions[0].id);
    }
  }, [publishedFileVersions]);

  useEffect(() => {
    if (!open) {
      previewRequestRef.current += 1;
      setFile(null);
      setPreviewState({ status: "idle" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      resetSubmission();
    }
  }, [open]);

  const selectFile = (selectedFile: File | null) => {
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setFile(selectedFile);
    resetSubmission();
    if (!selectedFile) {
      setPreviewState({ status: "idle" });
      return;
    }

    setPreviewState({ status: "loading" });
    void createFilePreview(selectedFile)
      .then((preview) => {
        if (previewRequestRef.current === requestId) {
          setPreviewState({ status: "ready", preview });
        }
      })
      .catch((error: unknown) => {
        if (previewRequestRef.current === requestId) {
          setPreviewState({
            status: "error",
            message: getErrorMessage(error),
          });
        }
      });
  };

  const submit = async () => {
    if (
      !file ||
      !sourceId ||
      selectedSource?.status !== "ready" ||
      previewState.status !== "ready"
    ) {
      return;
    }
    setIsSubmitting(true);
    setReceipt(null);
    try {
      const mediaType = importMediaType(file);
      const fingerprint = [
        sourceId,
        file.name,
        file.size,
        file.lastModified,
      ].join(":");
      let retry = retryRef.current;
      if (!retry || retry.fingerprint !== fingerprint) {
        const storagePath = await uploadWorkbenchImport(workspaceId, file);
        retry = {
          fingerprint,
          storagePath,
          idempotencyKey: createIdempotencyKey("upload"),
        };
        retryRef.current = retry;
        notify("文件已上传，正在提交后端导入任务。", { type: "info" });
      } else {
        notify("正在重试同一个导入请求，不重复上传文件。", {
          type: "info",
        });
      }
      const job = await runWorkbenchAction(
        "start_ingestion",
        workspaceId,
        {
          sourceConnectionId: sourceId,
          storagePath: retry.storagePath,
          fileName: file.name,
          mediaType,
          ...(mappingVersionId !== "auto" ? { mappingVersionId } : {}),
        },
        retry.idempotencyKey,
      );
      setReceipt(job);
      notify(`导入任务已提交（${job.status}）`, { type: "success" });
      onSubmitted(job);
    } catch (error) {
      notify(getErrorMessage(error), { type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>上传真实企业名单</DialogTitle>
          <DialogDescription>
            支持 CSV、JSON、XLSX，单文件最大 20 MiB。选择后会在本机预览表头和前
            10 行，确认上传前不会保存文件或预览内容。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {sourcesError ? (
            <Alert variant="destructive">
              <AlertTitle>无法读取文件上传数据源</AlertTitle>
              <AlertDescription>
                {getErrorMessage(sourcesError)}
              </AlertDescription>
            </Alert>
          ) : null}
          {fileSources.length === 0 ? (
            <Alert>
              <AlertTitle>请先初始化文件上传数据源</AlertTitle>
              <AlertDescription>
                初始化会创建 provider=file_upload
                的租户连接。请到数据源页面完成配置后再上传。
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              <Label>文件上传连接</Label>
              <Select
                value={sourceId}
                onValueChange={(value) => {
                  setSourceId(value);
                  resetSubmission();
                }}
              >
                <SelectTrigger className="w-full" aria-label="文件上传连接">
                  <SelectValue placeholder="选择文件上传连接" />
                </SelectTrigger>
                <SelectContent>
                  {fileSources.map((source) => (
                    <SelectItem
                      key={source.id}
                      value={source.id}
                      disabled={source.status !== "ready"}
                    >
                      {source.name}（{source.status}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {mappingsError ? (
            <Alert variant="destructive">
              <AlertTitle>无法读取文件映射版本</AlertTitle>
              <AlertDescription>
                {getErrorMessage(mappingsError)}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              <Label>字段映射</Label>
              <Select
                value={mappingVersionId}
                onValueChange={(value) => {
                  setMappingVersionId(value);
                  resetSubmission();
                }}
              >
                <SelectTrigger className="w-full" aria-label="字段映射">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    不选映射：使用内置中文表头自动识别
                  </SelectItem>
                  {publishedFileVersions.map((version) => (
                    <SelectItem key={version.id} value={version.id}>
                      {mappingSetNames.get(version.mapping_set_id) ??
                        "文件映射"}{" "}
                      · v{version.version_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                已默认选中最新发布版本。非标准表头如不选映射，后端会在真实导入任务中报出无法识别的列。
              </p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json,.xlsx,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(event) => {
              selectFile(event.target.files?.[0] ?? null);
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.value = "";
                fileInputRef.current.click();
              }
            }}
            className="flex min-h-36 w-full flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-5 text-center transition-colors hover:bg-muted/40"
          >
            <FileSpreadsheet className="mb-3 size-7 text-muted-foreground" />
            <span className="text-sm font-medium">
              {file?.name ?? "选择 CSV、JSON 或 XLSX 文件"}
            </span>
            <span className="mt-1 text-xs text-muted-foreground">
              {file
                ? `${(file.size / 1024 / 1024).toFixed(2)} MiB`
                : "仅在当前对话框中读取预览，不执行表格公式"}
            </span>
          </button>
          {previewState.status === "loading" ? (
            <Alert>
              <Loader2 className="animate-spin" />
              <AlertTitle>正在生成本地预览</AlertTitle>
              <AlertDescription>
                仅读取表头和前 10 行，此时尚未上传。
              </AlertDescription>
            </Alert>
          ) : null}
          {previewState.status === "error" ? (
            <Alert variant="destructive">
              <AlertTitle>无法预览已选文件</AlertTitle>
              <AlertDescription>{previewState.message}</AlertDescription>
            </Alert>
          ) : null}
          {previewState.status === "ready" ? (
            <FilePreviewPanel preview={previewState.preview} />
          ) : null}
          {receipt ? (
            <Alert>
              <AlertTitle>已提交导入</AlertTitle>
              <AlertDescription>
                系统正在解析、映射和去重。完成后可在“我的名单”查看。
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={submit}
            disabled={
              !file ||
              !sourceId ||
              selectedSource?.status !== "ready" ||
              previewState.status !== "ready" ||
              isSubmitting ||
              Boolean(receipt)
            }
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin" />
            ) : (
              <UploadCloud />
            )}
            上传并提交导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FilePreviewPanel({ preview }: { preview: FilePreview }) {
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div>
        <p className="text-sm font-medium">检测到的表头</p>
        <div className="mt-2 flex max-h-20 flex-wrap gap-1 overflow-auto">
          {preview.headers.map((header, index) => (
            <Badge key={`${index}-${header}`} variant="secondary">
              {header}
            </Badge>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">数据预览</p>
        <p className="text-xs text-muted-foreground">
          {preview.hasMoreRows
            ? `显示前 ${preview.rows.length} 行`
            : `共 ${preview.totalRowCount ?? preview.rows.length} 行`}
        </p>
      </div>
      <div className="max-h-72 overflow-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {preview.headers.map((header, index) => (
                <TableHead
                  key={`${index}-${header}`}
                  className="whitespace-nowrap"
                >
                  {header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.rows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {preview.headers.map((_, columnIndex) => (
                  <TableCell
                    key={columnIndex}
                    className="max-w-64 whitespace-pre-wrap break-words align-top text-xs"
                  >
                    {row[columnIndex] ?? ""}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        预览只以普通文本显示，不执行公式、链接或
        HTML。完整文件仍由后端按所选映射版本校验。
      </p>
    </div>
  );
}

function importMediaType(file: File) {
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "csv") return "text/csv";
  if (extension === "json") return "application/json";
  if (extension === "xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  throw new Error("只支持 CSV、JSON 或 XLSX 文件。");
}
