function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}

function parseOrigin(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${label} must be a clean HTTP(S) origin`);
  }
  return url;
}

export function resolveWorkbenchPublicOrigin(
  configuredOrigin: string | undefined,
  supabaseUrl: string,
): string {
  const backend = parseOrigin(supabaseUrl, "SUPABASE_URL");
  const localBackend = isLoopback(backend.hostname);
  if (!configuredOrigin) {
    if (localBackend) return backend.origin;
    throw new Error(
      "WORKBENCH_PUBLIC_ORIGIN is required for a hosted MCP deployment",
    );
  }

  const configured = parseOrigin(configuredOrigin, "WORKBENCH_PUBLIC_ORIGIN");
  if (configured.protocol !== "https:" && !isLoopback(configured.hostname)) {
    throw new Error(
      "WORKBENCH_PUBLIC_ORIGIN must use HTTPS outside local development",
    );
  }
  return configured.origin;
}
