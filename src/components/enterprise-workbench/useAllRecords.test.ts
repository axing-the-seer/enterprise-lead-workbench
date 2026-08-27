import { describe, expect, it, vi } from "vitest";
import { loadAllRecords } from "./useAllRecords";

describe("loadAllRecords", () => {
  it("按服务端允许的批次读取全部记录", async () => {
    const rows = Array.from({ length: 2_050 }, (_, index) => ({
      id: String(index + 1),
    }));
    const getList = vi.fn(async (_resource, params) => {
      const start = (params.pagination.page - 1) * params.pagination.perPage;
      return {
        data: rows.slice(start, start + params.pagination.perPage),
        total: rows.length,
      };
    });

    const result = await loadAllRecords({ getList } as never, "entries", {
      maxRecords: 3_000,
    });

    expect(result).toHaveLength(2_050);
    expect(getList).toHaveBeenCalledTimes(3);
    expect(getList.mock.calls[0]?.[1].pagination.perPage).toBe(1_000);
  });

  it("超过页面安全上限时明确失败，不返回截断数据", async () => {
    const getList = vi.fn(async (_resource, params) => ({
      data: Array.from({ length: params.pagination.perPage }, (_, index) => ({
        id: `${params.pagination.page}-${index}`,
      })),
      total: 2_001,
    }));

    await expect(
      loadAllRecords({ getList } as never, "entries", {
        maxRecords: 2_000,
      }),
    ).rejects.toThrow("安全上限");
  });

  it("拒绝大于 Supabase 单次返回上限的批次", async () => {
    await expect(
      loadAllRecords({ getList: vi.fn() } as never, "entries", {
        maxRecords: 2_000,
        batchSize: 1_001,
      }),
    ).rejects.toThrow("1 到 1000");
  });
});
