def simulate_traffic_flows(corridor_id: str, is_rain: bool, is_peak: bool, officers: int) -> list[dict]:
    """
    Simulates junction loads based on weather, peak-hour, and officer metrics.
    """
    base_load = 0.55
    if is_rain:
        base_load += 0.20
    if is_peak:
        base_load += 0.15
        
    officer_reduction = min(0.30, officers * 0.03)
    net_load = max(0.10, min(0.99, base_load - officer_reduction))
    
    junctions = [
        {"name": "North Entry Flyover", "load": net_load * 1.05},
        {"name": "Service Road Merge", "load": net_load * 0.95},
        {"name": "Ring Road Junction", "load": net_load * 1.10},
        {"name": "CBD Approach", "load": net_load * 0.85}
    ]
    return [{k: min(0.99, max(0.05, v)) if k == "load" else v for k, v in j.items()} for j in junctions]
