import { hostname } from "node:os";
import { safeError, WorkerError } from "./errors";
import { processExport } from "./export";
import { processIngestionJob } from "./ingestion";
import { processRuleRun } from "./rule-run";
import type {
  ClaimedWorkbenchJob,
  WorkbenchJobType,
  WorkbenchStore,
} from "./types";

export type JobProcessor = (
  job: ClaimedWorkbenchJob,
  store: WorkbenchStore,
) => Promise<Record<string, unknown>>;

export type WorkerProcessors = Record<WorkbenchJobType, JobProcessor>;

const DEFAULT_PROCESSORS: WorkerProcessors = {
  ingestion_job: processIngestionJob,
  rule_run: processRuleRun,
  export: processExport,
};

const LEASE_HEARTBEAT_MS = 60_000;

export class WorkbenchWorker {
  constructor(
    private readonly store: WorkbenchStore,
    private readonly workerId = `${hostname()}:${process.pid}`,
    private readonly processors: WorkerProcessors = DEFAULT_PROCESSORS,
  ) {}

  async runOnce(): Promise<boolean> {
    const job = await this.store.claimNext(this.workerId);
    if (!job) return false;
    const processor = this.processors[job.job_type];
    if (!processor) {
      await this.store.complete(
        job,
        this.workerId,
        "failed",
        {},
        "JOB_TYPE_UNSUPPORTED",
        "当前执行器不支持该任务类型。",
      );
      return true;
    }
    const heartbeat = setInterval(() => {
      void this.store
        .renewLease(job, this.workerId)
        .then((active) => {
          if (!active) {
            console.error("workbench job lease lost", {
              jobId: job.job_id,
              jobType: job.job_type,
            });
          }
        })
        .catch((error) => {
          const safe = safeError(error);
          console.error("workbench job lease renewal failed", {
            jobId: job.job_id,
            jobType: job.job_type,
            code: safe.code,
          });
        });
    }, LEASE_HEARTBEAT_MS);
    try {
      const result = await processor(job, this.store);
      const partial =
        job.job_type !== "export" &&
        (result.force_partial === true ||
          (Number(result.rejected_count ?? 0) > 0 &&
            Number(result.accepted_count ?? 0) > 0));
      await this.store.complete(
        job,
        this.workerId,
        partial ? "partial" : "completed",
        result,
      );
    } catch (error) {
      const safe = safeError(error);
      await this.store.complete(
        job,
        this.workerId,
        "failed",
        {},
        safe.code,
        safe.message,
      );
      console.error("workbench job failed", {
        jobId: job.job_id,
        jobType: job.job_type,
        code: safe.code,
      });
    } finally {
      clearInterval(heartbeat);
    }
    return true;
  }

  async run(signal?: AbortSignal): Promise<void> {
    let consecutivePollingFailures = 0;
    while (!signal?.aborted) {
      try {
        const worked = await this.runOnce();
        consecutivePollingFailures = 0;
        if (!worked) await delay(1000, signal);
      } catch (error) {
        consecutivePollingFailures += 1;
        const safe = safeError(error);
        console.error("provider worker queue polling failed", {
          code: safe.code,
          retryInMs: pollingRetryDelay(consecutivePollingFailures),
        });
        await delay(pollingRetryDelay(consecutivePollingFailures), signal);
      }
    }
  }
}

function pollingRetryDelay(consecutiveFailures: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.min(consecutiveFailures - 1, 5));
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export function requireWorkerMode(
  value: string | undefined,
): "once" | "daemon" {
  if (!value || value === "daemon" || value === "--daemon") return "daemon";
  if (value === "once" || value === "--once") return "once";
  throw new WorkerError(
    "WORKER_MODE_INVALID",
    "执行器参数只支持 --once 或 --daemon。",
  );
}
