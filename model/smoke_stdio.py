"""Smoke-test serve_stdio.py by feeding synth_log.csv through it as JSON.

Sanity checks:
  1. every input line produces one output line
  2. no {"error": ...} lines
  3. final RUNNING position matches the last row of output/corrected_path.csv
     produced by the batch runner (to within floating-point tolerance)

Requires: python3 run_on_log.py synth/synth_log.csv has already been run
so output/corrected_path.csv exists.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).parent
LOG = HERE / "synth" / "synth_log.csv"
BATCH_OUT = HERE / "output" / "corrected_path.csv"


def csv_rows_as_json(path: Path):
    df = pd.read_csv(path)
    for row in df.itertuples(index=False):
        d = row._asdict()
        for k in ("gps_lat", "gps_lon", "gps_accuracy_m"):
            if pd.isna(d[k]):
                d[k] = None
        yield json.dumps(d)


def main() -> int:
    if not BATCH_OUT.exists():
        print(f"missing {BATCH_OUT} — run run_on_log.py first", file=sys.stderr)
        return 2

    proc = subprocess.Popen(
        [sys.executable, str(HERE / "serve_stdio.py")],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, cwd=HERE,
    )
    payload = "\n".join(csv_rows_as_json(LOG)) + "\n"
    stdout, stderr = proc.communicate(payload)

    if proc.returncode != 0:
        print("serve_stdio exited non-zero", file=sys.stderr)
        print(stderr, file=sys.stderr)
        return proc.returncode

    lines = [l for l in stdout.splitlines() if l.strip()]
    in_count = sum(1 for _ in csv_rows_as_json(LOG))
    assert len(lines) == in_count, f"line count mismatch: in={in_count} out={len(lines)}"
    print(f"line count OK: {in_count} in / {len(lines)} out")

    error_lines = [l for l in lines if '"error"' in l]
    assert not error_lines, f"got {len(error_lines)} error lines: {error_lines[:3]}"
    print("no error lines")

    running = [json.loads(l) for l in lines if json.loads(l).get("state") == "running"]
    assert running, "no RUNNING samples emitted"
    last = running[-1]

    batch = pd.read_csv(BATCH_OUT)
    batch_last = batch.iloc[-1]

    dlat = abs(last["lat"] - batch_last["lat"])
    dlon = abs(last["lon"] - batch_last["lon"])
    assert dlat < 1e-9 and dlon < 1e-9, f"batch/stream mismatch: dlat={dlat} dlon={dlon}"
    print(f"final position matches batch: lat={last['lat']:.7f} lon={last['lon']:.7f}")
    print("smoke test PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
