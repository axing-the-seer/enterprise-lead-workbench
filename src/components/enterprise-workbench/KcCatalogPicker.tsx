import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlass, SpinnerGap, X } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "./utils";

export type KcCatalogSelection = {
  id: string;
  label: string;
  providerValues: string[];
};

type CatalogKind = "regions" | "industries";
type CatalogItem = KcCatalogSelection & {
  pathLabels: string[];
  searchText?: string;
  level: number | "section" | "division";
  selectable: boolean;
};
type CatalogDocument = {
  schemaVersion: "1.0";
  source: { path: string; sha256: string };
  items: CatalogItem[];
};

const urls: Record<CatalogKind, string> = {
  regions: "/catalogs/kc-regions.v1.json",
  industries: "/catalogs/kc-industries.v1.json",
};

export function KcCatalogPicker({
  kind,
  value,
  onChange,
  placeholder,
  className,
}: {
  kind: CatalogKind;
  value: KcCatalogSelection[];
  onChange: (value: KcCatalogSelection[]) => void;
  placeholder: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [catalog, setCatalog] = useState<CatalogDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(urls[kind], { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return validateCatalog(await response.json(), kind);
      })
      .then((document) => !cancelled && setCatalog(document))
      .catch(
        (reason: unknown) => !cancelled && setError(getErrorMessage(reason)),
      );
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const selectedIds = useMemo(
    () => new Set(value.map((item) => item.id)),
    [value],
  );
  const options = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    return (catalog?.items ?? [])
      .filter((item) => {
        if (!item.selectable || selectedIds.has(item.id)) return false;
        if (!normalized) {
          return kind === "regions"
            ? item.level === 1
            : item.level === "section";
        }
        return `${item.label} ${item.pathLabels.join(" ")} ${item.searchText ?? ""}`
          .toLocaleLowerCase("zh-CN")
          .includes(normalized);
      })
      .slice(0, 40);
  }, [catalog, kind, query, selectedIds]);

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "flex min-h-12 flex-wrap items-center gap-2 rounded-xl border border-black/10 bg-white px-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all",
          focused && "border-[#1677ff] ring-4 ring-[#1677ff]/10",
        )}
      >
        {value.map((item) => (
          <span
            key={item.id}
            className="flex items-center gap-1.5 rounded-full bg-[#edf5ff] px-2.5 py-1 text-xs font-medium text-[#0b65cf]"
          >
            {item.label}
            <button
              type="button"
              onClick={() =>
                onChange(value.filter((entry) => entry.id !== item.id))
              }
              aria-label={`移除${item.label}`}
              className="rounded-full p-0.5 hover:bg-black/5"
            >
              <X className="size-3" weight="bold" />
            </button>
          </span>
        ))}
        <div className="flex min-w-36 flex-1 items-center gap-2">
          <MagnifyingGlass className="size-4 shrink-0 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => window.setTimeout(() => setFocused(false), 140)}
            placeholder={value.length ? "继续添加…" : placeholder}
            className="h-10 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
          />
        </div>
      </div>
      {focused ? (
        <div className="absolute inset-x-0 top-[calc(100%+8px)] z-30 max-h-72 overflow-y-auto rounded-2xl border border-black/[0.08] bg-white p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.14)]">
          {error ? (
            <Alert variant="destructive" className="m-1">
              <AlertTitle>目录不可用</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : !catalog ? (
            <p className="flex items-center justify-center gap-2 p-5 text-sm text-slate-500">
              <SpinnerGap className="animate-spin" /> 正在读取官方目录…
            </p>
          ) : options.length ? (
            options.map((item) => (
              <button
                key={item.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange([
                    ...value,
                    {
                      id: item.id,
                      label:
                        item.pathLabels.length > 1
                          ? item.pathLabels.join(" · ")
                          : item.label,
                      providerValues: item.providerValues,
                    },
                  ]);
                  setQuery("");
                }}
                className="block w-full rounded-xl px-3 py-2.5 text-left hover:bg-slate-50"
              >
                <span className="text-sm font-medium">{item.label}</span>
                {item.pathLabels.length > 1 ? (
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {item.pathLabels.join(" › ")}
                  </span>
                ) : null}
              </button>
            ))
          ) : (
            <p className="p-5 text-center text-sm text-slate-500">
              没有匹配的有效目录项
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function validateCatalog(payload: unknown, kind: CatalogKind): CatalogDocument {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("目录根节点格式错误");
  }
  const document = payload as Partial<CatalogDocument>;
  if (
    document.schemaVersion !== "1.0" ||
    !document.source ||
    typeof document.source.sha256 !== "string" ||
    !Array.isArray(document.items)
  ) {
    throw new Error("目录缺少版本或来源校验信息");
  }
  const items = document.items.filter((item): item is CatalogItem =>
    Boolean(
      item &&
        typeof item.id === "string" &&
        typeof item.label === "string" &&
        Array.isArray(item.pathLabels) &&
        Array.isArray(item.providerValues) &&
        item.providerValues.length > 0 &&
        item.selectable,
    ),
  );
  if (kind === "regions" && !items.some((item) => item.level === 1)) {
    throw new Error("地区目录没有可用省级节点");
  }
  return { schemaVersion: "1.0", source: document.source, items };
}
