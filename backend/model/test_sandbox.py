import pandas as pd
import joblib
import math

print("--- INITIALIZING LEAN ARCHITECTURE SANDBOX ---")

# 1. Load the trained model
try:
    model = joblib.load('dual_intake_model.pkl')
    print("[SYSTEM] ML Model loaded successfully.")
except FileNotFoundError:
    print("[ERROR] Could not find dual_intake_model.pkl. Did you run the previous script to save it?")
    exit()

# 2. Mock Database: The In-Memory Route Stack
# We will simulate two zones. Notice how Indiranagar has a pre-existing strike 
# to simulate what happens when it hits the 3-strike threshold.
mock_route_db = {
    "Indiranagar_Peak": {
        "primary": "100ft Road Diversion",
        "secondary": "Double Road Bypass",
        "tertiary": "Old Airport Road (Penalty Box)",
        "strikes": 2  # Starting at 2 strikes to test the demotion logic!
    },
    "Peenya_OffPeak": {
        "primary": "Tumkur Service Road",
        "secondary": "Dasarahalli Inner Route",
        "tertiary": "NICE Road Exit",
        "strikes": 0
    }
}

# 3. The Core Logic Engine
def process_live_event(event_data, actual_clearance_time):
    print(f"\n>>> NEW EVENT DETECTED: {event_data['event_cause']} in {event_data['zone']} <<<")
    
    # Context ID maps to our mock database
    context = "Peak" if event_data['is_peak_hour'] == 1 else "OffPeak"
    db_key = f"{event_data['zone']}_{context}"
    
    if db_key not in mock_route_db:
        print(f"[ERROR] No routing data for {db_key}")
        return

    # A. Calculate Dynamic Impact Score (S_impact)
    input_df = pd.DataFrame([event_data])
    s_impact = model.predict(input_df)[0]
    strike_threshold = s_impact * 1.25
    
    # B. Calculate Resource Matrix
    officers = math.ceil(event_data['impact_distance_km'] / 1.5) + 2
    
    active_route = mock_route_db[db_key]['primary']
    
    print(f"  -> Predicted Clearance (S_impact): {s_impact:.1f} mins")
    print(f"  -> Failure Threshold: {strike_threshold:.1f} mins")
    print(f"  -> Dispatching {officers} Officers to Active Route: [{active_route}]")
    
    # C. Phase 3: The Post-Event Audit (Simulating time passing...)
    print(f"\n  [AUDIT] Event cleared in {actual_clearance_time} mins.")
    
    if actual_clearance_time > strike_threshold:
        mock_route_db[db_key]['strikes'] += 1
        current_strikes = mock_route_db[db_key]['strikes']
        print(f"  -> [WARNING] Actual time exceeded threshold! STRIKE ISSUED. (Total: {current_strikes}/3)")
        
        # D. The Threshold Demotion Check
        if current_strikes >= 3:
            print("  -> [SYSTEM ACTION] 3 Strikes Reached! Executing Route Rotation...")
            demoted_route = mock_route_db[db_key]['primary']
            
            # Rotate the stack
            mock_route_db[db_key]['primary'] = mock_route_db[db_key]['secondary']
            mock_route_db[db_key]['secondary'] = mock_route_db[db_key]['tertiary']
            mock_route_db[db_key]['tertiary'] = demoted_route
            mock_route_db[db_key]['strikes'] = 0 # Reset strikes after demotion
            
            print(f"     [NEW PRIMARY]: {mock_route_db[db_key]['primary']}")
            print(f"     [DEMOTED TO TERTIARY]: {demoted_route}")
    else:
        print("  -> [SUCCESS] Cleared within threshold. Route performs well. No strikes issued.")


# 4. Run the Tests!

# TEST 1: Indiranagar BMTC Bus Breakdown (Peak Hour)
# We will simulate that it takes 80 minutes to clear, pushing it over the edge to get its 3rd strike.
event_1 = {
    'event_type': 'unplanned', 'event_cause': 'vehicle_breakdown', 'corridor': 'CBD 2',
    'veh_type': 'bmtc_bus', 'priority': 'High', 'zone': 'Indiranagar',
    'hour_of_day': 18, 'day_of_week': 2, 'is_peak_hour': 1,
    'impact_distance_km': 0.0, 'has_mech_failure': 1, 't_base': 45.0
}
process_live_event(event_1, actual_clearance_time=80)


# TEST 2: Peenya Accident (Off-Peak)
# We will simulate a fast clearance to ensure the system doesn't issue false strikes.
event_2 = {
    'event_type': 'unplanned', 'event_cause': 'accident', 'corridor': 'Tumkur Road',
    'veh_type': 'lcv', 'priority': 'Medium', 'zone': 'Peenya',
    'hour_of_day': 14, 'day_of_week': 4, 'is_peak_hour': 0,
    'impact_distance_km': 2.5, 'has_mech_failure': 0, 't_base': 35.0
}
process_live_event(event_2, actual_clearance_time=30)