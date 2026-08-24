import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthProvider } from "ra-core";
import { Layout } from "@/components/supabase/layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function getAuthorizationErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("authorization") &&
    normalized.includes("not found")
  ) {
    return "本次授权请求已过期或已被使用，请返回 WorkBuddy 重新连接。";
  }
  return message;
}

/**
 * Authorization UI for OAuth Consent Page
 *
 * When third-party apps initiate OAuth, users will be redirected to this page
 * to approve or deny the authorization request.
 *
 * Anonymous users will be redirected to the login page first.
 *
 * Inspired from https://supabase.com/docs/guides/auth/oauth-server/getting-started?queryGroups=oauth-setup&oauth-setup=dashboard#example-authorization-ui
 */
export function OAuthConsentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const authorizationId = searchParams.get("authorization_id");
  const authProvider = useAuthProvider();

  const [authDetails, setAuthDetails] =
    useState<OAuthAuthorizationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    async function loadAuthDetails() {
      if (!authorizationId) {
        setError("Missing authorization_id");
        setLoading(false);
        return;
      }
      if (!authProvider) {
        setError("Auth provider not available");
        setLoading(false);
        return;
      }

      // Check if user is authenticated
      try {
        await authProvider.checkAuth({});
      } catch {
        const redirect = encodeURIComponent(
          `/oauth/consent?authorization_id=${authorizationId}`,
        );
        navigate(`/login?redirect=${redirect}`);
        return;
      }

      // Get authorization details using the authorization_id
      const { data, error } =
        await authProvider.getAuthorizationDetails(authorizationId);

      if (error) {
        setError(getAuthorizationErrorMessage(error.message));
      } else {
        setAuthDetails(data as OAuthAuthorizationDetails);
      }

      setLoading(false);
    }

    loadAuthDetails();
  }, [authProvider, authorizationId, navigate]);

  async function handleApprove() {
    if (!authorizationId || !authProvider) return;

    setSubmitting(true);
    const { data, error } =
      await authProvider.approveAuthorization(authorizationId);

    if (error) {
      setError(error.message);
      setSubmitting(false);
    } else {
      // Show success message and redirect to client app
      setApproved(true);
      window.location.href = data.redirect_url;
    }
  }

  async function handleDeny() {
    if (!authorizationId || !authProvider) return;

    setSubmitting(true);
    const { data, error } =
      await authProvider.denyAuthorization(authorizationId);
    if (error) {
      setError(error.message);
      setSubmitting(false);
    } else {
      // Redirect to client app with error
      window.location.href = data.redirect_url;
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex flex-col space-y-2 text-center">
          <p className="text-muted-foreground">正在读取授权请求…</p>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            无法完成授权
          </h1>
          <p className="text-destructive">{error}</p>
        </div>
      </Layout>
    );
  }

  if (!authDetails) {
    return (
      <Layout>
        <div className="flex flex-col space-y-2 text-center">
          <p className="text-muted-foreground">没有找到有效的授权请求。</p>
        </div>
      </Layout>
    );
  }

  if (approved) {
    return (
      <Layout>
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">已允许访问</h1>
          <p className="text-muted-foreground">
            已完成授权，你现在可以关闭此页面。
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          允许应用访问？
        </h1>
        <p className="text-muted-foreground">
          下方应用请求访问你的企业名单工作台账号。
        </p>
      </div>

      <Card className="rounded-2xl border-black/[0.06] shadow-none">
        <CardHeader>
          <CardTitle>{authDetails.client.name}</CardTitle>
          <CardDescription>{authDetails.redirect_uri}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {authDetails.scope && authDetails.scope.length > 0 && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">
                请求的权限
              </p>
              <ul className="list-disc list-inside space-y-1">
                {authDetails.scope.split(" ").map((scopeItem) => (
                  <li key={scopeItem} className="text-sm">
                    {scopeItem}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleDeny}
            disabled={submitting}
            className="flex-1"
          >
            拒绝
          </Button>
          <Button
            onClick={handleApprove}
            disabled={submitting}
            className="flex-1"
          >
            允许
          </Button>
        </CardFooter>
      </Card>
    </Layout>
  );
}

OAuthConsentPage.path = "/oauth/consent";

/**
 * copied from @supabase/auth-js/src/lib/types.ts
 * to avoid adding a hard import to a Supabase package
 * because this page can also be used with FakeRest
 */
type OAuthAuthorizationDetails = {
  /** The authorization ID */
  authorization_id: string;
  /** Redirect URL - present if user already consented (can be used to trigger immediate redirect) */
  redirect_uri?: string;
  /** User object associated with the authorization */
  /** OAuth client requesting authorization */
  client: {
    /** Unique identifier for the OAuth client (UUID) */
    id: string;
    /** Human-readable name of the OAuth client */
    name: string;
    /** URI of the OAuth client's website */
    uri: string;
    /** URI of the OAuth client's logo */
    logo_uri: string;
  };
  user: {
    /** User ID (UUID) */
    id: string;
    /** User email */
    email: string;
  };
  /** Space-separated list of requested scopes */
  scope: string;
};
