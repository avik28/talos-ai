def calculate_incident_urgency(severity: str, closure_prob: float) -> float:
    sev_weights = { "low": 0.1, "medium": 0.2, "high": 0.3, "critical": 0.45 }
    w_priority = sev_weights.get(severity.lower(), 0.2)
    return (w_priority + closure_prob) * 100
