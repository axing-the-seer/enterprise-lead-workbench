import { describe, expect, it, vi } from "vitest";
import type { ClaimedWorkbenchJob, WorkbenchStore } from "./types";
import { WorkbenchWorker, type WorkerProcessors } from "./worker";

function fakeStore(job: ClaimedWorkbenchJob | null) {
  return {
    claimNext: vi.fn().mockResolvedValue(job),
    renewLease: vi.fn().mockResolvedValue(true),
    complete: vi.fn().mockResolvedValue(undefined),
  } as unknown as WorkbenchStore & {
    claimNext: ReturnType<typeof vi.fn>;
    complete: ReturnType<typeof vi.fn>;
  };
}

const job: ClaimedWorkbenchJob = {
  job_type: "ingestion_job",
  job_id: "22222222-2222-4222-8222-222222222222",
  workspace_id: "11111111-1111-4111-8111-111111111111",
  payload: {},
};

function processors(
  ingestion: WorkerProcessors["ingestion_job"],
): WorkerProcessors {
  const noop = vi.fn().mockResolvedValue({});
  return { ingestion_job: ingestion, rule_run: noop, export: noop };
}

describe("WorkbenchWorker", () => {
  it("returns false without mutating state when the queue is empty", async () => {
    const store = fakeStore(null);
    const worker = new WorkbenchWorker(
      store,
      "test-worker",
      processors(vi.fn()),
    );
    await expect(worker.runOnce()).resolves.toBe(false);
    expect(store.complete).not.toHaveBeenCalled();
  });

  it("completes a claimed job with the processor result", async () => {
    const store = fakeStore(job);
    const run = vi
      .fn()
      .mockResolvedValue({ accepted_count: 2, rejected_count: 0 });
    const worker = new WorkbenchWorker(store, "test-worker", processors(run));
    await expect(worker.runOnce()).resolves.toBe(true);
    expect(run).toHaveBeenCalledWith(job, store);
    expect(store.complete).toHaveBeenCalledWith(
      job,
      "test-worker",
      "completed",
      {
        accepted_count: 2,
        rejected_count: 0,
      },
    );
  });

  it("stores a safe failure without leaking an unexpected error message", async () => {
    const store = fakeStore(job);
    const run = vi.fn().mockRejectedValue(new Error("token=very-secret"));
    const worker = new WorkbenchWorker(store, "test-worker", processors(run));
    await worker.runOnce();
    expect(store.complete).toHaveBeenCalledWith(
      job,
      "test-worker",
      "failed",
      {},
      "WORKER_UNEXPECTED_ERROR",
      "任务执行失败；详细诊断仅保留在受控运行日志中。",
    );
  });

  it("keeps the daemon alive after a transient queue polling failure", async () => {
    vi.useFakeTimers();
    const abortController = new AbortController();
    const store = fakeStore(null);
    store.claimNext
      .mockRejectedValueOnce(new Error("temporary connection failure"))
      .mockImplementationOnce(async () => {
        abortController.abort();
        return null;
      });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const worker = new WorkbenchWorker(
      store,
      "test-worker",
      processors(vi.fn()),
    );

    const running = worker.run(abortController.signal);
    await vi.runAllTimersAsync();
    await expect(running).resolves.toBeUndefined();
    expect(store.claimNext).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledWith(
      "provider worker queue polling failed",
      expect.objectContaining({ retryInMs: 1000 }),
    );

    consoleError.mockRestore();
    vi.useRealTimers();
  });
});
