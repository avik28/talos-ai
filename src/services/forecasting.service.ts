export interface ForecastRequest {
  event_cause: string;
  latitude: number;
  longitude: number;
  priority: string;
  requires_road_closure: boolean;
}

export interface ForecastResponse {
  event_cause: string;
  predicted_clearance_min: number;
}

export async function fetchClearanceForecast(req: ForecastRequest): Promise<ForecastResponse> {
  const res = await fetch("http://localhost:8000/api/forecasting/clearance", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    throw new Error(`Forecasting API failed with status ${res.status}`);
  }

  return (await res.json()) as ForecastResponse;
}
