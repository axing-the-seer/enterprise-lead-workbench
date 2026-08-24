const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{2,80}$/;

export class WorkerError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WorkerError";
  }
}

export function safeError(error: unknown): {
  code: string;
  message: string;
} {
  if (error instanceof WorkerError) {
    return {
      code: SAFE_ERROR_CODE.test(error.code) ? error.code : "WORKER_ERROR",
      message: redact(error.message),
    };
  }
  return {
    code: "WORKER_UNEXPECTED_ERROR",
    message: "任务执行失败；详细诊断仅保留在受控运行日志中。",
  };
}

function redact(message: string): string {
  return message
    .replace(/kc-[0-9a-f-]{36}/gi, "[REDACTED]")
    .replace(
      /(api[_-]?key|token|password|secret)\s*[:=]\s*\S+/gi,
      "$1=[REDACTED]",
    )
    .slice(0, 500);
}
