export interface ClosedRoad {
  name: string;
  lat: number | null;
  lng: number | null;
}

export interface WhatIfRequest {
  query: string;
  waypoints: number[][];
  closedRoads: ClosedRoad[];
  variables: {
    rain: boolean;
    peakHour: boolean;
    deployedOfficers: number;
  };
}

export interface WhatIfResponse {
  queryMatched: boolean;
  title: string;
  congestionBefore: number;
  congestionAfter: number;
  delayBefore: number;
  delayAfter: number;
  officersDeployed: number;
  spilloverImpact: { road: string; delta: number }[];
  recommendations: { title: string; desc: string; type: "close" | "convert" | "redirect" }[];
  description: string;
  points: number[][];
  closedRoads: ClosedRoad[];
}

export async function fetchWhatIfAnalysis(req: WhatIfRequest): Promise<WhatIfResponse> {
  const res = await fetch("http://localhost:8000/api/what-if", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    throw new Error(`AI What-If API failed with status ${res.status}`);
  }

  return (await res.json()) as WhatIfResponse;
}
