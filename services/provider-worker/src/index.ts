import { safeError } from "./errors";
import { SupabaseWorkbenchStore } from "./store";
import { requireWorkerMode, WorkbenchWorker } from "./worker";

async function main() {
  const mode = requireWorkerMode(process.argv[2]);
  const worker = new WorkbenchWorker(new SupabaseWorkbenchStore());
  if (mode === "once") {
    await worker.runOnce();
    return;
  }
  const abortController = new AbortController();
  process.once("SIGINT", () => abortController.abort());
  process.once("SIGTERM", () => abortController.abort());
  await worker.run(abortController.signal);
}

main().catch((error) => {
  const safe = safeError(error);
  console.error("provider worker stopped", {
    code: safe.code,
    message: safe.message,
  });
  process.exitCode = 1;
});
