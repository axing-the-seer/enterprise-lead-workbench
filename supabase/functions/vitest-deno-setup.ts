import { test } from "vitest";

// Edge Function contract tests use Deno.test so the same files can run under
// both Deno and Vitest. Vitest only needs this minimal test registration shim;
// production Edge Functions never import this file.
const runtime = globalThis as typeof globalThis & {
  Deno?: { test: typeof test };
};

if (!runtime.Deno) {
  runtime.Deno = { test };
}
