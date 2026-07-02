// Per-user scoped localStorage wrapper.
// Keys are transparently namespaced with the current user id so multiple
// accounts on the same browser stay isolated. Default scope is "guest".

let currentUid = "guest";
const listeners = new Set<() => void>();

export function setUserScope(uid: string | null) {
  const next = uid || "guest";
  if (next === currentUid) return;
  currentUid = next;
  for (const fn of listeners) fn();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("linecheck:scope-change"));
  }
}

export function getUserScope() {
  return currentUid;
}

export function onScopeChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function scopedKey(raw: string) {
  return `u:${currentUid}:${raw}`;
}

function safe(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

type WriteHook = (key: string, value: string | null) => void;
const writeHooks = new Set<WriteHook>();

export function onLocalWrite(fn: WriteHook) {
  writeHooks.add(fn);
  return () => writeHooks.delete(fn);
}

function notifyWrite(key: string, value: string | null) {
  for (const fn of writeHooks) {
    try {
      fn(key, value);
    } catch {
      // ignore hook errors
    }
  }
}

export const lsStore = {
  getItem(key: string) {
    const s = safe();
    return s ? s.getItem(scopedKey(key)) : null;
  },
  setItem(key: string, value: string) {
    const s = safe();
    if (s) s.setItem(scopedKey(key), value);
    notifyWrite(key, value);
  },
  removeItem(key: string) {
    const s = safe();
    if (s) s.removeItem(scopedKey(key));
    notifyWrite(key, null);
  },
  /** Local-only write that does NOT notify sync hooks (used when hydrating from cloud). */
  setItemLocal(key: string, value: string) {
    const s = safe();
    if (s) s.setItem(scopedKey(key), value);
  },
  removeItemLocal(key: string) {
    const s = safe();
    if (s) s.removeItem(scopedKey(key));
  },
  /** List raw (un-prefixed) keys belonging to the current user. */
  keys(): string[] {
    const s = safe();
    if (!s) return [];
    const prefix = `u:${currentUid}:`;
    const out: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(prefix)) out.push(k.slice(prefix.length));
    }
    return out;
  },
};
