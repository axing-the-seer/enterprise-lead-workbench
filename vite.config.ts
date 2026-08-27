import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import createHtmlPlugin from "vite-plugin-simple-html";

// https://vitejs.dev/config/
export default defineConfig({
  // Concurrent isolated acceptance environments must not rewrite the same
  // optimized-dependency cache; doing so invalidates lazy route imports in
  // the other running UI.
  cacheDir: process.env.VITE_CACHE_DIR || "node_modules/.vite",
  server: {
    port: 3101,
    // Local single-user mode must not be reachable from the LAN by default.
    // Deployments use the built static bundle rather than this dev server.
    host: process.env.VITE_DEV_HOST || "127.0.0.1",
    // Acceptance databases and per-run Vite caches live below these folders.
    // Watching them causes thousands of unrelated reloads while tests reset.
    watch: { ignored: ["**/.supabase-*/**"] },
  },
  optimizeDeps: {
    include: ["jszip"],
  },
  plugins: [
    react(),
    tailwindcss(),
    ...(process.env.ANALYZE_BUNDLE === "true"
      ? [
          visualizer({
            open: false,
            filename: "./dist/stats.html",
          }),
        ]
      : []),
    createHtmlPlugin({
      minify: true,
      inject: {
        data: {
          mainScript: `src/main.tsx`,
        },
      },
    }),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB
      },
      manifest: false, // Use existing manifest.json from public/
    }),
  ],
  define:
    process.env.NODE_ENV === "production" && process.env.VITE_SUPABASE_URL
      ? {
          "import.meta.env.VITE_IS_DEMO": JSON.stringify(
            process.env.VITE_IS_DEMO,
          ),
          "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
            process.env.VITE_SUPABASE_URL,
          ),
          "import.meta.env.VITE_SB_PUBLISHABLE_KEY": JSON.stringify(
            process.env.VITE_SB_PUBLISHABLE_KEY,
          ),
          "import.meta.env.VITE_INBOUND_EMAIL": JSON.stringify(
            process.env.VITE_INBOUND_EMAIL,
          ),
          "import.meta.env.VITE_ATTACHMENTS_BUCKET": JSON.stringify(
            process.env.VITE_ATTACHMENTS_BUCKET,
          ),
          "import.meta.env.VITE_LOCAL_SINGLE_USER": JSON.stringify(
            process.env.VITE_LOCAL_SINGLE_USER,
          ),
          "import.meta.env.VITE_LOCAL_SINGLE_USER_EMAIL": JSON.stringify(
            process.env.VITE_LOCAL_SINGLE_USER_EMAIL,
          ),
        }
      : undefined,
  base: "./",
  esbuild: {
    keepNames: true,
  },
  build: {
    sourcemap: true,
  },
  resolve: {
    preserveSymlinks: true,
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // JSZip's package-level browser field points at a prebuilt bundle. Use
      // its source entry so every transitive module remains traceable in the
      // lockfile and the commercial SBOM.
      jszip: path.resolve(__dirname, "./node_modules/jszip/lib/index.js"),
    },
  },
});
