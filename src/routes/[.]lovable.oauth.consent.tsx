import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Minimal local typing for the beta supabase.auth.oauth surface.
type OAuthClient = { name?: string; client_uri?: string };
type OAuthDetails = {
  client?: OAuthClient;
  redirect_url?: string;
  redirect_to?: string;
};
type SBAuthOAuth = {
  getAuthorizationDetails: (id: string) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
};
function oauth(): SBAuthOAuth {
  return (supabase.auth as unknown as { oauth: SBAuthOAuth }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) {
      const qs = new URLSearchParams({ next }).toString();
      throw redirect({ to: "/auth", search: { next } as any, href: `/auth?${qs}` } as any);
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate } as any);
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md p-8 text-sm">
      Could not load this authorization request: {String((error as Error)?.message ?? error)}
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) { setBusy(false); setError(error.message); return; }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) { setBusy(false); setError("No redirect returned by the authorization server."); return; }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "an app";

  return (
    <main className="mx-auto max-w-md p-8">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-bold tracking-tight">Connect {clientName} to Line Check</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This lets {clientName} use Line Check as you — reading your shared shifts and settings via MCP tools.
        </p>
        {error && (
          <p role="alert" className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="mt-6 flex gap-2">
          <button
            disabled={busy}
            onClick={() => decide(true)}
            className="flex-1 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            disabled={busy}
            onClick={() => decide(false)}
            className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Deny
          </button>
        </div>
      </div>
    </main>
  );
}
