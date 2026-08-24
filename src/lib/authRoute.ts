const OAUTH_CONSENT_PATH = "/oauth/consent";

type BrowserLocation = Pick<Location, "hash" | "pathname" | "search">;

/**
 * Supabase OAuth opens a normal browser path, while react-admin uses a hash
 * router. Convert only the OAuth consent entry point before React mounts.
 */
export function getHashRoutedAuthLocation(location: BrowserLocation) {
  if (location.hash || location.pathname !== OAUTH_CONSENT_PATH) return null;
  return `/#${OAUTH_CONSENT_PATH}${location.search}`;
}

export function normalizeExternalAuthRoute(location: BrowserLocation) {
  const nextLocation = getHashRoutedAuthLocation(location);
  if (!nextLocation) return false;

  window.history.replaceState(window.history.state, "", nextLocation);
  return true;
}

export function getSafeLoginRedirect(search: string) {
  const redirect = new URLSearchParams(search).get("redirect");
  if (!redirect || !redirect.startsWith("/") || redirect.startsWith("//")) {
    return undefined;
  }
  return redirect;
}
