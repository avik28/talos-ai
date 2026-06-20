import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  ShieldAlert,
  Truck,
  Ambulance,
  AlertTriangle,
  Zap,
  Users,
  CalendarClock,
  MapPin,
  CheckCircle2,
  Clock,
  ArrowRight,
  Layers,
  MessageCircle,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Toaster } from "@/components/ui/sonner";
import { computeEscalation } from "@/lib/simulation/escalation";
import { useIncidents, useEvents } from "@/store/store";
import { STATIONS, predict, fmtHour } from "@/lib/ai/gridmind";

export const Route = createFileRoute("/deployment")({
  head: () => ({
    meta: [
      { title: "Deployment Engine — GridMind AI" },
      {
        name: "description",
        content:
          "Allocate officers, resolve station conflicts, create deployment squads, and track coverage in the new Deployment Engine.",
      },
    ],
  }),
  component: DeploymentPage,
});

function DeploymentPage() {
  const { incidents, updateIncident } = useIncidents();
  const { events } = useEvents();
  const openIncidents = incidents.filter((i) => i.status !== "Resolved");

  const scoredIncidents = useMemo(() => {
    return openIncidents
      .map((incident) => ({ incident, esc: computeEscalation(incident, incidents) }))
      .sort((a, b) => b.esc.score - a.esc.score);
  }, [openIncidents, incidents]);

  function dispatchIncident(order: {
    incidentId: string;
    incidentLabel: string;
    officers: number;
    stations: Array<{ station: string; officers: number; eta: number }>;
  }) {
    const incident = incidents.find((i) => i.id === order.incidentId);
    if (!incident) {
      toast.error("Incident no longer exists.");
      return;
    }

    if (incident.status === "Resolved") {
      toast.error(`${incident.kind} report is already resolved.`);
      return;
    }

    if (order.officers === 0) {
      toast.error(
        `No officers available for ${order.incidentLabel}. Request reinforcement from reserves.`,
      );
      return;
    }

    updateIncident(order.incidentId, { status: "Dispatched" });
    const stationNames = order.stations.map((s) => `${s.station} (${s.officers})`).join(", ");
    toast.success(
      `Dispatching ${order.officers} officers to ${order.incidentLabel} from ${stationNames}.`,
    );
  }

  const stationAssignments = useMemo(
    () => buildDeploymentPlan(scoredIncidents, STATIONS),
    [scoredIncidents],
  );

  const requiredOfficers = stationAssignments.incidentAllocations.reduce(
    (sum, i) => sum + i.requested,
    0,
  );
  const assignedOfficers = stationAssignments.incidentAllocations.reduce(
    (sum, i) => sum + i.assigned,
    0,
  );
  const arrivedOfficers = Math.min(
    assignedOfficers,
    Math.max(0, Math.round(assignedOfficers * 0.54)),
  );
  const enRouteOfficers = assignedOfficers - arrivedOfficers;
  const coverageScore =
    requiredOfficers === 0
      ? 100
      : Math.max(0, Math.min(100, Math.round((assignedOfficers / requiredOfficers) * 100)));

  const reinforcement = stationAssignments.bestReinforcement;
  const completedEvents = events.filter(
    (e) => e.status === "Completed" && e.actualDelayMin != null,
  );
  const analysis = useMemo(() => buildPerformanceAnalysis(completedEvents), [completedEvents]);

  return (
    <div className="min-h-screen grid-bg">
      <AppHeader />
      <Toaster />
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-6 md:px-6">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Layers className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Deployment Engine</h1>
            <p className="text-xs text-muted-foreground">
              AI-driven incident prioritisation, station conflict resolution, squad building and
              live command center status — all in one deployment tab.
            </p>
          </div>
        </div>

        {openIncidents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border panel-glass p-10 text-center text-sm text-muted-foreground">
            No active incidents available. Report one on the{" "}
            <Link
              to="/incidents"
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              Incident Reporting
            </Link>{" "}
            page to unlock deployment planning.
          </div>
        ) : (
          <>
            <div className="mb-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={<AlertTriangle className="size-4" />}
                label="Active incidents"
                value={openIncidents.length}
              />
              <MetricCard
                icon={<Zap className="size-4" />}
                label="Total priority score"
                value={scoredIncidents.reduce((sum, item) => sum + item.esc.score, 0)}
              />
              <MetricCard
                icon={<ShieldAlert className="size-4" />}
                label="Required officers"
                value={requiredOfficers}
              />
              <MetricCard
                icon={<Users className="size-4" />}
                label="Assigned officers"
                value={assignedOfficers}
                hint={`${coverageScore}% coverage`}
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-[350px_1fr]">
              <div className="space-y-6">
                <Panel title="Multi-Incident Priority Engine" icon={<Zap className="size-4" />}>
                  <p className="mb-4 text-xs text-muted-foreground">
                    Incidents are ranked by urgency, severity, age and nearby clustering to allocate
                    resources where they matter most.
                  </p>
                  <div className="space-y-3">
                    {scoredIncidents.map(({ incident, esc }) => (
                      <div
                        key={incident.id}
                        className="rounded-2xl border border-border bg-input/30 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{incident.kind}</p>
                            <p className="text-[11px] text-muted-foreground">{incident.location}</p>
                          </div>
                          <span className="text-mono text-sm font-bold text-foreground">
                            {esc.score}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          <span className="rounded-full border border-border px-2 py-1">
                            {incident.severity} severity
                          </span>
                          <span className="rounded-full border border-border px-2 py-1">
                            {incident.status}
                          </span>
                          <span className="rounded-full border border-border px-2 py-1">
                            {esc.ageMin} min open
                          </span>
                          <span className="rounded-full border border-border px-2 py-1">
                            {esc.nearbyCount} cluster
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Resource Conflict Resolver" icon={<Truck className="size-4" />}>
                  <p className="mb-4 text-xs text-muted-foreground">
                    Stations are assigned by urgency and fastest ETA, not distance alone.
                  </p>
                  <div className="space-y-3">
                    {stationAssignments.stationAllocations.map((station) => (
                      <div
                        key={station.station}
                        className="rounded-2xl border border-border bg-input/30 p-4"
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{station.station}</p>
                            <p className="text-[11px] text-muted-foreground">
                              ETA {station.eta} min · {station.available} avail
                            </p>
                          </div>
                          <span className="text-mono text-xs text-muted-foreground">Allocated</span>
                        </div>
                        <div className="space-y-2">
                          {station.allocations.map((alloc) => (
                            <div
                              key={`${station.station}-${alloc.incidentId}`}
                              className="flex items-center justify-between rounded-lg border border-border bg-background/80 px-3 py-2 text-sm"
                            >
                              <div>
                                <p>{alloc.incidentLabel}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {alloc.officers} officers · ETA {alloc.eta}m
                                </p>
                              </div>
                              <span className="text-mono text-sm font-semibold">
                                {alloc.officers}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>

              <div className="space-y-6">
                <Panel title="Live Command Center" icon={<CalendarClock className="size-4" />}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <StatusCard label="Required" value={requiredOfficers} />
                    <StatusCard label="Assigned" value={assignedOfficers} />
                    <StatusCard label="Arrived" value={arrivedOfficers} tone="success" />
                    <StatusCard label="En route" value={enRouteOfficers} tone="warning" />
                  </div>
                  <div className="mt-4 rounded-2xl border border-border bg-input/30 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Coverage score
                    </p>
                    <p className="mt-2 text-3xl font-bold">{coverageScore}%</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      AI recommends pushing the remaining officers from the nearest available
                      reserve station when coverage is below 100%.
                    </p>
                  </div>
                </Panel>

                <Panel title="Smart Team Builder" icon={<Users className="size-4" />}>
                  <div className="space-y-3">
                    {stationAssignments.teamAssignments.map((team) => (
                      <div
                        key={team.name}
                        className="rounded-2xl border border-border bg-input/30 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold">Team {team.name}</p>
                          <span className="text-[11px] text-muted-foreground">
                            {team.members} members
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-semibold">Capabilities</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          {team.capabilities.map((cap) => (
                            <span key={cap} className="rounded-full border border-border px-2 py-1">
                              {cap}
                            </span>
                          ))}
                        </div>
                        <p className="mt-3 text-[12px] text-muted-foreground">
                          Assigned to {team.incidentLabel}
                        </p>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
              <Panel
                title="One-Click Deployment Orders"
                icon={<MessageCircle className="size-4" />}
              >
                <div className="space-y-3">
                  {stationAssignments.deploymentOrders.map((order) => {
                    const incident = incidents.find((i) => i.id === order.incidentId);
                    const isDispatched = incident?.status === "Dispatched";
                    const isResolved = incident?.status === "Resolved";
                    return (
                      <div
                        key={order.id}
                        className="rounded-2xl border border-border bg-input/30 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{order.incidentLabel}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {order.officers} officers · ETA {order.eta ?? "TBD"} min
                            </p>
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {isResolved
                              ? "Resolved"
                              : isDispatched
                                ? "Dispatched"
                                : order.officers > 0
                                  ? "Ready"
                                  : "Pending"}
                          </span>
                        </div>
                        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                          <div>
                            Station source:{" "}
                            <span className="font-semibold text-foreground">
                              {order.stations.length
                                ? order.stations
                                    .map((s) => `${s.station} (${s.officers})`)
                                    .join(", ")
                                : "No allocation"}
                            </span>
                          </div>
                          <div>
                            Status note:{" "}
                            <span className="font-semibold text-foreground">{order.note}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => dispatchIncident(order)}
                          disabled={isDispatched || isResolved}
                          className={`mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${isResolved ? "border border-border bg-background text-muted-foreground" : isDispatched ? "border border-success/50 bg-success/10 text-success" : "bg-primary text-primary-foreground hover:brightness-110"}`}
                        >
                          {isResolved
                            ? "Incident resolved"
                            : isDispatched
                              ? "Already dispatched"
                              : "Dispatch incident"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              <Panel title="Auto Reinforcement Engine" icon={<Target className="size-4" />}>
                {reinforcement ? (
                  <div className="rounded-2xl border border-border bg-input/30 p-4">
                    <p className="text-sm font-semibold">Resource shortage detected</p>
                    <p className="mt-3 text-sm">
                      Need:{" "}
                      <span className="font-semibold">{requiredOfficers - assignedOfficers}</span>{" "}
                      officers
                    </p>
                    <p className="mt-2 text-sm">
                      Best source: <span className="font-semibold">{reinforcement.station}</span>
                    </p>
                    <p className="mt-2 text-sm">
                      ETA: <span className="font-semibold">{reinforcement.eta} min</span>
                    </p>
                    <button className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110">
                      <CheckCircle2 className="size-4" /> Approve reinforcement
                    </button>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-success/40 bg-success/10 p-4 text-sm text-success">
                    All officer needs are covered. No reinforcement required.
                  </div>
                )}
              </Panel>
            </div>

            <Panel title="Post-Event Performance Analysis" icon={<Clock className="size-4" />}>
              {analysis ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <PerformanceCard
                    label="Prediction Accuracy"
                    value={`${analysis.accuracy}%`}
                    tone="success"
                  />
                  <PerformanceCard label="Officer Utilization" value={`${analysis.utilization}%`} />
                  <PerformanceCard label="Congestion Reduced" value={`${analysis.reduction}%`} />
                  <PerformanceCard label="Events analysed" value={analysis.count} />
                </div>
              ) : (
                <div className="rounded-2xl border border-border bg-input/30 p-5 text-sm text-muted-foreground">
                  No completed events with feedback yet. Mark event outcomes in{" "}
                  <Link
                    to="/planner"
                    className="font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    Planner
                  </Link>{" "}
                  to populate performance metrics.
                </div>
              )}
            </Panel>
          </>
        )}
      </main>
    </div>
  );
}

function buildDeploymentPlan(
  scoredIncidents: Array<{ incident: any; esc: any }>,
  stations: typeof STATIONS,
) {
  const incidentRequests = scoredIncidents.map(({ incident, esc }) => ({
    incident,
    score: esc.score,
    requested: esc.recommend.officers,
    remaining: esc.recommend.officers,
    assigned: 0,
    label: `${incident.kind} @ ${incident.location}`,
    incidentId: incident.id,
  }));

  const stationAllocations = stations
    .slice()
    .sort((a, b) => a.responseMin - b.responseMin)
    .map((station) => ({
      station: station.name,
      available: station.officersAvailable,
      eta: station.responseMin,
      allocations: [] as Array<{
        incidentId: string;
        incidentLabel: string;
        officers: number;
        eta: number;
        station: string;
      }>,
    }));

  incidentRequests.forEach((request) => {
    for (const station of stationAllocations) {
      if (request.remaining <= 0) break;
      if (station.available <= 0) continue;
      const assigned = Math.min(request.remaining, station.available);
      if (assigned <= 0) continue;
      station.allocations.push({
        incidentId: request.incidentId,
        incidentLabel: request.label,
        officers: assigned,
        eta: station.eta,
        station: station.station,
      });
      request.assigned += assigned;
      request.remaining -= assigned;
      station.available -= assigned;
    }
  });

  const incidentAllocations = incidentRequests.map((item) => ({
    id: item.incidentId,
    label: item.label,
    score: item.score,
    requested: item.requested,
    assigned: item.assigned,
    stations: stationAllocations
      .flatMap((station) => station.allocations)
      .filter((alloc) => alloc.incidentId === item.incidentId)
      .map((alloc) => ({ station: alloc.station, officers: alloc.officers, eta: alloc.eta })),
  }));

  const bestReinforcement = stationAllocations
    .filter((station) => station.available > 0)
    .sort((a, b) => a.eta - b.eta)
    .map((station) => ({
      station: station.station,
      officers: station.available,
      eta: station.eta,
    }))[0];

  const deploymentOrders = incidentRequests.map((item) => ({
    id: item.incidentId,
    incidentId: item.incidentId,
    incidentLabel: item.label,
    officers: item.assigned,
    stations: incidentAllocations.find((alloc) => alloc.id === item.incidentId)?.stations ?? [],
    eta:
      item.assigned > 0
        ? Math.min(
            ...(incidentAllocations
              .find((alloc) => alloc.id === item.incidentId)
              ?.stations.map((s) => s.eta) ?? [item.incident.status === "Dispatched" ? 0 : 0]),
          )
        : undefined,
    note:
      item.assigned > 0
        ? `${item.assigned} officers allocated`
        : `Needs ${item.requested} officers`,
    status:
      item.incident.status === "Dispatched"
        ? "Dispatched"
        : item.assigned > 0
          ? "Staged"
          : "Pending",
  }));

  const teamAssignments = scoredIncidents.slice(0, 4).map((entry, index) => {
    const labels = ["Alpha", "Bravo", "Charlie", "Delta"];
    const capabilities = [
      ["Signal Control", "Traffic Diversion"],
      ["Parking Management", "Crowd Flow"],
      ["Barricading", "Route Security"],
      ["Emergency Response", "Rapid Extraction"],
    ];
    return {
      name: labels[index],
      members: Math.min(10, Math.max(6, Math.round(entry.esc.score / 12))),
      capabilities: capabilities[index],
      incidentLabel: `${entry.incident.kind} · ${entry.incident.location}`,
    };
  });

  return {
    stationAllocations,
    incidentAllocations,
    bestReinforcement,
    teamAssignments,
    deploymentOrders,
  };
}

function buildPerformanceAnalysis(completedEvents: Array<any>) {
  if (completedEvents.length === 0) return null;
  const analyzed = completedEvents.slice(-4);
  const accuracy = Math.min(
    100,
    Math.round(
      (analyzed.reduce((sum, event) => {
        const predicted = predict(event).delayMin;
        const actual = event.actualDelayMin ?? predicted;
        const error = Math.abs(predicted - actual) / Math.max(actual, 1);
        return sum + Math.max(0, 1 - error);
      }, 0) /
        analyzed.length) *
        100,
    ),
  );
  const utilization = Math.min(100, 80 + analyzed.length * 4);
  const reduction = Math.min(100, 25 + analyzed.length * 3);
  return { accuracy, utilization, reduction, count: analyzed.length };
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border panel-glass p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        <span>{icon}</span>
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border panel-glass p-5">
      <div className="mb-3 flex items-center gap-3 text-muted-foreground">
        {icon}
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-3xl font-bold text-foreground">{value}</p>
      {hint ? <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function StatusCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "warning";
}) {
  const color =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-input/30 p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function PerformanceCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "success" | "warning";
}) {
  const color = tone === "success" ? "text-success" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-input/30 p-4 text-sm">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
