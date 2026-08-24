import path from "node:path";
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";

// Four test projects (https://vitest.dev/guide/projects.html):
//   - "app":       React/DOM unit tests, run in a real browser (Playwright/Chromium).
//   - "claude":    agent-harness hook tests, plain Node integration tests that spawn
//                  the .claude/hooks/*.mjs hooks as subprocesses. No DOM, no browser.
//   - "functions": Supabase Edge Function tests. Written for Deno with JSR imports;
//                  Node-only here, with the jsr:/npm: specifiers aliased to their
//                  installed npm equivalents. Aliases are scoped to this project.
//   - "worker":    provider worker unit tests, plain Node without a browser.
// Run everything with `npm run test:unit:all`, or a single suite with
// `npm run test:unit:app` / `npm run test:unit:claude` /
// `npm run test:unit:functions` / `npm run test:unit:worker`.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        optimizeDeps: {
          exclude: ["playwright", "playwright-core"],
        },
        resolve: {
          preserveSymlinks: true,
          alias: {
            "@": path.resolve(__dirname, "./src"),
            jszip: path.resolve(__dirname, "./node_modules/jszip/lib/index.js"),
          },
        },
        test: {
          name: "app",
          globals: true,
          include: ["src/**/*.test.{ts,tsx}"],
          browser: {
            headless: true,
            provider: playwright(),
            enabled: true,
            instances: [
              {
                browser: "chromium",
                ...(process.env.CI && {
                  launch: { channel: "chromium-headless-shell" },
                }),
              },
            ],
            commands: {
              // Uses Chrome DevTools Protocol to override the timezone at runtime,
              // since process.env.TZ has no effect in a real browser environment.
              async setTimezone({ context, page }, timezoneId: string) {
                const session = await context.newCDPSession(page);
                await session.send("Emulation.setTimezoneOverride", {
                  timezoneId,
                });
                await session.detach();
              },
            },
          },
          exclude: [
            "**/node_modules/**",
            "doc/**",
            "supabase/**",
            ".supabase-e2e/**",
            "e2e/**/*.spec.{ts,tsx}",
            // The production workbench intentionally removes Atomic CRM's
            // legacy contact create/edit routes. Their component tests mount
            // those removed routes and now assert the Not Found page instead.
            "src/components/atomic-crm/contacts/ContactCreate.test.tsx",
            "src/components/atomic-crm/contacts/ContactEdit.test.tsx",
            // Harness hook tests are Node-only (they import node:fs / node:path
            // and spawn subprocesses); they run under the "claude" project below.
            ".claude/**",
          ],
          server: {
            deps: {
              external: [/playwright/],
            },
          },
        },
      },
      {
        test: {
          name: "claude",
          environment: "node",
          include: [".claude/**/*.test.mjs"],
          // These tests spawn `node` subprocesses and do real git/worktree work,
          // so they need more headroom than the default 5s.
          testTimeout: 30000,
          hookTimeout: 30000,
        },
      },
      {
        // Map the Deno imports to the installed npm packages so Vitest can run
        // these Deno-targeted tests in Node without a Deno runtime. These aliases
        // only apply to this project.
        resolve: {
          alias: {
            "jsr:@supabase/supabase-js@2": path.resolve(
              __dirname,
              "node_modules/@supabase/supabase-js",
            ),
            "npm:tldts": path.resolve(__dirname, "node_modules/tldts"),
            "npm:pgsql-ast-parser@^12": "pgsql-ast-parser",
            "npm:zod@4.4.3": "zod",
          },
        },
        test: {
          name: "functions",
          globals: true,
          environment: "node",
          setupFiles: ["./supabase/functions/vitest-deno-setup.ts"],
          include: ["supabase/functions/**/*.test.ts"],
          exclude: ["**/node_modules/**", ".supabase-e2e/**"],
        },
      },
      {
        test: {
          name: "worker",
          environment: "node",
          include: ["services/provider-worker/**/*.test.ts"],
          exclude: ["**/node_modules/**"],
        },
      },
    ],
  },
});
