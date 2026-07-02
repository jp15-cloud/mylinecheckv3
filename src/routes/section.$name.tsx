import { lsStore } from "@/lib/lsStore";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell, useShellState } from "@/components/AppShell";
import {
  SECTIONS,
  STATUSES,
  emptyEntry,
  loadSection,
  storageKey,
  FLAG_STATUSES,
  OK_STATUSES,
  type Entry,
  type SectionState,
  type Slot,
} from "@/lib/lineCheck";
import { Check, ChevronDown, ChevronUp, Download, Edit3, Filter, MoreHorizontal, Save, Thermometer, Plus, Trash2, Upload, X } from "lucide-react";
import { z } from "zod";

type EditItem = { name: string; quality: string; shelf: string; container: string };
type EditCategory = { group: string; temp: boolean; items: EditItem[] };

const DEFAULT_SHELF_OPTIONS = ["By Expiration", "1 Day", "3 Days", "7 Days", "14 Days", "30 Days", "60 Days", "90 Days"];
const DEFAULT_CONTAINER_OPTIONS = ["Can", "Bottle", "1/3 Pan", "1/6 Pan", "1/9 Pan", "Full Pan", "Half Pan", "Quart", "Squeeze Bottle", "Other"];
const SHELVES_KEY = "linecheck:settings:shelves";
const CONTAINERS_KEY = "linecheck:settings:containers";

function readList(key: string, fallback: string[]): string[] {
  try {
    const raw = lsStore.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) return parsed;
    }
  } catch {}
  return fallback;
}

function useOptionList(key: string, evt: string, fallback: string[]): string[] {
  const [list, setList] = useState<string[]>(() => readList(key, fallback));
  useEffect(() => {
    const refresh = () => setList(readList(key, fallback));
    window.addEventListener(evt, refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("linecheck:scope-change", refresh);
    return () => {
      window.removeEventListener(evt, refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("linecheck:scope-change", refresh);
    };
  }, [key, evt, fallback]);
  return list;
}

function sectionStructKey(name: string) {
  return `linecheck:section-items:${name}`;
}

function loadSectionStruct(name: string, fallback: EditCategory[]): EditCategory[] {
  try {
    const raw = lsStore.getItem(sectionStructKey(name));
    if (raw) return JSON.parse(raw);
  } catch {}
  return fallback;
}

export const Route = createFileRoute("/section/$name")({
  validateSearch: (s: Record<string, unknown>) =>
    z
      .object({
        date: z.string().optional(),
        shift: z.enum(["op", "mid", "cl"]).optional(),
      })
      .parse(s),
  head: ({ params }) => ({
    meta: [
      { title: `${params.name} — Line Check` },
      { name: "description", content: `Line check for ${params.name} section.` },
    ],
  }),
  component: SectionPage,
  notFoundComponent: () => <div className="p-10">Section not found.</div>,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-10">
        <p className="text-destructive">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-4 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
        >
          Retry
        </button>
      </div>
    );
  },
});

const STATUS_STYLES: Record<string, string> = {
  OK: "bg-emerald-500 text-white border-emerald-500",
  "N/A": "bg-muted text-muted-foreground border-border",
  "F/O": "bg-amber-100 text-amber-900 border-amber-300",
  PREPPING: "bg-sky-100 text-sky-900 border-sky-300",
  "NEED TO CLEAN": "bg-sky-100 text-sky-900 border-sky-300",
  "WRONG LABEL": "bg-violet-100 text-violet-900 border-violet-300",
  "ABOUT TO EXPIRE": "bg-amber-100 text-amber-900 border-amber-300",
  EXPIRED: "bg-rose-100 text-rose-900 border-rose-300",
};

function buildDefaultStruct(section: { items: Array<{ name: string; group?: string | null; quality?: string | null; shelf?: string | null; container?: string | null }> }): EditCategory[] {
  const map = new Map<string, EditCategory>();
  for (const it of section.items) {
    const g = it.group || "Items";
    if (!map.has(g)) map.set(g, { group: g, temp: /temp/i.test(g), items: [] });
    map.get(g)!.items.push({
      name: it.name,
      quality: it.quality || "",
      shelf: it.shelf || "",
      container: it.container || "",
    });
  }
  return [...map.values()];
}

function SectionPage() {
  const { name } = Route.useParams();
  const search = Route.useSearch() as { date?: string; shift?: Slot };
  const section = SECTIONS.find((s) => s.name === name);
  const shell = useShellState(name);

  // Sync shell to search params when reopening a past shift from history.
  useEffect(() => {
    if (search.date && search.date !== shell.date) shell.setDate(search.date);
    if (search.shift && search.shift !== shell.shift) shell.setShift(search.shift);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.date, search.shift]);

  const key = useMemo(() => storageKey(name, shell.date), [name, shell.date]);
  const tempKey = useMemo(
    () => `linecheck:temps:${name}:${shell.date}:${shell.shift}`,
    [name, shell.date, shell.shift],
  );
  const [state, setState] = useState<SectionState>(() => loadSection(name, shell.date));
  const [editMode, setEditMode] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [temps, setTemps] = useState<Record<string, string>>({});
  const [tempUnit, setTempUnitState] = useState<"F" | "C">(() => {
    try {
      const v = lsStore.getItem("linecheck:settings:temp-unit");
      return v === "C" ? "C" : "F";
    } catch {
      return "F";
    }
  });
  const toggleTempUnit = () => {
    setTempUnitState((prev) => {
      const next = prev === "F" ? "C" : "F";
      try {
        lsStore.setItem("linecheck:settings:temp-unit", next);
      } catch {}
      return next;
    });
  };
  const SHELF_OPTIONS = useOptionList(SHELVES_KEY, "linecheck:shelves-update", DEFAULT_SHELF_OPTIONS);
  const CONTAINER_OPTIONS = useOptionList(CONTAINERS_KEY, "linecheck:containers-update", DEFAULT_CONTAINER_OPTIONS);

  // Temps are stored in Fahrenheit for backward compatibility.
  const displayTemp = (rawF: string | undefined) => {
    if (!rawF) return "";
    const n = parseFloat(rawF);
    if (!Number.isFinite(n)) return "";
    if (tempUnit === "F") return String(rawF);
    return String(Math.round(((n - 32) * 5) / 9 * 10) / 10);
  };
  const onTempInput = (group: string, value: string) => {
    if (value === "") {
      setTemp(group, "");
      return;
    }
    const n = parseFloat(value);
    if (!Number.isFinite(n)) {
      setTemp(group, value);
      return;
    }
    const asF = tempUnit === "F" ? value : String(Math.round(((n * 9) / 5 + 32) * 10) / 10);
    setTemp(group, asF);
  };

  useEffect(() => {
    try {
      const raw = lsStore.getItem(tempKey);
      setTemps(raw ? JSON.parse(raw) : {});
    } catch {
      setTemps({});
    }
  }, [tempKey]);

  const setTemp = (group: string, value: string) => {
    setTemps((prev) => {
      const next = { ...prev, [group]: value };
      try {
        lsStore.setItem(tempKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const defaultStruct = useMemo(
    () => (section ? buildDefaultStruct(section) : []),
    [section],
  );
  const [struct, setStruct] = useState<EditCategory[]>(() =>
    loadSectionStruct(name, defaultStruct),
  );
  const [draft, setDraft] = useState<EditCategory[]>(struct);

  useEffect(() => {
    setState(loadSection(name, shell.date));
  }, [name, shell.date]);

  useEffect(() => {
    const s = loadSectionStruct(name, defaultStruct);
    setStruct(s);
    setDraft(s);
  }, [name, defaultStruct]);

  useEffect(() => {
    try {
      lsStore.setItem(key, JSON.stringify(state));
      window.dispatchEvent(new Event("linecheck:update"));
    } catch {}
  }, [key, state]);

  if (!section) return <div className="p-10">Section not found.</div>;

  const slot: Slot = shell.shift;
  const allItems = struct.flatMap((c) => c.items);
  const total = allItems.length;
  const done = allItems.filter((i) => state.entries[i.name]?.[slot]?.status).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const missingNotes = allItems.filter((i) => {
    const e = state.entries[i.name]?.[slot];
    return e?.status && FLAG_STATUSES.has(e.status) && !e.note?.trim();
  });
  const canSave = missingNotes.length === 0;

  const setEntry = (item: string, patch: Partial<Entry>) => {
    setState((prev) => ({
      ...prev,
      entries: {
        ...prev.entries,
        [item]: {
          op: prev.entries[item]?.op ?? emptyEntry(),
          mid: prev.entries[item]?.mid ?? emptyEntry(),
          cl: prev.entries[item]?.cl ?? emptyEntry(),
          [slot]: { ...(prev.entries[item]?.[slot] ?? emptyEntry()), ...patch },
        },
      },
    }));
  };


  const toggleCheck = (item: string) => {
    const cur = state.entries[item]?.[slot]?.status;
    setEntry(item, { status: cur === "OK" ? "" : "OK" });
  };

  const markAllOK = () => {
    setState((prev) => {
      const entries = { ...prev.entries };
      for (const it of allItems) {
        entries[it.name] = {
          op: entries[it.name]?.op ?? emptyEntry(),
          mid: entries[it.name]?.mid ?? emptyEntry(),
          cl: entries[it.name]?.cl ?? emptyEntry(),
          [slot]: { status: "OK", note: entries[it.name]?.[slot]?.note ?? "" },
        };
      }
      return { ...prev, entries };
    });
  };

  const unmarkAll = () => {
    setState((prev) => {
      const entries = { ...prev.entries };
      for (const it of allItems) {
        entries[it.name] = {
          op: entries[it.name]?.op ?? emptyEntry(),
          mid: entries[it.name]?.mid ?? emptyEntry(),
          cl: entries[it.name]?.cl ?? emptyEntry(),
          [slot]: { status: "", note: "" },
        };
      }
      return { ...prev, entries };
    });
  };

  const saveCheck = () => {
    if (!canSave) return;
    try {
      lsStore.setItem(key, JSON.stringify(state));
      window.dispatchEvent(new Event("linecheck:update"));
    } catch {}
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1400);
  };


  const enterEdit = () => {
    setDraft(JSON.parse(JSON.stringify(struct)));
    setEditMode(true);
  };
  const cancelEdit = () => {
    setDraft(struct);
    setEditMode(false);
  };
  const saveCategories = () => {
    try {
      lsStore.setItem(sectionStructKey(name), JSON.stringify(draft));
    } catch {}
    setStruct(draft);
    setEditMode(false);
  };

  const updateCat = (i: number, patch: Partial<EditCategory>) =>
    setDraft((d) => d.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const removeCat = (i: number) =>
    setDraft((d) => d.filter((_, idx) => idx !== i));
  const addCat = () =>
    setDraft((d) => [...d, { group: "New Category", temp: false, items: [] }]);
  const updateItem = (ci: number, ii: number, patch: Partial<EditItem>) =>
    setDraft((d) =>
      d.map((c, idx) =>
        idx === ci ? { ...c, items: c.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) } : c,
      ),
    );
  const removeItem = (ci: number, ii: number) =>
    setDraft((d) =>
      d.map((c, idx) => (idx === ci ? { ...c, items: c.items.filter((_, j) => j !== ii) } : c)),
    );
  const addItem = (ci: number) =>
    setDraft((d) =>
      d.map((c, idx) =>
        idx === ci
          ? { ...c, items: [...c.items, { name: "", quality: "", shelf: "By Expiration", container: "Can" }] }
          : c,
      ),
    );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const downloadTemplate = () => {
    const header = "Category,Temp,Item,Quality,Shelf,Container";
    const esc = (v: string) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows: string[] = [header];
    const source = draft.length ? draft : struct;
    if (source.length === 0) {
      rows.push("Items,false,Sample Item,Fresh,By Expiration,1/6 Pan");
    } else {
      for (const cat of source) {
        if (cat.items.length === 0) {
          rows.push([cat.group, cat.temp ? "true" : "false", "", "", "", ""].map(esc).join(","));
        }
        for (const it of cat.items) {
          rows.push(
            [cat.group, cat.temp ? "true" : "false", it.name, it.quality, it.shelf, it.container]
              .map(esc)
              .join(","),
          );
        }
      }
    }
    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/[^\w-]+/g, "_")}-template.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const parseCsv = (text: string): string[][] => {
    const rows: string[][] = [];
    let cur: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ",") { cur.push(field); field = ""; }
        else if (c === "\n" || c === "\r") {
          if (field !== "" || cur.length) { cur.push(field); rows.push(cur); cur = []; field = ""; }
          if (c === "\r" && text[i + 1] === "\n") i++;
        } else field += c;
      }
    }
    if (field !== "" || cur.length) { cur.push(field); rows.push(cur); }
    return rows;
  };

  const uploadTemplate = async (file: File) => {
    try {
      const text = await file.text();
      const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
      if (rows.length < 2) { alert("CSV is empty."); return; }
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const idx = (k: string) => header.indexOf(k);
      const iCat = idx("category"), iTemp = idx("temp"), iItem = idx("item"),
        iQual = idx("quality"), iShelf = idx("shelf"), iCont = idx("container");
      if (iCat < 0 || iItem < 0) {
        alert("CSV must have at least 'Category' and 'Item' columns.");
        return;
      }
      const map = new Map<string, EditCategory>();
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const group = (row[iCat] ?? "").trim();
        if (!group) continue;
        const tempVal = iTemp >= 0 ? (row[iTemp] ?? "").trim().toLowerCase() : "";
        const temp = tempVal === "true" || tempVal === "1" || tempVal === "yes";
        if (!map.has(group)) map.set(group, { group, temp, items: [] });
        const cat = map.get(group)!;
        if (temp) cat.temp = true;
        const itemName = (row[iItem] ?? "").trim();
        if (!itemName) continue;
        cat.items.push({
          name: itemName,
          quality: iQual >= 0 ? (row[iQual] ?? "").trim() : "",
          shelf: iShelf >= 0 ? (row[iShelf] ?? "").trim() : "",
          container: iCont >= 0 ? (row[iCont] ?? "").trim() : "",
        });
      }
      const next = [...map.values()];
      if (next.length === 0) { alert("No valid rows found in CSV."); return; }
      const replace = window.confirm(
        `Import ${next.reduce((a, c) => a + c.items.length, 0)} items into ${next.length} categor${next.length === 1 ? "y" : "ies"}?\n\nOK = Replace current categories\nCancel = Merge with existing`,
      );
      if (replace) {
        setDraft(next);
      } else {
        setDraft((d) => {
          const merged: EditCategory[] = d.map((c) => ({ ...c, items: [...c.items] }));
          for (const inc of next) {
            const existing = merged.find((c) => c.group.toLowerCase() === inc.group.toLowerCase());
            if (existing) {
              if (inc.temp) existing.temp = true;
              existing.items.push(...inc.items);
            } else merged.push(inc);
          }
          return merged;
        });
      }
    } catch (e) {
      alert("Failed to parse CSV: " + (e instanceof Error ? e.message : String(e)));
    }
  };


  const moveCat = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.length) return d;
      const next = [...d];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const moveItem = (ci: number, ii: number, dir: -1 | 1) =>
    setDraft((d) =>
      d.map((c, idx) => {
        if (idx !== ci) return c;
        const j = ii + dir;
        if (j < 0 || j >= c.items.length) return c;
        const items = [...c.items];
        [items[ii], items[j]] = [items[j], items[ii]];
        return { ...c, items };
      }),
    );

  const shiftLabel = slot === "op" ? "Opening" : slot === "mid" ? "Mid" : "Closing";
  const ringStyle = {
    background: `conic-gradient(var(--ring-color, hsl(258 90% 66%)) ${pct * 3.6}deg, hsl(var(--muted)) 0deg)`,
  } as React.CSSProperties;

  if (!shell.member) {
    return (
      <AppShell {...shell}>
        <div className="mx-auto max-w-md rounded-2xl border border-danger/40 bg-danger-soft p-6 text-center">
          <h1 className="text-lg font-bold text-danger">Select a team member first</h1>
          <p className="mt-2 text-sm text-danger/90">
            You must pick your name from the Team Member picker in the top bar
            before opening a station.
          </p>
          <button
            onClick={() => { window.location.href = "/"; }}
            className="mt-4 inline-flex items-center rounded-full border border-danger/40 bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent"
          >
            Back to Overview
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell {...shell}>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-base font-bold tracking-tight">{section.name}</h1>
      </div>

      {/* Hero card */}
      <section className="rounded-2xl border border-border bg-card px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-extrabold tracking-tight">{section.name}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {done} of {total} items checked{!editMode && ` · ${shiftLabel}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="grid h-14 w-14 place-items-center rounded-full"
              style={ringStyle}
              aria-label={`${pct} percent complete`}
            >
              <div className="grid h-[46px] w-[46px] place-items-center rounded-full bg-card text-sm font-bold tabular-nums">
                {editMode ? done : pct}
              </div>
            </div>
            {!editMode && (
              <>
                <button
                  onClick={() => setFlaggedOnly((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${
                    flaggedOnly
                      ? "border-rose-300 bg-rose-50 text-rose-700"
                      : "border-border bg-card hover:bg-accent"
                  }`}
                >
                  <Filter className="h-3.5 w-3.5" /> {flaggedOnly ? "Flagged Only" : "All Items"}
                </button>
                <button
                  onClick={enterEdit}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold hover:bg-accent"
                >
                  <Edit3 className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  onClick={markAllOK}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold hover:bg-accent"
                >
                  <Check className="h-3.5 w-3.5" /> Mark All OK
                </button>
                <button
                  onClick={unmarkAll}
                  disabled={done === 0}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" /> Unmark All
                </button>
                <button
                  onClick={saveCheck}
                  disabled={!canSave}
                  title={!canSave ? `Add notes for ${missingNotes.length} flagged item(s)` : undefined}
                  className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3.5 py-2 text-xs font-semibold text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" /> {savedFlash ? "Saved!" : "Save Check"}
                </button>

              </>
            )}
            {editMode && (
              <>
                <button
                  onClick={saveCategories}
                  className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background hover:opacity-90"
                >
                  <Save className="h-3.5 w-3.5" /> Save Categories
                </button>
                <button
                  onClick={cancelEdit}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold hover:bg-accent"
                >
                  <X className="h-3.5 w-3.5" /> Cancel
                </button>
              </>
            )}
          </div>
        </div>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: "var(--gradient-readiness)" }}
          />
        </div>
      </section>

      {/* Edit Categories & Items panel */}
      {editMode && (
        <section className="mt-5 rounded-2xl border border-border bg-card px-6 py-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Edit Categories &amp; Items
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={downloadTemplate}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-accent"
                title="Download a CSV template pre-filled with current items"
              >
                <Download className="h-3.5 w-3.5" /> Download Template
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-accent"
                title="Upload a CSV to bulk-add items"
              >
                <Upload className="h-3.5 w-3.5" /> Upload CSV
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadTemplate(f);
                  e.target.value = "";
                }}
              />
              <button
                onClick={addCat}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-accent"
              >
                <Plus className="h-3.5 w-3.5" /> Add Category
              </button>
            </div>
          </div>

          <div className="space-y-5">
            {draft.map((cat, ci) => (
              <div key={ci} className="rounded-xl border border-border bg-background/40 p-3">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button
                      onClick={() => moveCat(ci, -1)}
                      disabled={ci === 0}
                      className="grid h-4 w-6 place-items-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30"
                      aria-label="Move category up"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => moveCat(ci, 1)}
                      disabled={ci === draft.length - 1}
                      className="grid h-4 w-6 place-items-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30"
                      aria-label="Move category down"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <input
                    value={cat.group}
                    onChange={(e) => updateCat(ci, { group: e.target.value })}
                    placeholder="Category name"
                    className="flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm font-bold tracking-tight outline-none focus:border-foreground/30"
                  />
                  <label className={`grid h-7 w-7 cursor-pointer place-items-center rounded-md border ${cat.temp ? "border-emerald-500 bg-emerald-500 text-white" : "border-input bg-background text-muted-foreground"}`}>
                    <input
                      type="checkbox"
                      checked={cat.temp}
                      onChange={(e) => updateCat(ci, { temp: e.target.checked })}
                      className="sr-only"
                    />
                    {cat.temp && <Check className="h-4 w-4" strokeWidth={3} />}
                  </label>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Thermometer className="h-3.5 w-3.5 text-sky-500" /> Temp
                  </span>
                  <button
                    onClick={() => removeCat(ci)}
                    className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-danger-soft hover:text-danger"
                    aria-label="Delete category"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {cat.items.map((it, ii) => (
                    <div key={ii} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <button
                            onClick={() => moveItem(ci, ii, -1)}
                            disabled={ii === 0}
                            className="grid h-4 w-6 place-items-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30"
                            aria-label="Move item up"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => moveItem(ci, ii, 1)}
                            disabled={ii === cat.items.length - 1}
                            className="grid h-4 w-6 place-items-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30"
                            aria-label="Move item down"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <input
                          value={it.name}
                          onChange={(e) => updateItem(ci, ii, { name: e.target.value })}
                          placeholder="Item name"
                          className="flex-1 rounded-lg border border-input bg-card px-3 py-1.5 text-sm outline-none focus:border-foreground/30"
                        />
                        <button
                          onClick={() => removeItem(ci, ii)}
                          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-danger-soft hover:text-danger"
                          aria-label="Delete item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          value={it.quality}
                          onChange={(e) => updateItem(ci, ii, { quality: e.target.value })}
                          placeholder="Quality / spec"
                          className="min-w-[200px] flex-1 rounded-lg border border-input bg-card px-3 py-1.5 text-xs outline-none focus:border-foreground/30"
                        />
                        <select
                          value={it.shelf}
                          onChange={(e) => updateItem(ci, ii, { shelf: e.target.value })}
                          className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs outline-none"
                        >
                          {[it.shelf, ...SHELF_OPTIONS.filter((o) => o !== it.shelf)].filter(Boolean).map((o) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                        <select
                          value={it.container}
                          onChange={(e) => updateItem(ci, ii, { container: e.target.value })}
                          className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs outline-none"
                        >
                          {[it.container, ...CONTAINER_OPTIONS.filter((o) => o !== it.container)].filter(Boolean).map((o) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                        <div className="w-7" />
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => addItem(ci)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border bg-card/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Item
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Groups (view mode) */}
      {!editMode &&
        struct
          .map((cat) => {
            const visible = cat.items.filter((item) => {
              if (!flaggedOnly) return true;
              const s = state.entries[item.name]?.[slot]?.status;
              return !!s && FLAG_STATUSES.has(s);
            });
            return [cat, visible] as const;
          })
          .filter(([, visible]) => visible.length > 0)
          .map(([cat, items]) => (
            <section key={cat.group} className="mt-6">
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  {cat.group}
                </h3>
                {cat.temp && (
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <Thermometer className="h-3 w-3 text-sky-500" />
                    <label className="uppercase tracking-wide">Temp</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      value={displayTemp(temps[cat.group])}
                      onChange={(ev) => onTempInput(cat.group, ev.target.value)}
                      placeholder="—"
                      aria-label={`${cat.group} temperature reading`}
                      className="w-14 rounded-md border border-input bg-background px-1.5 py-0.5 text-[11px] font-semibold text-foreground outline-none focus:border-foreground/40"
                    />
                    <button
                      type="button"
                      onClick={toggleTempUnit}
                      aria-label={`Switch temperature unit (currently ${tempUnit === "F" ? "Fahrenheit" : "Celsius"})`}
                      className="rounded px-1 py-0.5 text-[11px] font-semibold text-foreground hover:bg-accent"
                    >
                      °{tempUnit}
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {items.map((item) => {
                  const e = state.entries[item.name]?.[slot];
                  const status = e?.status ?? "";
                  const checked = !!status && OK_STATUSES.has(status);
                  const flagged = status && FLAG_STATUSES.has(status);
                  const itemPct = status ? 100 : 0;

                  const noteMissing = flagged && !e?.note?.trim();
                  return (
                    <div
                      key={item.name}
                      className={`rounded-2xl border bg-card transition ${
                        noteMissing ? "border-rose-400 ring-1 ring-rose-200" : flagged ? "border-rose-200" : "border-border"
                      }`}
                    >
                      <div className="flex items-center gap-3 px-3 py-2.5">
                      <button
                        onClick={() => toggleCheck(item.name)}
                        aria-label={checked ? "Uncheck item" : "Mark item OK"}
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border transition ${
                          checked
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-input bg-background hover:bg-accent"
                        }`}
                      >
                        {checked && <Check className="h-4 w-4" strokeWidth={3} />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm font-semibold ${
                            checked ? "text-muted-foreground line-through" : "text-foreground"
                          }`}
                        >
                          {item.name}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {[item.shelf, item.container].filter(Boolean).join(" · ") || "—"}
                        </p>
                        {item.quality && (
                          <p className="truncate text-[11px] italic text-muted-foreground/80">
                            {item.quality}
                          </p>
                        )}
                      </div>

                      <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-muted sm:block">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${itemPct}%`,
                            background: "var(--gradient-readiness)",
                          }}
                        />
                      </div>

                      <div className="relative">
                        <select
                          value={status}
                          onChange={(ev) => setEntry(item.name, { status: ev.target.value })}
                          className={`appearance-none rounded-md border px-2.5 py-1 pr-6 text-[11px] font-semibold uppercase tracking-wide ${
                            status
                              ? STATUS_STYLES[status] ?? "border-border bg-card"
                              : "border-input bg-background text-muted-foreground"
                          }`}
                          aria-label={`${item.name} status`}
                        >
                          <option value="">Unchecked</option>
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <svg
                          className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 opacity-70"
                          viewBox="0 0 12 12"
                          fill="none"
                        >
                          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>

                      <button
                        className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-accent"
                        aria-label="More options"
                        onClick={() => setEntry(item.name, { note: prompt("Note for this item:", e?.note ?? "") ?? e?.note ?? "" })}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      </div>
                      {flagged && (
                        <div className="border-t border-border/60 px-3 py-2.5">
                          <div className="mb-1.5 flex items-center justify-between">
                            <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                              Corrective Note
                            </label>
                            {noteMissing && (
                              <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700">
                                Required
                              </span>
                            )}
                          </div>
                          <textarea
                            value={e?.note ?? ""}
                            onChange={(ev) => setEntry(item.name, { note: ev.target.value })}
                            placeholder={`Describe the issue (${status})…`}
                            rows={2}
                            className={`w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-foreground/40 ${
                              noteMissing ? "border-rose-300" : "border-input"
                            }`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

              </div>
            </section>
          ))}
    </AppShell>
  );
}
