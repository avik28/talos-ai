"""
Talos.ai - Model Performance Evaluation
Compares Random Forest vs Gradient Boosting on the historical incident dataset.
Outputs: R2, MAE, RMSE, MAPE, classification accuracy, and feature importances.
"""
import os
import sys
import io

# Force UTF-8 output on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.impute import SimpleImputer
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import (
    r2_score,
    mean_absolute_error,
    mean_squared_error,
    mean_absolute_percentage_error,
    accuracy_score,
)
from sklearn.dummy import DummyRegressor
import warnings
warnings.filterwarnings("ignore")


def severity_bin(mins):
    """Bin clearance time into operational severity categories."""
    if mins <= 15:
        return "Quick (<15m)"
    elif mins <= 45:
        return "Moderate (15-45m)"
    elif mins <= 90:
        return "Prolonged (45-90m)"
    else:
        return "Severe (>90m)"

# ---------------------------------------------------------------------------
# 1. Load and clean data (reuses project logic from model_training.py)
# ---------------------------------------------------------------------------
def haversine_vectorized(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2.0) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2.0) ** 2
    c = 2 * np.arcsin(np.sqrt(a))
    return 6371 * c


def load_and_clean(path):
    df = pd.read_csv(path)
    cols_to_drop = [
        "id", "client_id", "created_by_id", "last_modified_by_id",
        "assigned_to_police_id", "closed_by_id", "resolved_by_id",
        "citizen_accident_id", "kgid", "gba_identifier", "veh_no",
        "map_file", "direction", "meta_data", "comment", "route_path", "status",
    ]
    df = df.drop(columns=[c for c in cols_to_drop if c in df.columns], errors="ignore")
    df["created_date"] = pd.to_datetime(df["created_date"], errors="coerce")
    df["closed_datetime"] = pd.to_datetime(df["closed_datetime"], errors="coerce")
    df["duration_mins"] = (df["closed_datetime"] - df["created_date"]).dt.total_seconds() / 60.0
    # Stage 1: Remove impossible values (negative or > 8 hours for traffic incidents)
    df = df[(df["duration_mins"] > 0) & (df["duration_mins"] <= 480)].copy()
    # Stage 2: IQR-based outlier removal
    Q1 = df["duration_mins"].quantile(0.25)
    Q3 = df["duration_mins"].quantile(0.75)
    IQR = Q3 - Q1
    lower = max(0, Q1 - 1.5 * IQR)
    upper = Q3 + 1.5 * IQR
    before = len(df)
    df = df[(df["duration_mins"] >= lower) & (df["duration_mins"] <= upper)].copy()
    print(f"IQR filter: Q1={Q1:.1f}, Q3={Q3:.1f}, IQR={IQR:.1f}, bounds=[{lower:.1f}, {upper:.1f}], removed {before - len(df)} outliers")
    return df


def engineer(df):
    df["hour_of_day"] = df["created_date"].dt.hour
    df["day_of_week"] = df["created_date"].dt.dayofweek
    df["is_peak_hour"] = df["hour_of_day"].apply(lambda x: 1 if (8 <= x <= 11) or (17 <= x <= 20) else 0)
    df["endlatitude"] = df["endlatitude"].replace(0, np.nan)
    df["endlongitude"] = df["endlongitude"].replace(0, np.nan)
    df["impact_distance_km"] = haversine_vectorized(
        df["latitude"], df["longitude"], df["endlatitude"], df["endlongitude"]
    ).fillna(0)
    keywords = ["tyre", "clutch", "brake", "engine", "breakdown", "burst"]
    df["reason_breakdown"] = df["reason_breakdown"].fillna("").astype(str).str.lower()
    df["has_mech_failure"] = df["reason_breakdown"].apply(lambda x: 1 if any(k in x for k in keywords) else 0)
    t_base = df.groupby(["zone", "event_cause"])["duration_mins"].median().reset_index(name="t_base")
    df = df.merge(t_base, on=["zone", "event_cause"], how="left")
    df["t_base"] = df["t_base"].fillna(df["duration_mins"].median())
    return df


# ---------------------------------------------------------------------------
# 2. Build sklearn pipelines
# ---------------------------------------------------------------------------
FEATURES = [
    "event_type", "event_cause", "corridor", "veh_type", "priority", "zone",
    "hour_of_day", "day_of_week", "is_peak_hour", "impact_distance_km",
    "has_mech_failure", "t_base",
]
CAT_COLS = ["event_type", "event_cause", "corridor", "veh_type", "priority", "zone"]
NUM_COLS = ["hour_of_day", "day_of_week", "is_peak_hour", "impact_distance_km", "has_mech_failure", "t_base"]


def build_pipeline(regressor):
    cat_pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="constant", fill_value="Unknown")),
        ("onehot", OneHotEncoder(handle_unknown="ignore")),
    ])
    num_pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])
    preprocessor = ColumnTransformer([
        ("num", num_pipe, NUM_COLS),
        ("cat", cat_pipe, CAT_COLS),
    ])
    return Pipeline([("preprocessor", preprocessor), ("regressor", regressor)])


# ---------------------------------------------------------------------------
# 3. Evaluate
# ---------------------------------------------------------------------------
def evaluate(name, model, X_train, X_test, y_train, y_test):
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)

    r2 = r2_score(y_test, y_pred)
    mae = mean_absolute_error(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))

    # Filter out near-zero actuals to avoid MAPE explosion
    mask = y_test > 5  # only compute MAPE where actual > 5 min
    if mask.sum() > 0:
        mape = mean_absolute_percentage_error(y_test[mask], y_pred[mask]) * 100
    else:
        mape = 0.0

    # Classification accuracy: bin predictions into severity categories
    true_bins = y_test.apply(severity_bin)
    pred_bins = pd.Series(y_pred, index=y_test.index).apply(severity_bin)
    class_acc = accuracy_score(true_bins, pred_bins) * 100

    # Within-15-min accuracy (practical operational metric)
    within_15 = (np.abs(y_test.values - y_pred) <= 15).mean() * 100
    within_30 = (np.abs(y_test.values - y_pred) <= 30).mean() * 100

    # 5-fold cross-validation
    X_full = pd.concat([X_train, X_test])
    y_full = pd.concat([y_train, y_test])
    cv_scores = cross_val_score(model, X_full, y_full, cv=5, scoring="r2")

    print(f"\n{'=' * 60}")
    print(f"  {name}")
    print(f"{'=' * 60}")
    print(f"  R2 Score (test)            : {r2:.4f}")
    print(f"  MAE  (test)                : {mae:.2f} minutes")
    print(f"  RMSE (test)                : {rmse:.2f} minutes")
    print(f"  MAPE (test, actual>5m)     : {mape:.2f}%")
    print(f"  Severity Bin Accuracy      : {class_acc:.1f}%")
    print(f"  Within +/-15 min           : {within_15:.1f}%")
    print(f"  Within +/-30 min           : {within_30:.1f}%")
    print(f"  5-Fold CV R2 (mean+/-std)  : {cv_scores.mean():.4f} +/- {cv_scores.std():.4f}")
    print(f"{'=' * 60}")

    return {
        "name": name, "r2": r2, "mae": mae, "rmse": rmse, "mape": mape,
        "class_acc": class_acc, "within_15": within_15, "within_30": within_30,
        "cv_r2_mean": cv_scores.mean(), "cv_r2_std": cv_scores.std(),
        "model": model, "y_pred": y_pred,
    }


def print_feature_importances(result, feature_names):
    reg = result["model"].named_steps["regressor"]
    importances = reg.feature_importances_
    preprocessor = result["model"].named_steps["preprocessor"]
    try:
        cat_features = preprocessor.named_transformers_["cat"]["onehot"].get_feature_names_out(CAT_COLS)
        all_features = list(NUM_COLS) + list(cat_features)
    except Exception:
        all_features = [f"feature_{i}" for i in range(len(importances))]

    pairs = sorted(zip(all_features, importances), key=lambda x: x[1], reverse=True)
    print(f"\n  Top 10 Feature Importances - {result['name']}:")
    print(f"  {'Feature':<45} {'Importance':>10}")
    print(f"  {'-' * 58}")
    for feat, imp in pairs[:10]:
        bar = "#" * int(imp * 100)
        print(f"  {feat:<45} {imp:>10.4f}  {bar}")


# ---------------------------------------------------------------------------
# 4. Main
# ---------------------------------------------------------------------------
def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    dataset_path = os.path.join(script_dir, "..", "..", "public", "dataset.csv")
    dataset_path = os.path.normpath(dataset_path)

    if not os.path.exists(dataset_path):
        print(f"ERROR: dataset.csv not found at {dataset_path}")
        sys.exit(1)

    print(f"Loading dataset from: {dataset_path}")
    df = load_and_clean(dataset_path)
    df = engineer(df)
    print(f"Records after cleaning: {len(df)}")
    print(f"Target (duration_mins) - mean: {df['duration_mins'].mean():.1f}, median: {df['duration_mins'].median():.1f}, std: {df['duration_mins'].std():.1f}")

    # Show severity distribution
    bins = df["duration_mins"].apply(severity_bin).value_counts()
    print(f"\nSeverity Distribution:")
    for b, c in bins.items():
        print(f"  {b:<25} {c:>5} ({c/len(df)*100:.1f}%)")

    X = df[FEATURES]
    y = df["duration_mins"]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    print(f"\nTrain size: {len(X_train)} | Test size: {len(X_test)}")

    # --- Baseline: Mean Predictor ---
    baseline = DummyRegressor(strategy="mean")
    baseline.fit(X_train, y_train)
    bl_pred = baseline.predict(X_test)
    bl_mae = mean_absolute_error(y_test, bl_pred)
    bl_rmse = np.sqrt(mean_squared_error(y_test, bl_pred))
    print(f"\n  BASELINE (Mean Predictor): MAE={bl_mae:.2f} min, RMSE={bl_rmse:.2f} min")

    # --- Random Forest ---
    rf_pipeline = build_pipeline(RandomForestRegressor(
        n_estimators=100, max_depth=15, random_state=42
    ))
    rf_result = evaluate("Random Forest Regressor", rf_pipeline, X_train, X_test, y_train, y_test)

    # --- Gradient Boosting ---
    gb_pipeline = build_pipeline(GradientBoostingRegressor(
        n_estimators=200, max_depth=6, learning_rate=0.1, random_state=42
    ))
    gb_result = evaluate("Gradient Boosting Regressor", gb_pipeline, X_train, X_test, y_train, y_test)

    # --- Comparison Table ---
    print(f"\n{'=' * 68}")
    print(f"  COMPARISON SUMMARY")
    print(f"{'=' * 68}")
    print(f"  {'Metric':<30} {'Baseline':>10} {'RF':>12} {'GB':>12}")
    print(f"  {'-' * 64}")
    print(f"  {'R2 Score':<30} {'N/A':>10} {rf_result['r2']:>12.4f} {gb_result['r2']:>12.4f}")
    print(f"  {'MAE (minutes)':<30} {bl_mae:>10.2f} {rf_result['mae']:>12.2f} {gb_result['mae']:>12.2f}")
    print(f"  {'RMSE (minutes)':<30} {bl_rmse:>10.2f} {rf_result['rmse']:>12.2f} {gb_result['rmse']:>12.2f}")
    print(f"  {'MAPE (%, actual>5m)':<30} {'N/A':>10} {rf_result['mape']:>12.2f} {gb_result['mape']:>12.2f}")
    print(f"  {'Severity Bin Accuracy (%)':<30} {'N/A':>10} {rf_result['class_acc']:>12.1f} {gb_result['class_acc']:>12.1f}")
    print(f"  {'Within +/-15 min (%)':<30} {'N/A':>10} {rf_result['within_15']:>12.1f} {gb_result['within_15']:>12.1f}")
    print(f"  {'Within +/-30 min (%)':<30} {'N/A':>10} {rf_result['within_30']:>12.1f} {gb_result['within_30']:>12.1f}")
    print(f"  {'CV R2 (mean)':<30} {'N/A':>10} {rf_result['cv_r2_mean']:>12.4f} {gb_result['cv_r2_mean']:>12.4f}")
    print(f"  {'-' * 64}")

    # MAE improvement over baseline
    rf_improve = (1 - rf_result["mae"] / bl_mae) * 100
    gb_improve = (1 - gb_result["mae"] / bl_mae) * 100
    print(f"\n  MAE improvement over baseline:")
    print(f"    Random Forest    : {rf_improve:+.1f}%")
    print(f"    Gradient Boosting: {gb_improve:+.1f}%")

    winner = "Gradient Boosting" if gb_result["r2"] > rf_result["r2"] else "Random Forest"
    print(f"\n  >> Winner by R2: {winner}")
    print()

    # Feature importances
    print_feature_importances(rf_result, FEATURES)
    print_feature_importances(gb_result, FEATURES)


if __name__ == "__main__":
    main()

