#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "services", "provider-worker", "dist");
const tsc = path.join(root, "node_modules", "typescript", "bin", "tsc");

fs.rmSync(outputDir, { recursive: true, force: true });

const result = spawnSync(
  process.execPath,
  [tsc, "--project", "services/provider-worker/tsconfig.build.json"],
  {
    cwd: root,
    stdio: "inherit",
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

fs.writeFileSync(
  path.join(outputDir, "package.json"),
  `${JSON.stringify({ private: true, type: "commonjs" }, null, 2)}\n`,
);

const entry = path.join(
  outputDir,
  "services",
  "provider-worker",
  "src",
  "index.js",
);
if (!fs.existsSync(entry)) {
  throw new Error(`Provider worker entry was not generated: ${entry}`);
}

process.stdout.write(
  `Provider worker built at ${path.relative(root, entry)}\n`,
);
