// Client-side persistence for the Event Planner and Incident Reporting modules.
// Demo-grade store backed by localStorage with a tiny pub/sub so panels stay in sync.
import { useEffect, useState } from "react";
import type { EventType, Venue } from "./gridmind";

export interface PlannedEvent {
  id: string;
  type: EventType;
  venueId: string;
  /** Resolved Bengaluru location (from area search). */
  location?: Venue;
  attendees: number;
  hour: number;
  durationHr: number;
  planned: boolean;
  date: string; // yyyy-mm-dd
  title: string;
  status: "Scheduled" | "Active" | "Completed";
  createdAt: number;
  // Post-event feedback (drives the "learning" loop shown on the planner).
  actualDelayMin?: number;
  actualOfficers?: number;
  outcome?: "Successful" | "Partial" | "Strained";
  lesson?: string;
  predictedDelayMin?: number;
  modelUpdated?: boolean;
}

export type IncidentKind =
  | "Accident"
  | "Breakdown"
  | "Signal Failure"
  | "Waterlogging"
  | "Road Block"
  | "VIP Movement"
  | "Crowd Surge";

export type IncidentSeverity = "Low" | "Medium" | "High" | "Critical";

export interface Incident {
  id: string;
  kind: IncidentKind;
  severity: IncidentSeverity;
  location: string;
  description: string;
  reporter: string;
  status: "Open" | "Dispatched" | "Resolved";
  createdAt: number;
  // Post-incident feedback
  actualDelayMin?: number;
  actualOfficers?: number;
  outcome?: "Successful" | "Partial" | "Strained";
  lesson?: string;
  predictedDelayMin?: number;
  modelUpdated?: boolean;
}

const EVENTS_KEY = "gridmind.events.v1";
const INCIDENTS_KEY = "gridmind.incidents.v1";

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "[]") as T[];
  } catch {
    return [];
  }
}

function write<T>(key: string, value: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(`store:${key}`));
}

function useStore<T>(key: string): [T[], (next: T[]) => void] {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    setItems(read<T>(key));
    const handler = () => setItems(read<T>(key));
    window.addEventListener(`store:${key}`, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(`store:${key}`, handler);
      window.removeEventListener("storage", handler);
    };
  }, [key]);
  return [items, (next: T[]) => write(key, next)];
}

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

export function useEvents() {
  const [events, setEvents] = useStore<PlannedEvent>(EVENTS_KEY);
  return {
    events: [...events].sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour),
    addEvent: (e: PlannedEvent) => setEvents([...events, e]),
    updateEvent: (id: string, patch: Partial<PlannedEvent>) =>
      setEvents(events.map((x) => (x.id === id ? { ...x, ...patch } : x))),
    removeEvent: (id: string) => setEvents(events.filter((x) => x.id !== id)),
  };
}

export function useIncidents() {
  const [incidents, setIncidents] = useStore<Incident>(INCIDENTS_KEY);
  return {
    incidents: [...incidents].sort((a, b) => b.createdAt - a.createdAt),
    addIncident: (i: Incident) => setIncidents([...incidents, i]),
    updateIncident: (id: string, patch: Partial<Incident>) =>
      setIncidents(incidents.map((x) => (x.id === id ? { ...x, ...patch } : x))),
    removeIncident: (id: string) => setIncidents(incidents.filter((x) => x.id !== id)),
  };
}
