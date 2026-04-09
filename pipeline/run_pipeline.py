"""
Pipeline orchestrator: runs all 8 scripts in sequence.
"""

import subprocess
import sys
import time
import os

SCRIPTS = [
    '01_download_data.py',
    '02_parse_and_filter.py',
    '03_spatial_join.py',
    '04_fetch_income.py',
    '05_compute_delays.py',
    '06_build_route_stats.py',
    '07_ml_models.py',
    '08_export_site_data.py',
]


def main():
    pipeline_dir = os.path.dirname(os.path.abspath(__file__))
    print("=" * 60)
    print("SF Muni Transit Equity - Data Pipeline")
    print("=" * 60)

    start = time.time()
    for i, script in enumerate(SCRIPTS, 1):
        print(f"\n{'=' * 60}")
        print(f"  [{i}/{len(SCRIPTS)}] Running {script}...")
        print(f"{'=' * 60}")
        script_path = os.path.join(pipeline_dir, script)

        if not os.path.exists(script_path):
            print(f"  WARNING: {script} not found. Skipping.")
            continue

        step_start = time.time()
        result = subprocess.run(
            [sys.executable, script_path],
            cwd=pipeline_dir
        )
        step_elapsed = time.time() - step_start

        if result.returncode != 0:
            print(f"\nERROR: {script} failed with exit code {result.returncode}")
            print(f"Pipeline aborted after {step_elapsed:.1f}s on step {i}.")
            sys.exit(1)

        print(f"  Completed {script} in {step_elapsed:.1f}s")

    elapsed = time.time() - start
    print(f"\n{'=' * 60}")
    print(f"Pipeline complete in {elapsed:.1f} seconds.")
    print(f"{'=' * 60}")


if __name__ == '__main__':
    main()
