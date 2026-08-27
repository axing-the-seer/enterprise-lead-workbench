import { describe, expect, it } from "vitest";
import { ingestionListName } from "./store";
import type { ClaimedWorkbenchJob } from "./types";

function job(payload: Record<string, unknown>): ClaimedWorkbenchJob {
  return {
    job_type: "ingestion_job",
    job_id: "11111111-1111-4111-8111-111111111111",
    workspace_id: "22222222-2222-4222-8222-222222222222",
    payload,
  };
}

describe("ingestion list naming", () => {
  it("keeps the explicit stable business name", () => {
    expect(
      ingestionListName(
        job({
          job_kind: "query",
          input_params: { list_name: "  杭州工业自动化潜在客户  " },
        }),
      ),
    ).toBe("杭州工业自动化潜在客户");
  });

  it("derives a readable import list name from the file name", () => {
    expect(
      ingestionListName(
        job({
          job_kind: "import",
          input_params: { file_name: "华东设备客户.xlsx" },
        }),
      ),
    ).toBe("华东设备客户导入名单");
  });

  it("never falls back to a synthetic data-batch name", () => {
    expect(() =>
      ingestionListName(
        job({
          job_kind: "query",
          input_params: { query_kind: "company_search" },
        }),
      ),
    ).toThrow("必须使用用户可识别的名单名称");
  });
});
