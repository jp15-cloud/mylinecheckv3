import { useEffect, useState } from "react";
import { CheckCircle2, CloudOff, Loader2, RefreshCw, AlertTriangle, CloudDownload } from "lucide-react";
import {
  getSyncState,
  onSyncState,
  type SyncState,
} from "@/lib/settingsSync";

function timeAgo(ts: number | null): string {
  if (!ts) return "";
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

export function SyncStatus({ className = "" }: { className?: string }) {
  const [state, setState] = useState<SyncState>(getSyncState);
  const [, setTick] = useState(0);

  useEffect(() => onSyncState(setState), []);
  // Refresh "x ago" once per second.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const view = (() => {
    switch (state.status) {
      case "signed-out":
        return {
          icon: <CloudOff className="h-3.5 w-3.5" />,
          label: "Not syncing",
          tone: "bg-muted text-muted-foreground",
          sub: "",
        };
      case "syncing":
        return {
          icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
          label: "Syncing…",
          tone: "bg-info-soft text-info",
          sub: "Loading your setup",
        };
      case "saving":
        return {
          icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" />,
          label: "Saving…",
          tone: "bg-info-soft text-info",
          sub: "Pushing changes to cloud",
        };
      case "saved":
        return {
          icon: <CheckCircle2 className="h-3.5 w-3.5" />,
          label: "Saved",
          tone: "bg-success-soft text-success",
          sub: state.lastSavedAt
            ? `Saved ${timeAgo(state.lastSavedAt)}`
            : state.lastReceivedAt
              ? `Synced ${timeAgo(state.lastReceivedAt)}`
              : "Up to date",
        };
      case "received":
        return {
          icon: <CloudDownload className="h-3.5 w-3.5" />,
          label: "Updated from another device",
          tone: "bg-violet-soft text-violet",
          sub: state.lastReceivedAt ? `Received ${timeAgo(state.lastReceivedAt)}` : "",
        };
      case "error":
        return {
          icon: <AlertTriangle className="h-3.5 w-3.5" />,
          label: "Sync error",
          tone: "bg-danger-soft text-danger",
          sub: state.error ?? "Will retry on next change",
        };
      default:
        return {
          icon: <CloudOff className="h-3.5 w-3.5" />,
          label: "Idle",
          tone: "bg-muted text-muted-foreground",
          sub: "",
        };
    }
  })();

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${view.tone} ${className}`}
      title={view.sub}
      aria-live="polite"
    >
      {view.icon}
      <span>{view.label}</span>
      {view.sub && (
        <span className="hidden text-[10px] font-medium normal-case tracking-normal opacity-80 sm:inline">
          · {view.sub}
        </span>
      )}
    </div>
  );
}