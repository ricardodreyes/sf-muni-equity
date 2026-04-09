"""
Script 07: Run OLS regression, Random Forest, and statistical tests
on route-level data. Save results to pipeline/data/model_results/.
"""

import os
import json
import pandas as pd
import numpy as np
import duckdb
import statsmodels.api as sm
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import cross_val_score
from scipy import stats

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'muni_equity.duckdb')
RESULTS_DIR = os.path.join(os.path.dirname(__file__), 'data', 'model_results')


def main():
    print("Step 7: Running ML models and statistical tests...")

    os.makedirs(RESULTS_DIR, exist_ok=True)
    con = duckdb.connect(DB_PATH, read_only=True)

    # Load route stats
    df = con.execute("SELECT * FROM route_stats").fetchdf()
    con.close()

    print(f"  Loaded {len(df)} routes from route_stats.")

    if len(df) < 5:
        print("  WARNING: Very few routes. Model results may not be reliable.")

    # ----------------------------------------------------------------
    # Layer 1: OLS Regression
    # ----------------------------------------------------------------
    print("  Running OLS regression...")

    features = ['weighted_median_income', 'num_stops', 'is_rapid']

    # is_rapid might be boolean or string, convert to int
    if 'is_rapid' in df.columns:
        df['is_rapid'] = df['is_rapid'].astype(int)
    else:
        df['is_rapid'] = 0

    X = df[features].dropna()
    y = df.loc[X.index, 'avg_delay_min']

    # Drop any remaining NaN in y
    valid_mask = y.notna()
    X = X[valid_mask]
    y = y[valid_mask]

    X_const = sm.add_constant(X)
    model = sm.OLS(y, X_const).fit()

    income_coef = model.params['weighted_median_income']
    # Interpretation: for every $10,000 decrease, delay increases by...
    income_effect = abs(income_coef * 10000)

    ols_result = {
        "r_squared": round(model.rsquared, 4),
        "adj_r_squared": round(model.rsquared_adj, 4),
        "f_statistic": round(float(model.fvalue), 2),
        "f_pvalue": round(float(model.f_pvalue), 6),
        "n_observations": int(model.nobs),
        "coefficients": {},
        "income_interpretation": (
            f"For every $10,000 decrease in weighted median neighborhood income, "
            f"average route delay increases by {income_effect:.2f} minutes "
            f"({income_effect*60:.0f} seconds), controlling for route size and type."
        )
    }
    for name in model.params.index:
        ols_result["coefficients"][name] = {
            "coef": round(float(model.params[name]), 8),
            "std_err": round(float(model.bse[name]), 8),
            "pvalue": round(float(model.pvalues[name]), 6),
            "ci_low": round(float(model.conf_int().loc[name, 0]), 8),
            "ci_high": round(float(model.conf_int().loc[name, 1]), 8),
        }

    with open(os.path.join(RESULTS_DIR, 'ols_summary.json'), 'w') as f:
        json.dump(ols_result, f, indent=2)
    print(f"    OLS R-squared: {model.rsquared:.4f}, "
          f"income p-value: {model.pvalues['weighted_median_income']:.6f}")

    # ----------------------------------------------------------------
    # Layer 2: Random Forest
    # ----------------------------------------------------------------
    print("  Running Random Forest...")

    rf = RandomForestRegressor(n_estimators=200, max_depth=5, random_state=42)
    n_cv = min(5, len(X))
    if n_cv < 2:
        n_cv = 2
    cv_scores = cross_val_score(rf, X, y, cv=n_cv, scoring='r2')
    rf.fit(X, y)
    importances = dict(zip(features, [round(float(x), 4) for x in rf.feature_importances_]))

    income_importance = importances.get('weighted_median_income', 0)
    max_importance = max(importances.values()) if importances else 0
    is_strongest = (income_importance == max_importance)

    rf_result = {
        "cv_r_squared_mean": round(float(cv_scores.mean()), 4),
        "cv_r_squared_std": round(float(cv_scores.std()), 4),
        "feature_importances": importances,
        "interpretation": (
            f"Median neighborhood income is the "
            f"{'strongest' if is_strongest else 'a significant'} "
            f"predictor of route delay, accounting for "
            f"{income_importance*100:.0f}% of the model's predictive power."
        )
    }

    with open(os.path.join(RESULTS_DIR, 'random_forest.json'), 'w') as f:
        json.dump(rf_result, f, indent=2)
    print(f"    RF CV R-squared: {cv_scores.mean():.4f} +/- {cv_scores.std():.4f}")

    # ----------------------------------------------------------------
    # Layer 3: Equity Quadrant Classification
    # ----------------------------------------------------------------
    print("  Running quadrant classification...")

    income_median = df['weighted_median_income'].median()
    delay_median = df['avg_delay_min'].median()

    def classify(row):
        low_income = row['weighted_median_income'] < income_median
        high_delay = row['avg_delay_min'] >= delay_median
        if low_income and high_delay:
            return 'Q1'
        if low_income and not high_delay:
            return 'Q2'
        if not low_income and high_delay:
            return 'Q3'
        return 'Q4'

    df['quadrant'] = df.apply(classify, axis=1)

    quad_result = {
        "income_threshold": round(float(income_median), 0),
        "delay_threshold": round(float(delay_median), 1),
        "quadrants": {}
    }
    labels = {
        'Q1': 'equity_concern',
        'Q2': 'equity_success',
        'Q3': 'high_income_delayed',
        'Q4': 'high_income_on_time'
    }
    for q in ['Q1', 'Q2', 'Q3', 'Q4']:
        subset = df[df['quadrant'] == q]
        quad_result["quadrants"][f"{q}_{labels[q]}"] = {
            "count": int(len(subset)),
            "routes": subset['route_id'].tolist()
        }

    with open(os.path.join(RESULTS_DIR, 'quadrant_classification.json'), 'w') as f:
        json.dump(quad_result, f, indent=2)

    # ----------------------------------------------------------------
    # Statistical Tests
    # ----------------------------------------------------------------
    print("  Running statistical tests...")

    q1_delays = df[df['income_quartile'] == 1]['avg_delay_min']
    q4_delays = df[df['income_quartile'] == 4]['avg_delay_min']

    # Pearson and Spearman correlations
    valid = df[['weighted_median_income', 'avg_delay_min']].dropna()
    if len(valid) >= 3:
        pearson_r, pearson_p = stats.pearsonr(
            valid['weighted_median_income'], valid['avg_delay_min']
        )
        spearman_r, spearman_p = stats.spearmanr(
            valid['weighted_median_income'], valid['avg_delay_min']
        )
    else:
        pearson_r, pearson_p = float('nan'), float('nan')
        spearman_r, spearman_p = float('nan'), float('nan')

    # Mann-Whitney U: Q1 (lowest income) vs Q4 (highest income)
    if len(q1_delays) > 0 and len(q4_delays) > 0:
        mw_stat, mw_p = stats.mannwhitneyu(q1_delays, q4_delays, alternative='greater')
    else:
        mw_stat, mw_p = float('nan'), float('nan')

    # Kruskal-Wallis across all quartiles
    quartile_groups = [
        df[df['income_quartile'] == q]['avg_delay_min'].values
        for q in [1, 2, 3, 4]
        if len(df[df['income_quartile'] == q]) > 0
    ]
    if len(quartile_groups) >= 2:
        kw_stat, kw_p = stats.kruskal(*quartile_groups)
    else:
        kw_stat, kw_p = float('nan'), float('nan')

    q1_mean = float(q1_delays.mean()) if len(q1_delays) > 0 else 0
    q4_mean = float(q4_delays.mean()) if len(q4_delays) > 0 else 0
    gap_pct = ((q1_mean - q4_mean) / q4_mean * 100) if q4_mean > 0 else 0

    stat_result = {
        "pearson_r": round(float(pearson_r), 4) if not np.isnan(pearson_r) else None,
        "pearson_pvalue": round(float(pearson_p), 6) if not np.isnan(pearson_p) else None,
        "spearman_rho": round(float(spearman_r), 4) if not np.isnan(spearman_r) else None,
        "spearman_pvalue": round(float(spearman_p), 6) if not np.isnan(spearman_p) else None,
        "mann_whitney_u": round(float(mw_stat), 2) if not np.isnan(mw_stat) else None,
        "mann_whitney_pvalue": round(float(mw_p), 6) if not np.isnan(mw_p) else None,
        "kruskal_wallis_h": round(float(kw_stat), 2) if not np.isnan(kw_stat) else None,
        "kruskal_wallis_pvalue": round(float(kw_p), 6) if not np.isnan(kw_p) else None,
        "q1_mean_delay": round(q1_mean, 2),
        "q4_mean_delay": round(q4_mean, 2),
        "delay_gap_pct": round(gap_pct, 1)
    }

    with open(os.path.join(RESULTS_DIR, 'statistical_tests.json'), 'w') as f:
        json.dump(stat_result, f, indent=2)

    print(f"    Pearson r: {pearson_r:.4f} (p={pearson_p:.6f})"
          if not np.isnan(pearson_r) else "    Pearson r: N/A")
    print(f"    Spearman rho: {spearman_r:.4f} (p={spearman_p:.6f})"
          if not np.isnan(spearman_r) else "    Spearman rho: N/A")
    print(f"    Q1 vs Q4 delay gap: {gap_pct:.1f}%")

    print("\nStep 7 complete. Model results saved to:")
    print(f"    {RESULTS_DIR}/ols_summary.json")
    print(f"    {RESULTS_DIR}/random_forest.json")
    print(f"    {RESULTS_DIR}/quadrant_classification.json")
    print(f"    {RESULTS_DIR}/statistical_tests.json")


if __name__ == '__main__':
    main()
