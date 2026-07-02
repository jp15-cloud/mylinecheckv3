import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell, useShellState } from "@/components/AppShell";
import {
  SECTIONS,
  listHistoryDates,
  shiftHistory,
  clearAllHistory,
  SLOT_LABEL,
  type ShiftHistory,
  type Slot,
} from "@/lib/lineCheck";

import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Filter,
  User,
  Share2,
  Sunrise,
  Sun,
  Moon,
  Trash2,
  Lock,
  X,
  Edit3,
} from "lucide-react";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Shift History — Line Check 2026" },
      {
        name: "description",
        content: "Past line checks, completion trends, and recurring issues.",
      },
    ],
  }),
  component: HistoryPage,
});

const SLOT_ORDER: Slot[] = ["op", "mid", "cl"];
const SLOT_ICON: Record<Slot, React.ComponentType<{ className?: string }>> = {
  op: Sunrise,
  mid: Sun,
  cl: Moon,
};

function HistoryPage() {
  const shell = useShellState("History");
  const navigate = useNavigate();
  const [station, setStation] = useState<string>("ALL");
  const [shiftFilter, setShiftFilter] = useState<string>("ALL");
  const [tick, setTick] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [showClear, setShowClear] = useState(false);


  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    window.addEventListener("storage", fn);
    window.addEventListener("linecheck:update", fn);
    window.addEventListener("linecheck:scope-change", fn);
    return () => {
      window.removeEventListener("storage", fn);
      window.removeEventListener("linecheck:update", fn);
      window.removeEventListener("linecheck:scope-change", fn);
    };
  }, []);

  const { grouped, totals } = useMemo(() => {
    const dates = listHistoryDates();
    const grouped: { date: string; shifts: ShiftHistory[] }[] = [];
    const totals = { checks: 0, complete: 0, flagged: 0 };
    for (const d of dates) {
      const shifts: ShiftHistory[] = [];
      for (const slot of SLOT_ORDER) {
        if (shiftFilter !== "ALL" && slot !== shiftFilter) continue;
        const sh = shiftHistory(d, slot);
        if (sh.stationsTouched === 0) continue;
        shifts.push(sh);
        totals.checks += sh.stationsTouched;
        totals.complete += sh.stationsComplete;
        totals.flagged += sh.flagged;
      }
      if (shifts.length > 0) grouped.push({ date: d, shifts });
    }
    return { grouped, totals };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, station, shiftFilter]);

  const share = async (date: string, slot: Slot) => {
    const key = `${date}:${slot}`;
    try {
      const { publishSharedShift } = await import("@/lib/share");
      const url = await publishSharedShift(date, slot);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(key);
        setTimeout(() => setCopied(null), 1600);
      } catch {
        window.prompt("Copy share link:", url);
      }
    } catch (e) {
      console.error(e);
      window.alert("Could not create share link. Please try again.");
    }
  };

  return (
    <AppShell {...shell}>
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/" })}
          className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-card text-foreground transition-colors hover:bg-accent"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="text-base font-bold tracking-tight">History</h2>
        <button
          onClick={() => setShowClear(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-danger/40 hover:bg-danger-soft hover:text-danger"
          title="Clear all history"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear history
        </button>
      </div>
      {showClear && <ClearHistoryModal onClose={() => setShowClear(false)} onCleared={() => setTick((t) => t + 1)} />}

      <section className="rounded-3xl border border-border bg-card p-6 lg:p-7">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-xl font-bold tracking-tight">Shift History</h3>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Past line checks per shift, completion trends, and shareable links
        </p>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryTile value={totals.checks} label="Total Checks" tone="bg-muted/50" valueClass="text-foreground" />
          <SummaryTile value={totals.complete} label="Fully Complete" tone="bg-success-soft" valueClass="text-success" />
          <SummaryTile value={totals.flagged} label="Flagged Items" tone="bg-danger-soft" valueClass="text-danger" />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Filter className="h-3.5 w-3.5" /> Filter
          </span>
          <FilterSelect
            value={station}
            onChange={setStation}
            options={[
              { value: "ALL", label: "All Stations" },
              ...SECTIONS.map((s) => ({ value: s.name, label: s.name })),
            ]}
          />
          <FilterSelect
            value={shiftFilter}
            onChange={setShiftFilter}
            options={[
              { value: "ALL", label: "All Shifts" },
              { value: "op", label: "Opening" },
              { value: "mid", label: "Mid" },
              { value: "cl", label: "Closing" },
            ]}
          />
        </div>
      </section>

      <h2 className="mb-3 mt-6 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        Past Shifts
      </h2>

      {grouped.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No past shifts yet. Complete a line check to start building history.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ date, shifts }) => (
            <DayBlock
              key={date}
              date={date}
              shifts={shifts}
              onShare={share}
              copied={copied}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function SummaryTile({
  value,
  label,
  tone,
  valueClass,
}: {
  value: number;
  label: string;
  tone: string;
  valueClass: string;
}) {
  return (
    <div className={`rounded-2xl px-5 py-4 ${tone}`}>
      <p className={`text-3xl font-black tracking-tight ${valueClass}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground outline-none focus:border-foreground/30"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function DayBlock({
  date,
  shifts,
  onShare,
  copied,
}: {
  date: string;
  shifts: ShiftHistory[];
  onShare: (date: string, slot: Slot) => void;
  copied: string | null;
}) {
  const d = new Date(date + "T00:00:00");
  const weekday = d.toLocaleDateString(undefined, { weekday: "long" });
  const dayNum = d.toLocaleDateString(undefined, { day: "2-digit" });
  const short = d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div>
      <div className="mb-2 flex items-center gap-3 px-1">
        <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-muted/50 py-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            {weekday.slice(0, 3)}
          </span>
          <span className="text-xl font-black tabular-nums text-foreground">{dayNum}</span>
        </div>
        <p className="text-sm font-semibold text-foreground">{short}</p>
      </div>
      <ul className="space-y-2 border-l-2 border-dashed border-border pl-4">
        {shifts.map((sh) => (
          <ShiftRow
            key={sh.slot}
            sh={sh}
            onShare={() => onShare(date, sh.slot)}
            copied={copied === `${date}:${sh.slot}`}
          />
        ))}
      </ul>
    </div>
  );
}

function ShiftRow({
  sh,
  onShare,
  copied,
}: {
  sh: ShiftHistory;
  onShare: () => void;
  copied: boolean;
}) {
  const pct = sh.totalItems ? Math.round((sh.checkedItems / sh.totalItems) * 100) : 0;
  const Icon = SLOT_ICON[sh.slot];

  return (
    <li className="relative">
      <span className="absolute -left-[22px] top-1/2 grid h-4 w-4 -translate-y-1/2 place-items-center rounded-full border-2 border-background bg-foreground/70" />
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
        <Link
          to="/history/shift"
          search={{ date: sh.date, shift: sh.slot }}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted/60">
            <Icon className="h-4 w-4 text-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <p className="text-sm font-bold tracking-tight">{SLOT_LABEL[sh.slot]}</p>
              {sh.member && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-foreground">
                  <User className="h-3 w-3" />
                  {sh.member}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {sh.stationsTouched} station {sh.stationsTouched === 1 ? "check" : "checks"} ·{" "}
              {sh.checkedItems}/{sh.totalItems} items
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px]">
              {sh.stationsComplete > 0 && (
                <span className="inline-flex items-center gap-1 font-medium text-success">
                  <CheckCircle2 className="h-3 w-3" />
                  {sh.stationsComplete} complete
                </span>
              )}
              {sh.flagged > 0 && (
                <span className="inline-flex items-center gap-1 font-medium text-danger">
                  <AlertTriangle className="h-3 w-3" />
                  {sh.flagged} flagged
                </span>
              )}
            </div>
          </div>
          <div className="hidden w-32 sm:block">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: "var(--gradient-readiness)" }}
              />
            </div>
            <p className="mt-1 text-right text-[10px] font-semibold tabular-nums text-muted-foreground">
              {pct}%
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
        <Link
          to="/"
          search={{ date: sh.date, shift: sh.slot }}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Reopen this shift"
          title="Reopen this shift"
        >
          <Edit3 className="h-4 w-4" />
        </Link>
        <button
          onClick={onShare}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Copy share link"
          title={copied ? "Link copied!" : "Copy share link"}
        >
          {copied ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
        </button>
      </div>
    </li>
  );
}

function ClearHistoryModal({
  onClose,
  onCleared,
}: {
  onClose: () => void;
  onCleared: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (password !== "DELETE") {
        setError('Type DELETE (all caps) to confirm.');
        setBusy(false);
        return;
      }
      const removed = clearAllHistory();
      setDone(removed);
      onCleared();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-danger-soft text-danger">
            <Trash2 className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold tracking-tight">Clear all history?</h3>
            <p className="text-xs text-muted-foreground">
              This permanently deletes every recorded line check on this device.
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {done !== null ? (
          <div className="rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
            Cleared {done} record{done === 1 ? "" : "s"}.
            <button
              onClick={onClose}
              className="mt-3 w-full rounded-full bg-foreground py-2 text-xs font-semibold text-background"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Type <span className="font-mono text-danger">DELETE</span> to confirm
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                autoFocus
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="DELETE"
                className="w-full rounded-full border border-border bg-background py-2.5 pl-9 pr-4 text-sm font-mono tracking-widest outline-none focus:border-foreground/30"
                required
              />
            </div>
            {error && (
              <p className="text-xs font-semibold text-danger">{error}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full border border-border bg-background py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || password !== "DELETE"}
                className="flex-1 rounded-full bg-danger py-2 text-xs font-semibold text-white shadow-sm transition-opacity disabled:opacity-50"
              >
                {busy ? "Clearing…" : "Clear history"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
