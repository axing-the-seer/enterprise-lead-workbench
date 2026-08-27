import { useQuery } from "@tanstack/react-query";
import {
  useDataProvider,
  type DataProvider,
  type GetListParams,
  type RaRecord,
} from "ra-core";

const DEFAULT_BATCH_SIZE = 1_000;

type LoadAllOptions = {
  filter?: Record<string, unknown>;
  sort?: GetListParams["sort"];
  maxRecords: number;
  batchSize?: number;
};

export async function loadAllRecords<RecordType extends RaRecord = RaRecord>(
  dataProvider: Pick<DataProvider, "getList">,
  resource: string,
  {
    filter = {},
    sort = { field: "id", order: "ASC" },
    maxRecords,
    batchSize = DEFAULT_BATCH_SIZE,
  }: LoadAllOptions,
) {
  if (!Number.isSafeInteger(maxRecords) || maxRecords < 1) {
    throw new Error("maxRecords 必须是正整数");
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
    throw new Error("batchSize 必须是 1 到 1000 之间的整数");
  }

  const rows: RecordType[] = [];
  for (let page = 1; ; page += 1) {
    const result = await dataProvider.getList<RecordType>(resource, {
      pagination: { page, perPage: batchSize },
      sort,
      filter,
    });
    const pageRows = result.data ?? [];

    if (rows.length + pageRows.length > maxRecords) {
      throw new Error(
        `数据量超过当前页面安全上限（${maxRecords.toLocaleString("zh-CN")} 条），请缩小范围后重试`,
      );
    }
    rows.push(...pageRows);

    const total = result.total;
    if (
      pageRows.length < batchSize ||
      (typeof total === "number" && rows.length >= total)
    ) {
      return rows;
    }
    if (rows.length >= maxRecords) {
      throw new Error(
        `数据量达到当前页面安全上限（${maxRecords.toLocaleString("zh-CN")} 条），请缩小范围后重试`,
      );
    }
  }
}

export function useAllRecords<RecordType extends RaRecord = RaRecord>(
  resource: string,
  options: LoadAllOptions & { enabled?: boolean },
) {
  const dataProvider = useDataProvider();
  const { enabled = true, ...loadOptions } = options;

  return useQuery({
    queryKey: ["workbench", "all-records", resource, loadOptions],
    queryFn: () =>
      loadAllRecords<RecordType>(dataProvider, resource, loadOptions),
    enabled,
  });
}
