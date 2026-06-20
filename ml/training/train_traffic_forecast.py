import os
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import root_mean_squared_error, r2_score
import joblib

ml_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
root_dir = os.path.dirname(ml_dir)
dataset_path = os.path.join(root_dir, "datasets", "processed", "cleaned_dataset.csv")
models_dir = os.path.join(root_dir, "ml", "models")
output_path = os.path.join(models_dir, "traffic_forecaster.pkl")

def train_model():
    print(f"Loading cleaned dataset from {dataset_path}...")
    if not os.path.exists(dataset_path):
        raise FileNotFoundError(f"Cleaned dataset not found at {dataset_path}. Please run clean_data.py first.")
        
    df = pd.read_csv(dataset_path)
    print(f"Dataset shape: {df.shape}")
    
    # Split features and target
    X = df[['event_cause', 'latitude', 'longitude', 'priority', 'requires_road_closure']]
    y = df['duration_min']
    
    # Train-test split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Define preprocessing pipeline
    categorical_features = ['event_cause', 'priority']
    numeric_features = ['latitude', 'longitude', 'requires_road_closure']
    
    preprocessor = ColumnTransformer(
        transformers=[
            ('cat', OneHotEncoder(handle_unknown='ignore'), categorical_features),
            ('num', StandardScaler(), numeric_features)
        ]
    )
    
    # Define the model pipeline
    pipeline = Pipeline(steps=[
        ('preprocessor', preprocessor),
        ('regressor', RandomForestRegressor(n_estimators=100, max_depth=12, random_state=42, n_jobs=-1))
    ])
    
    print("Training Random Forest Regressor...")
    pipeline.fit(X_train, y_train)
    
    # Evaluate
    y_pred = pipeline.predict(X_test)
    rmse = root_mean_squared_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)
    print(f"Model trained. Test RMSE: {rmse:.2f} mins, R2 Score: {r2:.4f}")
    
    # Save the pipeline
    os.makedirs(models_dir, exist_ok=True)
    joblib.dump(pipeline, output_path)
    print(f"Saved trained model pipeline to {output_path}")

if __name__ == "__main__":
    train_model()
