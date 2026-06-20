import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  PackageOpen,
  ShieldAlert,
  Cone,
  Truck,
  Ambulance,
  AlertTriangle,
  CheckCircle2,
  CalendarClock,
  Building2,
  ArrowRight,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { VENUES, STATIONS, predict, fmtHour } from "@/lib/ai/gridmind";
import { useEvents, type PlannedEvent } from "@/store/store";

export const Route = createFileRoute("/resources")({
  head: () => ({
    meta: [
      { title: "Resource Exhaustion Predictor — GridMind AI" },
      {
        name: "description",
        content:
          "Forecast officer, barricade and tow-truck shortages across all upcoming Bengaluru events before they begin, and see which stations to request backup from.",
      },
    ],
  }),
  component: ResourcesPage,
});

// City-wide equipment pools (officers come from station rosters).
const CITY_POOL = { barricades: 90, towTrucks: 8, ambulances: 6 };
const TOTAL_OFFICERS = STATIONS.reduce((s, x) => s + x.officersAvailable, 0);

function eventResourceProfile(event: PlannedEvent) {
  const load = Math.min(event.attendees / 35000, 1);
  const profile = {
    officers: 8 + Math.round(load * 24) + (event.planned ? 0 : 4),
    barricades: 4 + Math.round(load * 10),
    towTrucks: 1,
    ambulances: 1,
    note: "Standard event support",
  };

  const type = event.type;
  if (["Cricket Match", "Football Match", "Concert", "Music Festival", "Festival"].includes(type)) {
    profile.officers += 4;
    profile.barricades += 3;
  }
  if (["Political Rally", "Protest", "Religious Procession"].includes(type)) {
    profile.officers += 5;
    profile.barricades += 4;
    profile.ambulances += 1;
    profile.note = "Crowd control + medical standby";
  }
  if (["VIP Movement", "State Function", "Film Premiere"].includes(type)) {
    profile.officers += 7;
    profile.barricades += 2;
    profile.note = "High security escort";
  }
  if (["Roadwork / Diversion", "Marathon", "Cycling Event", "Strike / Bandh"].includes(type)) {
    profile.towTrucks = 2;
    profile.barricades += 3;
    profile.note = "Route management + vehicle support";
  }
  if (type === "Wedding / Convention") {
    profile.barricades += 2;
    profile.note = "Private access control";
  }

  return profile;
}

function ResourcesPage() {
  const { events } = useEvents();
  const upcoming = events.filter((e) => e.status !== "Completed");

  const forecast = useMemo(() => {
    let officers = 0,
      barricades = 0,
      towTrucks = 0,
      ambulances = 0;
    const rows = upcoming.map((e) => {
      const p = predict(e);
      const extra = eventResourceProfile(e);
      const eventOfficers = Math.max(p.resources.officers, extra.officers);
      const eventBarricades = Math.max(p.resources.barricades, extra.barricades);
      const eventTowTrucks = Math.max(p.resources.towTrucks, extra.towTrucks);
      const eventAmbulances = Math.max(p.resources.ambulances, extra.ambulances);

      officers += eventOfficers;
      barricades += eventBarricades;
      towTrucks += eventTowTrucks;
      ambulances += eventAmbulances;

      const venue = VENUES.find((v) => v.id === e.venueId);
      return {
        e,
        p,
        adjusted: {
          officers: eventOfficers,
          barricades: eventBarricades,
          towTrucks: eventTowTrucks,
          ambulances: eventAmbulances,
          note: extra.note,
        },
        venueName: e.location?.name ?? venue?.name ?? e.venueId,
      };
    });
    return { officers, barricades, towTrucks, ambulances, rows };
  }, [upcoming]);

  const items = [
    {
      id: "officers",
      label: "Officers",
      icon: <ShieldAlert className="size-4" />,
      need: forecast.officers,
      have: TOTAL_OFFICERS,
    },
    {
      id: "barricades",
      label: "Barricades",
      icon: <Cone className="size-4" />,
      need: forecast.barricades,
      have: CITY_POOL.barricades,
    },
    {
      id: "towTrucks",
      label: "Tow trucks",
      icon: <Truck className="size-4" />,
      need: forecast.towTrucks,
      have: CITY_POOL.towTrucks,
    },
    {
      id: "ambulances",
      label: "Ambulances",
      icon: <Ambulance className="size-4" />,
      need: forecast.ambulances,
      have: CITY_POOL.ambulances,
    },
  ];

  const shortages = items.filter((i) => i.need > i.have);
  const specialDemand = forecast.rows.filter(
    (row) => row.adjusted.note !== "Standard event support",
  );

  return (
    <div className="min-h-screen grid-bg">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-6 md:px-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-warning/15 text-warning">
            <PackageOpen className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Resource Exhaustion Predictor</h1>
            <p className="text-xs text-muted-foreground">
              Forecasts combined demand from every upcoming event against citywide capacity — before
              crews are committed.
            </p>
          </div>
        </div>

        {upcoming.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border panel-glass p-10 text-center text-sm text-muted-foreground">
            No upcoming events scheduled. Add events on the{" "}
            <Link
              to="/planner"
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              Event Planner
            </Link>{" "}
            to forecast resource demand.
          </div>
        ) : (
          <>
            {shortages.length > 0 ? (
              <div className="mb-6 rounded-2xl border border-critical/40 bg-critical/10 p-5">
                <div className="flex items-center gap-2 text-critical">
                  <AlertTriangle className="size-5" />
                  <h2 className="text-sm font-bold uppercase tracking-wide">
                    Resource shortage expected
                  </h2>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {shortages.map((s) => (
                    <span
                      key={s.id}
                      className="rounded-lg border border-critical/40 bg-critical/15 px-3 py-1.5 text-xs font-bold text-critical"
                    >
                      {s.need - s.have} {s.label.toLowerCase()} missing
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-foreground/90">
                  Request backup from neighbouring stations / city reserve before the first event
                  begins.
                </p>
              </div>
            ) : (
              <div className="mb-6 flex items-center gap-2 rounded-2xl border border-success/40 bg-success/10 px-5 py-4 text-sm text-success">
                <CheckCircle2 className="size-5" /> Capacity covers all {upcoming.length} upcoming
                event(s) — no shortages forecast.
              </div>
            )}

            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {items.map((i) => (
                <CapacityCard key={i.id} {...i} />
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <div className="rounded-2xl border border-border panel-glass p-5">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                  <CalendarClock className="size-4" /> Demand by event
                </h2>
                <div className="space-y-2">
                  {forecast.rows.map(({ e, p, adjusted, venueName }) => (
                    <div
                      key={e.id}
                      className="rounded-2xl border border-border bg-input/30 p-4 sm:p-5"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-bold text-slate-950">{e.title}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {venueName} · {e.date} · {fmtHour(e.hour)} ·{" "}
                            {e.attendees.toLocaleString()} ppl
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                          <span className="rounded-full bg-slate-100 px-2 py-1">{e.status}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-1">
                            {adjusted.note}
                          </span>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-4 text-mono text-xs">
                        <div className="rounded-2xl bg-white/80 p-3">
                          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                            Officers
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {adjusted.officers}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-white/80 p-3">
                          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                            Barricades
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {adjusted.barricades}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-white/80 p-3">
                          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                            Tow trucks
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {adjusted.towTrucks}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-white/80 p-3">
                          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                            Ambulances
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {adjusted.ambulances}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {specialDemand.length > 0 && (
                <div className="rounded-2xl border border-warning/40 bg-warning/10 p-5">
                  <div className="mb-4 flex items-center gap-2 text-warning">
                    <AlertTriangle className="size-4" />
                    <h2 className="text-sm font-bold uppercase tracking-wide">
                      Special demand events
                    </h2>
                  </div>
                  <div className="space-y-3">
                    {specialDemand.map(({ e, adjusted, venueName }) => (
                      <div
                        key={e.id}
                        className="rounded-2xl border border-warning/20 bg-white/90 p-4"
                      >
                        <p className="text-sm font-semibold text-slate-950">{e.title}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {venueName} · {e.date} · {fmtHour(e.hour)}
                        </p>
                        <p className="mt-3 text-[11px] text-slate-700">{adjusted.note}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-700">
                          <span className="rounded-full bg-slate-100 px-2 py-1">
                            Officers {adjusted.officers}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-1">
                            Tow trucks {adjusted.towTrucks}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-1">
                            Ambulances {adjusted.ambulances}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="h-fit rounded-2xl border border-border panel-glass p-5">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                  <Building2 className="size-4" /> Officer pool by station
                </h2>
                <div className="space-y-2">
                  {STATIONS.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-input/30 px-3 py-2 text-xs"
                    >
                      <span className="font-semibold">{s.name}</span>
                      <span className="text-mono text-muted-foreground">
                        {s.officersAvailable} avail · {s.responseMin}m ETA
                      </span>
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

function CapacityCard({
  label,
  icon,
  need,
  have,
}: {
  label: string;
  icon: React.ReactNode;
  need: number;
  have: number;
}) {
  const pct = Math.min(100, Math.round((need / Math.max(have, 1)) * 100));
  const short = need > have;
  const color = pct >= 100 ? "var(--critical)" : pct >= 80 ? "var(--warning)" : "var(--success)";
  return (
    <div className="rounded-2xl border border-border panel-glass p-4">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-mono text-2xl font-bold">
        {need}
        <span className="text-sm font-normal text-muted-foreground"> / {have}</span>
      </p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-input/60">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <p
        className={`mt-1.5 text-[11px] font-semibold ${short ? "text-critical" : "text-muted-foreground"}`}
      >
        {short ? `${need - have} short` : `${have - need} spare`}
      </p>
    </div>
  );
}
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  PackageOpen, ShieldAlert, Cone, Truck, Ambulance, AlertTriangle, CheckCircle2,
  CalendarClock, Building2, ArrowRight,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { VENUES, STATIONS, predict, fmtHour } from "@/lib/gridmind";
import { useEvents, type PlannedEvent } from "@/lib/store";

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

function eventResourceProfile(event: PlannedEvent) {
  const load = Math.min(event.attendees / 35000, 1);
  const profile = {
    officers: 8 + Math.round(load * 24) + (event.planned ? 0 : 4),
    barricades: 4 + Math.round(load * 10),
    towTrucks: 1,
    ambulances: 1,
    note: "Standard event support",
  };

  const type = event.type;
  if (["Cricket Match", "Football Match", "Concert", "Music Festival", "Festival"].includes(type)) {
    profile.officers += 4;
    profile.barricades += 3;
  }
  if (["Political Rally", "Protest", "Religious Procession"].includes(type)) {
    profile.officers += 5;
    profile.barricades += 4;
    profile.ambulances += 1;
    profile.note = "Crowd control + medical standby";
  }
  if (["VIP Movement", "State Function", "Film Premiere"].includes(type)) {
    profile.officers += 7;
    profile.barricades += 2;
    profile.note = "High security escort";
  }
  if (["Roadwork / Diversion", "Marathon", "Cycling Event", "Strike / Bandh"].includes(type)) {
    profile.towTrucks = 2;
    profile.barricades += 3;
    profile.note = "Route management + vehicle support";
  }
  if (type === "Wedding / Convention") {
    profile.barricades += 2;
    profile.note = "Private access control";
  }

  return profile;
}

function ResourcesPage() {
  const { events } = useEvents();
  const upcoming = events.filter((e) => e.status !== "Completed");

  const forecast = useMemo(() => {
    let officers = 0, barricades = 0, towTrucks = 0, ambulances = 0;
    const rows = upcoming.map((e) => {
      const p = predict(e);
      const extra = eventResourceProfile(e);
      const eventOfficers = Math.max(p.resources.officers, extra.officers);
      const eventBarricades = Math.max(p.resources.barricades, extra.barricades);
      const eventTowTrucks = Math.max(p.resources.towTrucks, extra.towTrucks);
      const eventAmbulances = Math.max(p.resources.ambulances, extra.ambulances);

      officers += eventOfficers;
      barricades += eventBarricades;
      towTrucks += eventTowTrucks;
      ambulances += eventAmbulances;

      const venue = VENUES.find((v) => v.id === e.venueId);
      return {
        e,
        p,
        adjusted: { officers: eventOfficers, barricades: eventBarricades, towTrucks: eventTowTrucks, ambulances: eventAmbulances, note: extra.note },
        venueName: e.location?.name ?? venue?.name ?? e.venueId,
      };
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
  const specialDemand = forecast.rows.filter((row) => row.adjusted.note !== "Standard event support");

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
                  {forecast.rows.map(({ e, p, adjusted, venueName }) => (
                    <div key={e.id} className="rounded-2xl border border-border bg-input/30 p-4 sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-bold text-slate-950">{e.title}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">{venueName} · {e.date} · {fmtHour(e.hour)} · {e.attendees.toLocaleString()} ppl</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                          <span className="rounded-full bg-slate-100 px-2 py-1">{e.status}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-1">{adjusted.note}</span>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-4 text-mono text-xs">
                        <div className="rounded-2xl bg-white/80 p-3">
                          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Officers</p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">{adjusted.officers}</p>
                        </div>
                        <div className="rounded-2xl bg-white/80 p-3">
                          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Barricades</p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">{adjusted.barricades}</p>
                        </div>
                        <div className="rounded-2xl bg-white/80 p-3">
                          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Tow trucks</p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">{adjusted.towTrucks}</p>
                        </div>
                        <div className="rounded-2xl bg-white/80 p-3">
                          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Ambulances</p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">{adjusted.ambulances}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {specialDemand.length > 0 && (
                <div className="rounded-2xl border border-warning/40 bg-warning/10 p-5">
                  <div className="mb-4 flex items-center gap-2 text-warning">
                    <AlertTriangle className="size-4" />
                    <h2 className="text-sm font-bold uppercase tracking-wide">Special demand events</h2>
                  </div>
                  <div className="space-y-3">
                    {specialDemand.map(({ e, adjusted, venueName }) => (
                      <div key={e.id} className="rounded-2xl border border-warning/20 bg-white/90 p-4">
                        <p className="text-sm font-semibold text-slate-950">{e.title}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{venueName} · {e.date} · {fmtHour(e.hour)}</p>
                        <p className="mt-3 text-[11px] text-slate-700">{adjusted.note}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-700">
                          <span className="rounded-full bg-slate-100 px-2 py-1">Officers {adjusted.officers}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-1">Tow trucks {adjusted.towTrucks}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-1">Ambulances {adjusted.ambulances}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
