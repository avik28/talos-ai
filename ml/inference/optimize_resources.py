def optimize_incident_resources(impact_score: float, cross_streets: int, distance_km: float, planned: bool, attendees: int = 15000) -> dict:
    from backend.services.resource_service import recommend_resources
    return recommend_resources(
        planned=planned,
        impact_score=impact_score,
        cross_streets=cross_streets,
        distance_km=distance_km,
        attendees=attendees
    )
