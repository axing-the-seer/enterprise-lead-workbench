import { Suspense, type ReactNode, useEffect, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  CaretDown,
  GearSix,
  MagnifyingGlass,
  SignOut,
  UserCircle,
} from "@phosphor-icons/react";
import { useGetIdentity, useLogout } from "ra-core";
import { Link, useLocation, useNavigate } from "react-router";
import { Error } from "@/components/admin/error";
import { Notification } from "@/components/admin/notification";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ConfigurationDrawer } from "./ConfigurationDrawer";
import { WorkspaceGate, WorkspaceProvider } from "./workspace";

const primaryNavigation = [
  { label: "找企业", href: "/", active: (path: string) => path === "/" },
  {
    label: "我的名单",
    href: "/lists",
    active: (path: string) => path.startsWith("/lists"),
  },
] as const;

function Brand() {
  return (
    <Link
      to="/"
      className="group flex shrink-0 items-center gap-3 text-white no-underline"
      aria-label="企业名单工作台首页"
    >
      <img
        src="/appIcon/512.png"
        alt=""
        className="size-8 rounded-[10px] shadow-[0_8px_24px_rgba(0,0,0,0.22)] transition-transform group-hover:scale-[1.03] sm:size-10 sm:rounded-[12px]"
      />
      <span className="hidden text-[17px] font-semibold tracking-[-0.01em] sm:inline">
        企业名单工作台
      </span>
    </Link>
  );
}

function AccountMenu() {
  const { identity } = useGetIdentity();
  const logout = useLogout();
  const name = identity?.fullName || identity?.email || "当前账号";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 gap-0 rounded-full px-0.5 text-white hover:bg-white/10 hover:text-white sm:h-10 sm:gap-2 sm:px-1.5"
          aria-label="账号菜单"
        >
          <Avatar className="size-8 border border-white/20 bg-white/10">
            <AvatarFallback className="bg-white/10 text-white">
              <UserCircle className="size-5" />
            </AvatarFallback>
          </Avatar>
          <CaretDown
            className="mr-1 hidden size-3.5 text-white/70 sm:block"
            weight="bold"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-60 rounded-2xl p-2 shadow-xl"
      >
        <DropdownMenuLabel className="px-3 py-2">
          <span className="block truncate text-sm font-semibold">{name}</span>
          {identity?.email && identity.email !== name ? (
            <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
              {identity.email}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="rounded-xl" onSelect={() => logout()}>
          <SignOut className="size-4" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const submit = () => {
    const keyword = value.trim();
    if (!keyword) return;
    onOpenChange(false);
    navigate(`/lists?search=${encodeURIComponent(keyword)}`);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden rounded-[24px] border-black/5 p-0 shadow-2xl sm:max-w-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>搜索企业或名单</DialogTitle>
          <DialogDescription>在已有名单和企业中搜索</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <MagnifyingGlass className="size-5 text-slate-400" />
          <Input
            aria-label="搜索企业或名单"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && submit()}
            autoFocus
            placeholder="搜索企业名称、信用代码或名单…"
            className="h-10 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="flex items-center justify-between bg-slate-50 px-5 py-3 text-xs text-slate-500">
          <span>在“我的名单”中统一搜索</span>
          <Button
            size="sm"
            onClick={submit}
            disabled={!value.trim()}
            className="rounded-full px-4"
          >
            搜索
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AppHeader() {
  const location = useLocation();
  const [configOpen, setConfigOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <>
      <header className="sticky top-0 z-40 h-16 border-b border-white/10 bg-[#082657]/[0.98] text-white shadow-[0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl sm:h-20">
        <div className="mx-auto flex h-full max-w-[1600px] items-center px-3 sm:px-7 lg:px-8">
          <Brand />
          <nav
            className="ml-2 flex h-full items-stretch sm:absolute sm:left-1/2 sm:ml-0 sm:-translate-x-1/2"
            aria-label="主要导航"
          >
            {primaryNavigation.map((item) => {
              const active = item.active(location.pathname);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "relative flex min-w-16 items-center justify-center px-1 text-[13px] font-medium text-white/65 transition-colors hover:text-white sm:min-w-28 sm:px-5 sm:text-[15px]",
                    active && "text-white",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                  {active ? (
                    <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-t-full bg-[#54a4ff] sm:inset-x-4" />
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-0 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-full text-white hover:bg-white/10 hover:text-white sm:size-10"
              onClick={() => setSearchOpen(true)}
              aria-label="搜索企业或名单"
            >
              <MagnifyingGlass className="size-5" weight="bold" />
            </Button>
            <Button
              variant="outline"
              className="hidden h-10 rounded-xl border-white/50 bg-transparent px-4 text-white hover:border-white hover:bg-white/10 hover:text-white sm:flex"
              onClick={() => setConfigOpen(true)}
            >
              <GearSix className="size-5" />
              配置
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-full text-white hover:bg-white/10 hover:text-white sm:hidden"
              onClick={() => setConfigOpen(true)}
              aria-label="配置"
            >
              <GearSix className="size-5" />
            </Button>
            <AccountMenu />
          </div>
        </div>
      </header>
      <ConfigurationDrawer open={configOpen} onOpenChange={setConfigOpen} />
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}

function LayoutBody({ children }: { children: ReactNode }) {
  const location = useLocation();

  useEffect(() => {
    const resetScroll = () =>
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    resetScroll();
    const frame = window.requestAnimationFrame(resetScroll);
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname, location.search]);

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
      <AppHeader />
      <main
        id="main-content"
        className="mx-auto min-h-[calc(100vh-4rem)] max-w-[1600px] px-4 py-7 sm:min-h-[calc(100vh-5rem)] sm:px-7 sm:py-10 lg:px-8"
      >
        <ErrorBoundary FallbackComponent={Error}>
          <Suspense
            fallback={<Skeleton className="h-[480px] w-full rounded-[28px]" />}
          >
            <WorkspaceGate>{children}</WorkspaceGate>
          </Suspense>
        </ErrorBoundary>
      </main>
      <Notification />
    </div>
  );
}

export function WorkbenchLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <LayoutBody>{children}</LayoutBody>
    </WorkspaceProvider>
  );
}
