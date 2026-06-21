import { API_BASE } from "@/lib/api";
import { ClosedRoad } from "./ai.service";

export interface RouteRequest {
  waypoints: number[][];
  closedRoads: ClosedRoad[];
  variables: {
    rain: boolean;
    peakHour: boolean;
    deployedOfficers: number;
  };
}

export interface RouteResponse {
  points: number[][];
}

export async function fetchRoutePoints(req: RouteRequest): Promise<RouteResponse> {
  const res = await fetch(`${API_BASE}/api/route`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    throw new Error(`Routing API failed with status ${res.status}`);
  }

  return (await res.json()) as RouteResponse;
}
