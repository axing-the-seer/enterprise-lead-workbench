import type { ReactNode } from "react";
import { AlertCircle, ArrowRight, Database, Inbox } from "lucide-react";
import { Link } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getErrorMessage, statusTone, translateStatus } from "./utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        {eyebrow ? (
          <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-primary uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatusBadge({ status }: { status?: string | null }) {
  return (
    <Badge variant="outline" className={statusTone(status)}>
      {translateStatus(status)}
    </Badge>
  );
}

export function ResourceError({
  title = "无法读取数据",
  error,
}: {
  title?: string;
  error: unknown;
}) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {getErrorMessage(error)}
        。这通常表示生产数据库尚未部署、当前账号没有权限，或后端服务不可用；系统不会用模拟数据代替。
      </AlertDescription>
    </Alert>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  actionTo,
  action,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionTo?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="border-dashed bg-muted/20 shadow-none">
      <CardContent className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
        <span className="mb-4 grid size-11 place-items-center rounded-xl border bg-background text-muted-foreground">
          <Inbox className="size-5" />
        </span>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
          {description}
        </p>
        {action}
        {actionLabel && actionTo ? (
          <Button asChild className="mt-5">
            <Link to={actionTo}>
              {actionLabel}
              <ArrowRight />
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-label="正在加载">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-14 animate-pulse rounded-lg border bg-muted/40"
        />
      ))}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  detail: string;
  tone?: "default" | "blue" | "amber" | "green";
}) {
  const tones = {
    default: "bg-card",
    blue: "border-blue-200 bg-blue-50/50 dark:border-blue-950 dark:bg-blue-950/20",
    amber:
      "border-amber-200 bg-amber-50/50 dark:border-amber-950 dark:bg-amber-950/20",
    green:
      "border-emerald-200 bg-emerald-50/50 dark:border-emerald-950 dark:bg-emerald-950/20",
  };
  return (
    <Card className={cn("gap-2 py-5 shadow-none", tones[tone])}>
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="mt-2 text-2xl font-semibold tracking-tight">
          {value}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

export function DataBoundary({
  isPending,
  error,
  children,
  title,
}: {
  isPending: boolean;
  error: unknown;
  children: ReactNode;
  title?: string;
}) {
  if (isPending) return <LoadingRows />;
  if (error) return <ResourceError title={title} error={error} />;
  return children;
}

export function HonestDataNotice() {
  return (
    <Alert className="border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30">
      <Database />
      <AlertTitle>只处理可追溯的真实数据</AlertTitle>
      <AlertDescription>
        企业、字段与证据必须来自获客助手、企查查、用户上传或已配置的 Web
        数据源。缺失值会保留为未知，系统不会补造企业或猜测字段。
      </AlertDescription>
    </Alert>
  );
}
