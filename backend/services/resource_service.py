def recommend_resources(planned: bool, impact_score: float, cross_streets: int, distance_km: float, attendees: int = 15000) -> dict:
    I_d = impact_score / 100.0
    barricades = max(2, int(round(cross_streets * I_d * 8)))
    
    if not planned:
        base_req = 2
        officers = int(round(distance_km * I_d * 4)) + base_req
    else:
        base_req = 4
        officers = int(round(base_req + (attendees / 1000.0) * I_d * 1.5))
        
    tow_trucks = max(1, int(round(impact_score / 33.0)))
    ambulances = 1 if planned and attendees > 10000 else (1 if impact_score > 60 else 0)
    
    return {
        "barricades": barricades,
        "officers": max(2, officers),
        "towTrucks": tow_trucks,
        "ambulances": ambulances
    }
