import subprocess
import os

ml_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def run_pipeline():
    print("=== GRIDMIND ML PIPELINE STARTED ===")
    
    clean_script = os.path.join(ml_dir, "preprocessing", "clean_data.py")
    train_forecast = os.path.join(ml_dir, "training", "train_traffic_forecast.py")
    train_incident = os.path.join(ml_dir, "training", "train_incident_predictor.py")
    
    print("\n1. Running Data Cleaning...")
    subprocess.run(["python", clean_script], check=True)
    
    print("\n2. Training Traffic Volume Forecaster Model...")
    subprocess.run(["python", train_forecast], check=True)
    
    print("\n3. Training Incident Priority Classifier Model...")
    subprocess.run(["python", train_incident], check=True)
    
    print("\n=== ML PIPELINE COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_pipeline()
