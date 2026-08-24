import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const output = execFileSync(
  "npx",
  ["supabase", "status", "--workdir", ".supabase-e2e", "-o", "env"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);

const local = Object.fromEntries(
  output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf("=");
      if (separator <= 0) return ["", ""];
      const key = line.slice(0, separator);
      const rawValue = line.slice(separator + 1);
      const value = rawValue.startsWith('"') ? JSON.parse(rawValue) : rawValue;
      return [key, value];
    })
    .filter(([key]) => key),
);

for (const key of ["API_URL", "SERVICE_ROLE_KEY", "PUBLISHABLE_KEY"]) {
  if (!local[key]) {
    throw new Error(`Supabase e2e status is missing ${key}.`);
  }
}

const envFile = [
  "SKIP_PREFLIGHT_CHECK=true",
  `VITE_SUPABASE_URL=${local.API_URL}`,
  `VITE_SB_PUBLISHABLE_KEY=${local.PUBLISHABLE_KEY}`,
  `SERVICE_ROLE_KEY=${local.SERVICE_ROLE_KEY}`,
  "VITE_IS_DEMO=false",
  "VITE_ATTACHMENTS_BUCKET=attachments",
  "",
].join("\n");

writeFileSync(resolve(".env.e2e"), envFile, { mode: 0o600 });
process.stdout.write("Generated temporary .env.e2e from isolated Supabase.\n");
