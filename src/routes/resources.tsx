import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  PackageOpen, ShieldAlert, Cone, Truck, Ambulance, AlertTriangle, CheckCircle2,
  CalendarClock, Building2, ArrowRight,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { VENUES, STATIONS, predict, fmtHour } from "@/lib/gridmind";
import { useEvents } from "@/lib/store";

export const Route = createFileRoute("/resources")({
  head: () => ({
    meta: [
      { title: "Resource Exhaustion Predictor — GridMind AI" },
      { name: "description", content: "Forecast officer, barricade and tow-truck shortages across all upcoming Bengaluru events before they begin, and see which stations to request backup from." },
    ],
  }),
  component: ResourcesPage,
});

// City-wide equipment pools (officers come from station rosters).
const CITY_POOL = { barricades: 90, towTrucks: 8, ambulances: 6 };
const TOTAL_OFFICERS = STATIONS.reduce((s, x) => s + x.officersAvailable, 0);

function ResourcesPage() {
  const { events } = useEvents();
  const upcoming = events.filter((e) => e.status !== "Completed");

  const forecast = useMemo(() => {
    let officers = 0, barricades = 0, towTrucks = 0, ambulances = 0;
    const rows = upcoming.map((e) => {
      const p = predict(e);
      officers += p.resources.officers;
      barricades += p.resources.barricades;
      towTrucks += p.resources.towTrucks;
      ambulances += p.resources.ambulances;
      const venue = VENUES.find((v) => v.id === e.venueId);
      return { e, p, venueName: e.location?.name ?? venue?.name ?? e.venueId };
    });
    return { officers, barricades, towTrucks, ambulances, rows };
  }, [upcoming]);

  const items = [
    { id: "officers", label: "Officers", icon: <ShieldAlert className="size-4" />, need: forecast.officers, have: TOTAL_OFFICERS },
    { id: "barricades", label: "Barricades", icon: <Cone className="size-4" />, need: forecast.barricades, have: CITY_POOL.barricades },
    { id: "towTrucks", label: "Tow trucks", icon: <Truck className="size-4" />, need: forecast.towTrucks, have: CITY_POOL.towTrucks },
    { id: "ambulances", label: "Ambulances", icon: <Ambulance className="size-4" />, need: forecast.ambulances, have: CITY_POOL.ambulances },
  ];

  const shortages = items.filter((i) => i.need > i.have);

  return (
    <div className="min-h-screen grid-bg">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-6 md:px-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-warning/15 text-warning"><PackageOpen className="size-5" /></div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Resource Exhaustion Predictor</h1>
            <p className="text-xs text-muted-foreground">Forecasts combined demand from every upcoming event against citywide capacity — before crews are committed.</p>
          </div>
        </div>

        {upcoming.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border panel-glass p-10 text-center text-sm text-muted-foreground">
            No upcoming events scheduled. Add events on the{" "}
            <Link to="/planner" className="font-semibold text-primary underline-offset-2 hover:underline">Event Planner</Link>{" "}
            to forecast resource demand.
          </div>
        ) : (
          <>
            {shortages.length > 0 ? (
              <div className="mb-6 rounded-2xl border border-critical/40 bg-critical/10 p-5">
                <div className="flex items-center gap-2 text-critical">
                  <AlertTriangle className="size-5" />
                  <h2 className="text-sm font-bold uppercase tracking-wide">Resource shortage expected</h2>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {shortages.map((s) => (
                    <span key={s.id} className="rounded-lg border border-critical/40 bg-critical/15 px-3 py-1.5 text-xs font-bold text-critical">
                      {s.need - s.have} {s.label.toLowerCase()} missing
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-foreground/90">
                  Request backup from neighbouring stations / city reserve before the first event begins.
                </p>
              </div>
            ) : (
              <div className="mb-6 flex items-center gap-2 rounded-2xl border border-success/40 bg-success/10 px-5 py-4 text-sm text-success">
                <CheckCircle2 className="size-5" /> Capacity covers all {upcoming.length} upcoming event(s) — no shortages forecast.
              </div>
            )}

            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {items.map((i) => <CapacityCard key={i.id} {...i} />)}
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <div className="rounded-2xl border border-border panel-glass p-5">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                  <CalendarClock className="size-4" /> Demand by event
                </h2>
                <div className="space-y-2">
                  {forecast.rows.map(({ e, p, venueName }) => (
                    <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-input/30 p-3">
                      <div>
                        <p className="text-sm font-bold">{e.title}</p>
                        <p className="text-[11px] text-muted-foreground">{venueName} · {e.date} · {fmtHour(e.hour)} · {e.attendees.toLocaleString()} ppl</p>
                      </div>
                      <div className="flex items-center gap-3 text-mono text-xs">
                        <span className="flex items-center gap-1"><ShieldAlert className="size-3 text-warning" />{p.resources.officers}</span>
                        <span className="flex items-center gap-1"><Cone className="size-3 text-info" />{p.resources.barricades}</span>
                        <span className="flex items-center gap-1"><Truck className="size-3 text-muted-foreground" />{p.resources.towTrucks}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="h-fit rounded-2xl border border-border panel-glass p-5">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                  <Building2 className="size-4" /> Officer pool by station
                </h2>
                <div className="space-y-2">
                  {STATIONS.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border border-border bg-input/30 px-3 py-2 text-xs">
                      <span className="font-semibold">{s.name}</span>
                      <span className="text-mono text-muted-foreground">{s.officersAvailable} avail · {s.responseMin}m ETA</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-bold text-primary">
                    <span>Total available</span>
                    <span className="text-mono">{TOTAL_OFFICERS} officers</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function CapacityCard({ label, icon, need, have }: { label: string; icon: React.ReactNode; need: number; have: number }) {
  const pct = Math.min(100, Math.round((need / Math.max(have, 1)) * 100));
  const short = need > have;
  const color = pct >= 100 ? "var(--critical)" : pct >= 80 ? "var(--warning)" : "var(--success)";
  return (
    <div className="rounded-2xl border border-border panel-glass p-4">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">{icon}<span className="text-[10px] uppercase tracking-wide">{label}</span></div>
      <p className="text-mono text-2xl font-bold">
        {need}<span className="text-sm font-normal text-muted-foreground"> / {have}</span>
      </p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-input/60">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className={`mt-1.5 text-[11px] font-semibold ${short ? "text-critical" : "text-muted-foreground"}`}>
        {short ? `${need - have} short` : `${have - need} spare`}
      </p>
    </div>
  );
}
