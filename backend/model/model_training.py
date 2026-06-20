import pandas as pd
import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.impute import SimpleImputer
from sklearn.ensemble import RandomForestRegressor
import warnings
warnings.filterwarnings('ignore')

def haversine_vectorized(lat1, lon1, lat2, lon2):
    """Calculates the great circle distance between two points on the earth in km."""
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat/2.0)**2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon/2.0)**2
    c = 2 * np.arcsin(np.sqrt(a))
    return 6371 * c  # Radius of earth in kilometers

def load_and_clean_data(file_path):
    print("Step 1: Loading and Purging Noise...")
    df = pd.read_csv(file_path)

    # 1. Drop Administrative Noise & Target Leakage
    cols_to_drop = [
        'id', 'client_id', 'created_by_id', 'last_modified_by_id', 'assigned_to_police_id',
        'closed_by_id', 'resolved_by_id', 'citizen_accident_id', 'kgid', 'gba_identifier',
        'veh_no', 'map_file', 'direction', 'meta_data', 'comment', 'route_path', 'status'
    ]
    df = df.drop(columns=[c for c in cols_to_drop if c in df.columns], errors='ignore')

    # 2. Parse Datetimes & Calculate Targets
    df['created_date'] = pd.to_datetime(df['created_date'], errors='coerce')
    df['closed_datetime'] = pd.to_datetime(df['closed_datetime'], errors='coerce')
    
    # Target 1: Duration in minutes
    df['duration_mins'] = (df['closed_datetime'] - df['created_date']).dt.total_seconds() / 60.0
    df = df[(df['duration_mins'] > 0) & (df['duration_mins'] < 10080)].copy()

    # Target 2: Safely map closure boolean
    if 'requires_road_closure' in df.columns:
        df['is_closed'] = df['requires_road_closure'].astype(str).str.upper().map({'TRUE': 1, 'FALSE': 0, '1': 1, '0': 0})
        df['is_closed'] = df['is_closed'].fillna(0).astype(int)

    return df

def engineer_features(df):
    print("Step 2: Engineering Physics & Context Features...")
    
    # --- Temporal Engineering ---
    df['hour_of_day'] = df['created_date'].dt.hour
    df['day_of_week'] = df['created_date'].dt.dayofweek
    # Define Peak Hours: 8 AM - 11 AM, 5 PM - 8 PM
    df['is_peak_hour'] = df['hour_of_day'].apply(lambda x: 1 if (8 <= x <= 11) or (17 <= x <= 20) else 0)

    # --- Spatial Engineering (Impact Radius) ---
    # Convert '0' coordinates to NaN temporarily for math
    df['endlatitude'] = df['endlatitude'].replace(0, np.nan)
    df['endlongitude'] = df['endlongitude'].replace(0, np.nan)
    
    # Calculate route impact distance; fill NaNs (point impacts) with 0 km
    df['impact_distance_km'] = haversine_vectorized(
        df['latitude'], df['longitude'], df['endlatitude'], df['endlongitude']
    )
    df['impact_distance_km'] = df['impact_distance_km'].fillna(0)

    # --- Text Engineering ---
    keywords = ['tyre', 'clutch', 'brake', 'engine', 'breakdown', 'burst']
    df['reason_breakdown'] = df['reason_breakdown'].astype(str).str.lower()
    df['has_mech_failure'] = df['reason_breakdown'].apply(
        lambda x: 1 if any(k in x for k in keywords) else 0
    )

    # --- Bootstrap T_base (Baseline Time) ---
    # Group by zone and event_cause to find median historical times
    t_base_df = df.groupby(['zone', 'event_cause'])['duration_mins'].median().reset_index(name='t_base')
    df = df.merge(t_base_df, on=['zone', 'event_cause'], how='left')
    # If a combination has never happened, fall back to global median
    df['t_base'] = df['t_base'].fillna(df['duration_mins'].median())

    # Final Feature Selection
    features = [
        'event_type', 'event_cause', 'corridor', 'veh_type', 'priority', 'zone', 
        'hour_of_day', 'day_of_week', 'is_peak_hour', 'impact_distance_km', 'has_mech_failure', 't_base'
    ]
    
    return df, features

def train_impact_engine(df, features):
    print("Step 3: Training the Dual-Intake S_impact Model...")
    
    X = df[features]
    y = df['duration_mins']

    categorical_cols = ['event_type', 'event_cause', 'corridor', 'veh_type', 'priority', 'zone']
    numerical_cols = ['hour_of_day', 'day_of_week', 'is_peak_hour', 'impact_distance_km', 'has_mech_failure', 't_base']

    # Preprocessors
    categorical_transformer = Pipeline(steps=[
        ('imputer', SimpleImputer(strategy='constant', fill_value='Unknown')),
        ('onehot', OneHotEncoder(handle_unknown='ignore'))
    ])
    numerical_transformer = Pipeline(steps=[
        ('imputer', SimpleImputer(strategy='median')),
        ('scaler', StandardScaler())
    ])

    preprocessor = ColumnTransformer(transformers=[
        ('num', numerical_transformer, numerical_cols),
        ('cat', categorical_transformer, categorical_cols)
    ])

    # Random Forest Pipeline
    model = Pipeline(steps=[
        ('preprocessor', preprocessor),
        ('regressor', RandomForestRegressor(n_estimators=100, max_depth=15, random_state=42))
    ])

    # Train the model (Using full historical data for the Bootstrapping phase)
    model.fit(X, y)
    
    # Generate the S_impact score for every historical event
    df['S_impact_prediction'] = model.predict(X)
    
    return df, model

def run_historical_backtest(df):
    print("\nStep 4: Executing Phase 4 Bootstrapping (Threshold Elimination)...")
    
    # The Penalty Rule: Actual Time > 1.25 * Predicted Impact Score
    df['ghost_strike'] = np.where(df['duration_mins'] > (1.25 * df['S_impact_prediction']), 1, 0)
    
    total_strikes = df['ghost_strike'].sum()
    print(f"-> Issued {total_strikes} Ghost Strikes across {len(df)} historical events.")

    # Group by Junction/Zone to find chronic failures in specific contexts
    # (Here we group by zone and peak hour status to replicate Context Sub-Stacks)
    strike_ledger = df.groupby(['zone', 'is_peak_hour'])['ghost_strike'].sum().reset_index()
    
    # The Threshold: 3 or more strikes = Elimination
    penalty_box = strike_ledger[strike_ledger['ghost_strike'] >= 3].sort_values(by='ghost_strike', ascending=False)
    
    print("\n--- DAY 1 PRE-SORTED PENALTY BOX ---")
    print("These Zone/Context default routes have failed historically and will be demoted to Tertiary.")
    for index, row in penalty_box.iterrows():
        context = "Peak Hours" if row['is_peak_hour'] == 1 else "Off-Peak"
        print(f"[DEMOTED] Zone: {row['zone']} | Context: {context} | Strikes: {row['ghost_strike']}")

    return penalty_box

if __name__ == "__main__":
    FILE_PATH = 'Dataset.txt' 
    
    try:
        df_clean = load_and_clean_data(FILE_PATH)
        df_engineered, feature_list = engineer_features(df_clean)
        df_scored, impact_model = train_impact_engine(df_engineered, feature_list)
        
        # Run the backtest and get the Day 1 Demotions
        penalty_box = run_historical_backtest(df_scored)
        
        print("\nSuccess! Historical Bootstrapping complete. The Lean Architecture is ready for Day 1 Live Deployment.")
        
    except FileNotFoundError:
        print(f"Error: Could not find {FILE_PATH}.")