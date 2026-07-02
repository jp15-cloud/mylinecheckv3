import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  SECTIONS,
  FLAG_STATUSES,
  SLOT_LABEL,
  type Slot,
} from "@/lib/lineCheck";
import {
  sharedShiftPayloadSchema,
  type SharedShiftPayload,
} from "@/lib/share";
import {
  AlertTriangle,
  CheckCircle2,
  User,
  Calendar,
  Clock,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/s/$id")({
  head: () => ({
    meta: [
      { title: "Shared Shift — Line Check" },
      { name: "description", content: "Read-only shared shift report." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SharedView,
});

type SharedSection = SharedShiftPayload["sections"][number]["state"];

function SharedView() {
  const { id } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    payload: SharedShiftPayload;
    updated_at: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase
      .rpc("get_shared_shift", { _id: id })
      .then(({ data: rows, error: err }) => {
        if (!active) return;
        const row = Array.isArray(rows) ? rows[0] : null;
        if (err) {
          setError(err.message);
        } else if (!row) {
          setError("This share link no longer exists.");
        } else {
          const parsed = sharedShiftPayloadSchema.safeParse(row.payload);
          if (!parsed.success) {
            console.error("[shared shift] invalid payload", parsed.error);
            setError("This shared shift is incomplete or corrupted.");
          } else {
            setData({
              payload: parsed.data,
              updated_at: row.updated_at ?? new Date().toISOString(),
            });
          }
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const grouped = useMemo(() => {
    if (!data) return [];
    const slot: Slot = data.payload.shift;
    const map = new Map<string, SharedSection>();
    for (const s of data.payload.sections) map.set(s.name, s.state);

    type Item = { item: string; status: string; note: string; flagged: boolean };
    const out: { section: string; items: Item[] }[] = [];
    for (const sec of SECTIONS) {
      const st = map.get(sec.name);
      if (!st) continue;
      const items: Item[] = [];
      for (const it of sec.items) {
        const e = st.entries[it.name]?.[slot];
        if (!e?.status) continue;
        items.push({
          item: it.name,
          status: e.status,
          note: e.note || "",
          flagged: FLAG_STATUSES.has(e.status),
        });
      }
      if (items.length) out.push({ section: sec.name, items });
    }
    return out;
  }, [data]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4 text-center">
        <div>
          <h1 className="text-xl font-bold">Share unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error ?? "Not found."}</p>
          <Link to="/" className="mt-4 inline-block text-sm font-semibold underline">
            Go home
          </Link>
        </div>
      </div>
    );
  }

  const p = data.payload;
  const slot = p.shift as Slot;
  const pct = p.summary.totalItems
    ? Math.round((p.summary.checkedItems / p.summary.totalItems) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-foreground text-background text-sm font-bold">
              {(p.brand_name || "L").charAt(0).toUpperCase()}
            </span>
            <span className="text-sm font-bold tracking-tight">{p.brand_name}</span>
          </div>
          <span className="rounded-full bg-muted/60 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Read-only
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-2xl font-black tracking-tight">
          {SLOT_LABEL[slot]} Shift · {p.date}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Last updated {new Date(data.updated_at).toLocaleString()}
        </p>

        <section className="mt-5 rounded-3xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1 text-xs font-semibold">
              <Calendar className="h-3.5 w-3.5" /> {p.date}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1 text-xs font-semibold">
              <Clock className="h-3.5 w-3.5" /> {SLOT_LABEL[slot]}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-info-soft px-3 py-1 text-xs font-semibold text-info">
              <User className="h-3.5 w-3.5" /> {p.member || "Unassigned"}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat value={p.summary.stationsTouched} label="Stations" />
            <Stat value={p.summary.stationsComplete} label="Complete" tone="text-success" />
            <Stat value={`${p.summary.checkedItems}/${p.summary.totalItems}`} label="Items" />
            <Stat value={p.summary.flagged} label="Flagged" tone="text-danger" />
          </div>

          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, background: "var(--gradient-readiness)" }}
            />
          </div>
        </section>

        {grouped.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            No items recorded for this shift.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {grouped.map((r) => {
              const flaggedCount = r.items.filter((i) => i.flagged).length;
              const okCount = r.items.length - flaggedCount;
              return (
                <section
                  key={r.section}
                  className="flex flex-col rounded-2xl border border-border bg-card p-4"
                >
                  <header className="mb-3 flex items-center gap-2 border-b border-border/60 pb-2">
                    <h3 className="min-w-0 flex-1 truncate text-sm font-black uppercase tracking-wider">
                      {r.section}
                    </h3>
                    {okCount > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold text-success">
                        <CheckCircle2 className="h-3 w-3" /> {okCount}
                      </span>
                    )}
                    {flaggedCount > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-[10px] font-bold text-danger">
                        <AlertTriangle className="h-3 w-3" /> {flaggedCount}
                      </span>
                    )}
                  </header>
                  <ul className="space-y-2">
                    {r.items.map((it) => (
                      <li
                        key={it.item}
                        className={`rounded-xl border p-2.5 ${
                          it.flagged ? "border-rose-200 bg-rose-50/40" : "border-border bg-background/40"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{it.item}</p>
                            {it.note && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{it.note}</p>
                            )}
                          </div>
                          <span
                            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              it.flagged
                                ? "bg-danger-soft text-danger"
                                : "bg-success-soft text-success"
                            }`}
                          >
                            {it.flagged ? (
                              <AlertTriangle className="h-3 w-3" />
                            ) : (
                              <CheckCircle2 className="h-3 w-3" />
                            )}
                            {it.status}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-muted-foreground">
          This is a read-only snapshot shared by the kitchen team.
        </p>
      </main>
    </div>
  );
}

function Stat({
  value,
  label,
  tone,
}: {
  value: number | string;
  label: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl bg-muted/40 px-4 py-3">
      <p className={`text-2xl font-black tabular-nums tracking-tight ${tone ?? "text-foreground"}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
