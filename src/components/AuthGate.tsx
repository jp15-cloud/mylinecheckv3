import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { setUserScope } from "@/lib/lsStore";
import { startSettingsSync, stopSettingsSync } from "@/lib/settingsSync";
import { Loader2 } from "lucide-react";

type AuthStatus = "loading" | "signed-in" | "signed-out";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session?.user) {
        setUserScope(data.session.user.id);
        void startSettingsSync(data.session.user.id);
        setStatus("signed-in");
      } else {
        setUserScope(null);
        stopSettingsSync();
        setStatus("signed-out");
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session?.user) {
        setUserScope(session.user.id);
        void startSettingsSync(session.user.id);
        setStatus("signed-in");
      } else {
        setUserScope(null);
        stopSettingsSync();
        setStatus("signed-out");
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const isPublic = pathname === "/auth" || pathname.startsWith("/s/");

  useEffect(() => {
    if (status === "signed-out" && !isPublic) {
      const next = pathname + (searchStr || "");
      const qs = new URLSearchParams({ next }).toString();
      window.location.replace(`/auth?${qs}`);
    }
  }, [status, isPublic, pathname, searchStr]);

  if (isPublic) return <>{children}</>;

  if (status !== "signed-in") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  return <>{children}</>;
}
