export interface SimulationRequest {
  corridor_id: string;
  is_rain: boolean;
  is_peak: boolean;
  officers: number;
}

export interface JunctionSim {
  name: string;
  load: number;
}

export async function fetchSimulationData(req: SimulationRequest): Promise<JunctionSim[]> {
  // A simple simulated network call for digital twin loading
  const base_load =
    0.55 + (req.is_rain ? 0.2 : 0) + (req.is_peak ? 0.15 : 0) - min(0.3, req.officers * 0.03);
  return [
    { name: "North Entry Flyover", load: min(0.99, max(0.05, base_load * 1.05)) },
    { name: "Service Road Merge", load: min(0.99, max(0.05, base_load * 0.95)) },
    { name: "Ring Road Junction", load: min(0.99, max(0.05, base_load * 1.1)) },
    { name: "CBD Approach", load: min(0.99, max(0.05, base_load * 0.85)) },
  ];
}

function min(a: number, b: number) {
  return a < b ? a : b;
}
function max(a: number, b: number) {
  return a > b ? a : b;
}
