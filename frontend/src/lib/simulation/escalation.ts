// Smart Escalation Engine — derives priority + recommended response from
// incident severity, how long it has been open, and nearby clustering.
import type { Incident, IncidentSeverity } from "@/store/store";

export type EscalationLevel = "Routine" | "Elevated" | "High Priority" | "Critical";

export interface Escalation {
  level: EscalationLevel;
  score: number; // 0-100 urgency
  reasons: string[];
  ageMin: number;
  nearbyCount: number;
  recommend: { officers: number; towTrucks: number; ambulances: number };
}

const SEV_BASE: Record<IncidentSeverity, number> = {
  Low: 18,
  Medium: 38,
  High: 60,
  Critical: 82,
};

// Crude location proximity: shared first significant token (e.g. "Hebbal").
function locationKey(loc: string): string {
  return (
    loc
      .trim()
      .toLowerCase()
      .split(/[\s,]+/)[0] ?? ""
  );
}

export function computeEscalation(
  incident: Incident,
  all: Incident[],
  now = Date.now(),
): Escalation {
  const ageMin = Math.max(0, Math.floor((now - incident.createdAt) / 60000));
  const key = locationKey(incident.location);
  const nearby = all.filter(
    (i) =>
      i.id !== incident.id &&
      i.status !== "Resolved" &&
      locationKey(i.location) === key &&
      key !== "",
  );
  const nearbyCount = nearby.length;

  let score = SEV_BASE[incident.severity];
  const reasons: string[] = [`${incident.severity} severity ${incident.kind.toLowerCase()}`];

  // Time pressure — unresolved incidents escalate as they age.
  if (incident.status !== "Resolved") {
    if (ageMin >= 25) {
      score += 22;
      reasons.push(`Unresolved for ${ageMin} min`);
    } else if (ageMin >= 10) {
      score += 12;
      reasons.push(`Open for ${ageMin} min`);
    }
  }

  // Clustering — multiple incidents in the same corridor compound risk.
  if (nearbyCount >= 1) {
    score += 10 + nearbyCount * 8;
    reasons.push(`${nearbyCount} more incident(s) nearby — congestion spreading`);
  }

  // Dispatched units relieve some pressure.
  if (incident.status === "Dispatched") {
    score -= 10;
    reasons.push("Unit dispatched");
  }

  score = Math.max(5, Math.min(100, score));

  let level: EscalationLevel = "Routine";
  if (score >= 80) level = "Critical";
  else if (score >= 60) level = "High Priority";
  else if (score >= 40) level = "Elevated";

  const intensity = score / 100;
  const recommend = {
    officers: Math.max(2, Math.round(2 + intensity * 8 + nearbyCount * 2)),
    towTrucks:
      incident.kind === "Breakdown" || incident.kind === "Accident"
        ? Math.max(1, Math.round(intensity * 2))
        : 0,
    ambulances: incident.kind === "Accident" || incident.severity === "Critical" ? 1 : 0,
  };

  return { level, score, reasons, ageMin, nearbyCount, recommend };
}

export const ESCALATION_STYLE: Record<EscalationLevel, string> = {
  Routine: "border-success/40 bg-success/10 text-success",
  Elevated: "border-info/40 bg-info/10 text-info",
  "High Priority": "border-warning/40 bg-warning/10 text-warning",
  Critical: "border-critical/40 bg-critical/10 text-critical",
};
