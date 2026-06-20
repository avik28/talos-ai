import os
import pandas as pd
import numpy as np

# Resolve project paths
ml_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
root_dir = os.path.dirname(ml_dir)
raw_dataset_path = os.path.join(root_dir, "datasets", "dataset.csv")
processed_dir = os.path.join(root_dir, "datasets", "processed")
output_path = os.path.join(processed_dir, "cleaned_dataset.csv")

def clean_data():
    print(f"Reading raw dataset from {raw_dataset_path}...")
    if not os.path.exists(raw_dataset_path):
        raise FileNotFoundError(f"Raw dataset not found at {raw_dataset_path}")
        
    df = pd.read_csv(raw_dataset_path)
    print(f"Raw dataset shape: {df.shape}")
    
    # Fill missing causes and priorities
    df['event_cause'] = df['event_cause'].fillna('others').astype(str)
    df['priority'] = df['priority'].fillna('Medium').astype(str)
    
    # Parse dates
    df['start'] = pd.to_datetime(df['start_datetime'], errors='coerce')
    df['resolved'] = pd.to_datetime(df['resolved_datetime'], errors='coerce')
    df['closed'] = pd.to_datetime(df['closed_datetime'], errors='coerce')
    
    # Compute end date (prefer resolved, fallback to closed)
    df['end'] = df['resolved'].fillna(df['closed'])
    
    # Calculate duration in minutes
    df['duration_min'] = (df['end'] - df['start']).dt.total_seconds() / 60.0
    
    # Filter valid rows: duration must be positive and not unreasonably high (e.g. max 1 week = 10080 mins)
    df = df[df['duration_min'] > 0]
    df = df[df['duration_min'] <= 10080]
    
    # Handle road closure boolean
    df['requires_road_closure'] = df['requires_road_closure'].astype(str).str.upper() == 'TRUE'
    df['requires_road_closure'] = df['requires_road_closure'].astype(int)
    
    # Clean coordinates
    df['latitude'] = pd.to_numeric(df['latitude'], errors='coerce')
    df['longitude'] = pd.to_numeric(df['longitude'], errors='coerce')
    df = df.dropna(subset=['latitude', 'longitude', 'duration_min'])
    
    # Standardize event causes
    cause_mapping = {
        'vehicle_breakdown': 'vehicle_breakdown',
        'tree_fall': 'tree_fall',
        'accident': 'accident',
        'water_logging': 'water_logging',
        'pot_holes': 'pot_holes',
        'congestion': 'congestion',
        'construction': 'construction',
        'road_conditions': 'road_conditions',
        'public_event': 'public_event'
    }
    df['event_cause'] = df['event_cause'].apply(lambda x: cause_mapping.get(x.strip().lower(), 'others'))
    
    # Select clean columns
    clean_cols = [
        'event_cause',
        'latitude',
        'longitude',
        'priority',
        'requires_road_closure',
        'duration_min'
    ]
    df_clean = df[clean_cols]
    
    # Ensure processed directory exists
    os.makedirs(processed_dir, exist_ok=True)
    df_clean.to_csv(output_path, index=False)
    
    print(f"Preprocessed dataset saved to {output_path}. Shape: {df_clean.shape}")

if __name__ == "__main__":
    clean_data()
