// Cross-device sync for user settings/setup.
// Mirrors every `linecheck:settings:*` and `linecheck:section-items:*` key
// (plus a few brand/theme prefs) between localStorage and Supabase, per user.

import { supabase } from "@/integrations/supabase/client";
import { lsStore, onLocalWrite } from "@/lib/lsStore";

const SYNC_PREFIXES = [
  "linecheck:settings:",
  "linecheck:section-items:",
  "linecheck:shelves-update",
  "linecheck:containers-update",
];

const BROADCAST_EVENTS = [
  "linecheck:staff-update",
  "linecheck:brand-update",
  "linecheck:shelves-update",
  "linecheck:containers-update",
  "linecheck:update",
];

function isSyncKey(key: string) {
  return SYNC_PREFIXES.some((p) => key.startsWith(p));
}

function broadcastChange() {
  if (typeof window === "undefined") return;
  for (const ev of BROADCAST_EVENTS) {
    window.dispatchEvent(new Event(ev));
  }
}

let currentUserId: string | null = null;
let unhookWrites: (() => void) | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
let applyingRemote = false;

function collectLocalSettings(): Record<string, string> {
  const snap: Record<string, string> = {};
  for (const k of lsStore.keys()) {
    if (!isSyncKey(k)) continue;
    const v = lsStore.getItem(k);
    if (v != null) snap[k] = v;
  }
  return snap;
}

function applyRemote(data: Record<string, string> | null) {
  if (!data) return;
  applyingRemote = true;
  try {
    // Remove local sync-keys that are no longer in the cloud snapshot.
    for (const k of lsStore.keys()) {
      if (!isSyncKey(k)) continue;
      if (!(k in data)) lsStore.removeItemLocal(k);
    }
    for (const [k, v] of Object.entries(data)) {
      if (!isSyncKey(k)) continue;
      if (typeof v === "string") lsStore.setItemLocal(k, v);
    }
  } finally {
    applyingRemote = false;
  }
  broadcastChange();
}

async function pushSnapshot() {
  if (!currentUserId) return;
  const snap = collectLocalSettings();
  const { error } = await supabase
    .from("user_settings")
    .upsert(
      { user_id: currentUserId, data: snap, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) console.warn("[settingsSync] push failed", error.message);
}

function scheduleFlush() {
  if (applyingRemote) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void pushSnapshot();
  }, 500);
}

async function pullSnapshot() {
  if (!currentUserId) return;
  const { data, error } = await supabase
    .from("user_settings")
    .select("data")
    .eq("user_id", currentUserId)
    .maybeSingle();
  if (error) {
    console.warn("[settingsSync] pull failed", error.message);
    return;
  }
  if (data?.data && typeof data.data === "object") {
    applyRemote(data.data as Record<string, string>);
  } else {
    // First device for this account: seed the cloud with whatever is local.
    await pushSnapshot();
  }
}

function subscribeRealtime() {
  if (!currentUserId) return;
  if (realtimeChannel) {
    void supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  realtimeChannel = supabase
    .channel(`user_settings:${currentUserId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_settings",
        filter: `user_id=eq.${currentUserId}`,
      },
      (payload) => {
        const next = (payload.new as { data?: Record<string, string> } | null)?.data;
        if (next) applyRemote(next);
      },
    )
    .subscribe();
}

export async function startSettingsSync(userId: string) {
  if (currentUserId === userId) return;
  stopSettingsSync();
  currentUserId = userId;

  await pullSnapshot();
  subscribeRealtime();

  unhookWrites = onLocalWrite((key) => {
    if (!isSyncKey(key)) return;
    scheduleFlush();
  });
}

export function stopSettingsSync() {
  if (unhookWrites) {
    unhookWrites();
    unhookWrites = null;
  }
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (realtimeChannel) {
    void supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  currentUserId = null;
}
