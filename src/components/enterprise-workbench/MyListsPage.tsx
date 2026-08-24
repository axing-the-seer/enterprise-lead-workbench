import { useMemo, useState } from "react";
import {
  ArrowRight,
  Buildings,
  CalendarBlank,
  FolderOpen,
  MagnifyingGlass,
  Plus,
} from "@phosphor-icons/react";
import { useGetList } from "ra-core";
import { Link, useSearchParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Company, CompanyList, CompanyListMember } from "./types";
import { formatDateTime } from "./utils";
import { useWorkspace } from "./workspace";

export function MyListsPage() {
  const { workspace } = useWorkspace();
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const lists = useGetList<CompanyList>("company_lists", {
    pagination: { page: 1, perPage: 200 },
    sort: { field: "created_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });
  const members = useGetList<CompanyListMember>("company_list_members", {
    pagination: { page: 1, perPage: 5000 },
    sort: { field: "added_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });
  const companies = useGetList<Company>("companies", {
    pagination: { page: 1, perPage: 5000 },
    sort: { field: "updated_at", order: "DESC" },
    filter: { workspace_id: workspace?.id },
  });

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const member of members.data ?? []) {
      if (member.membership_status === "excluded") continue;
      map.set(
        member.company_list_id,
        (map.get(member.company_list_id) ?? 0) + 1,
      );
    }
    return map;
  }, [members.data]);
  const matchingCompanyListIds = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("zh-CN");
    if (!keyword) return new Set<string>();
    const companyIds = new Set(
      (companies.data ?? [])
        .filter((company) =>
          [
            company.name,
            company.unified_social_credit_code,
            company.legal_representative,
          ]
            .filter(Boolean)
            .some((value) =>
              String(value).toLocaleLowerCase("zh-CN").includes(keyword),
            ),
        )
        .map((company) => String(company.id)),
    );
    return new Set(
      (members.data ?? [])
        .filter((member) => companyIds.has(String(member.company_id)))
        .map((member) => member.company_list_id),
    );
  }, [companies.data, members.data, search]);
  const filtered = (lists.data ?? []).filter((list) => {
    const keyword = search.trim().toLocaleLowerCase("zh-CN");
    if (!keyword) return true;
    return (
      list.name.toLocaleLowerCase("zh-CN").includes(keyword) ||
      list.description?.toLocaleLowerCase("zh-CN").includes(keyword) ||
      matchingCompanyListIds.has(list.id)
    );
  });

  return (
    <div className="mx-auto max-w-[1320px] space-y-7">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-[#0969da]">我的名单</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-[38px]">
            所有企业名单
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            查看和管理已经创建的企业名单。
          </p>
        </div>
        <Button asChild className="h-11 rounded-full bg-[#0969da] px-5">
          <Link to="/">
            <Plus weight="bold" />
            新建查找
          </Link>
        </Button>
      </header>

      <section className="rounded-[24px] border border-black/[0.06] bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.04)] sm:p-5">
        <div className="relative max-w-xl">
          <MagnifyingGlass className="absolute left-3.5 top-3.5 size-4.5 text-slate-400" />
          <Input
            aria-label="搜索名单或企业"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索名单、企业名称、信用代码或法人"
            className="h-12 rounded-xl bg-slate-50 pl-10"
          />
        </div>
      </section>

      {filtered.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((list) => {
            const count = counts.get(list.id) ?? list.company_count ?? 0;
            return (
              <Link
                key={list.id}
                to={`/lists/${list.id}`}
                className="group rounded-[24px] border border-black/[0.06] bg-white p-5 text-inherit no-underline shadow-[0_3px_15px_rgba(0,0,0,0.035)] transition-all hover:-translate-y-0.5 hover:border-[#b7d6fb] hover:shadow-[0_14px_36px_rgba(30,79,135,0.10)] sm:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-11 place-items-center rounded-2xl bg-[#eef5ff] text-[#0969da]">
                    <FolderOpen className="size-5.5" weight="regular" />
                  </span>
                  <Badge variant="outline" className="rounded-full bg-slate-50">
                    {list.status === "archived" ? "已归档" : "可使用"}
                  </Badge>
                </div>
                <h2 className="mt-5 line-clamp-2 text-lg font-semibold tracking-[-0.02em]">
                  {list.name}
                </h2>
                {list.description ? (
                  <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-500">
                    {list.description}
                  </p>
                ) : null}
                {list.created_by_agent ? (
                  <p className="mt-2 text-xs font-medium text-[#0969da]">
                    {list.created_by_agent} 创建
                  </p>
                ) : null}
                <div className="mt-5 flex items-center gap-4 border-t border-black/[0.05] pt-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Buildings className="size-4" />
                    {count} 家企业
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CalendarBlank className="size-4" />
                    {formatDateTime(list.created_at)}
                  </span>
                  <ArrowRight className="ml-auto size-4 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-[#0969da]" />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <section className="grid min-h-80 place-items-center rounded-[28px] border border-dashed border-black/10 bg-white px-6 text-center">
          <div>
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-500">
              <FolderOpen className="size-7" />
            </span>
            <h2 className="mt-5 text-lg font-semibold">
              {search ? "没有匹配的名单" : "还没有企业名单"}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {search
                ? "试试企业全名、信用代码或清空搜索。"
                : "先从有效条件开始查找企业。"}
            </p>
            <Button asChild className="mt-5 rounded-full">
              <Link to="/">去找企业</Link>
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
