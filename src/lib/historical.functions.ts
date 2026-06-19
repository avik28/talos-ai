import { createServerFn } from "@tanstack/react-start";
import { promises as fs } from "fs";
import { join } from "path";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  fetchSupabaseEventPlans,
  fetchSupabaseIncidents,
  fetchSupabasePoliceStations,
  type SupabaseEventPlan,
  type SupabaseIncident,
  type SupabasePoliceStation,
} from "./supabase.server";

export interface HistoricalData {
  source: "supabase" | "dataset" | "none";
  incidents: SupabaseIncident[];
  stations: SupabasePoliceStation[];
  plans: SupabaseEventPlan[];
}

function parseNumber(value: string | null | undefined): number | undefined {
  if (value == null || value === "" || value.toUpperCase() === "NULL") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCsvLine(line: string): string[] {
  const row: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current);
  return row;
}

function parseDatasetCsv(csv: string): SupabaseIncident[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= 1) return [];

  const header = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);

  return rows.map((values) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key] = values[index] ?? "";
    });

    return {
      id: record.id || `INC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      type: record.event_type === "planned" ? "planned" : "unplanned",
      event_type: record.event_cause || record.event_type || "unknown",
      description: record.description?.trim() || undefined,
      latitude: parseNumber(record.latitude),
      longitude: parseNumber(record.longitude),
      status: record.status || undefined,
      priority: record.priority || undefined,
      corridor: record.corridor || undefined,
      zone: record.zone || undefined,
      police_station: record.police_station || undefined,
      junction: record.junction || undefined,
      vehicle_type: record.veh_type || undefined,
      assigned_officers: parseNumber(record.assigned_officers),
      barricades_deployed: parseNumber(record.barricades_deployed),
      created_at: record.created_date || record.start_datetime || undefined,
      resolved_at: record.resolved_at || undefined,
      closed_at: record.closed_datetime || undefined,
    };
  });
}

export const fetchHistoricalData = createServerFn({ method: "GET" }).handler(async () => {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const [incidents, stations, plans] = await Promise.all([
      fetchSupabaseIncidents(),
      fetchSupabasePoliceStations(),
      fetchSupabaseEventPlans(),
    ]);

    return {
      source: "supabase",
      incidents,
      stations,
      plans,
    };
  }

  try {
    const filePath = join(process.cwd(), "dataset.csv");
    const contents = await fs.readFile(filePath, "utf8");
    const incidents = parseDatasetCsv(contents);
    return {
      source: "dataset",
      incidents,
      stations: [],
      plans: [],
    };
  } catch (error) {
    return {
      source: "none",
      incidents: [],
      stations: [],
      plans: [],
    };
  }
});
