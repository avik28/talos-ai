import os
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
import joblib

ml_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
root_dir = os.path.dirname(ml_dir)
dataset_path = os.path.join(root_dir, "datasets", "processed", "cleaned_dataset.csv")
models_dir = os.path.join(root_dir, "ml", "models")
output_path = os.path.join(models_dir, "incident_predictor.pkl")

def train_classifier():
    print(f"Loading cleaned dataset from {dataset_path}...")
    if not os.path.exists(dataset_path):
        raise FileNotFoundError(f"Cleaned dataset not found at {dataset_path}.")
        
    df = pd.read_csv(dataset_path)
    
    # Split features and target
    X = df[['event_cause', 'latitude', 'longitude', 'priority']]
    y = df['requires_road_closure']
    
    # Train-test split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Preprocessing
    categorical_features = ['event_cause', 'priority']
    numeric_features = ['latitude', 'longitude']
    
    preprocessor = ColumnTransformer(
        transformers=[
            ('cat', OneHotEncoder(handle_unknown='ignore'), categorical_features),
            ('num', StandardScaler(), numeric_features)
        ]
    )
    
    # Model pipeline
    pipeline = Pipeline(steps=[
        ('preprocessor', preprocessor),
        ('classifier', RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42, n_jobs=-1))
    ])
    
    print("Training Random Forest Classifier...")
    pipeline.fit(X_train, y_train)
    
    # Evaluate
    y_pred = pipeline.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"Model trained. Accuracy: {acc:.4f}")
    print("Classification Report:")
    print(classification_report(y_test, y_pred))
    
    # Save the pipeline
    os.makedirs(models_dir, exist_ok=True)
    joblib.dump(pipeline, output_path)
    print(f"Saved trained classifier pipeline to {output_path}")

if __name__ == "__main__":
    train_classifier()
