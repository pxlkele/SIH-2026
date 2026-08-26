"""JSON-per-line stdio server around SessionStepper.

Aleena's Node backend spawns this once per session:
    child = spawn("python3", ["serve_stdio.py"])

Wire format:
  IN  : one JSON object per line on stdin — the fields from the CSV schema
  OUT : one JSON object per line on stdout — StepResult

Errors on a single line produce {"error": "...", "line_no": N} on stdout;
the process keeps running so one bad row doesn't kill the session.

Flush after every write so Node sees output immediately (no buffering).
"""

from __future__ import annotations

import json
import sys

from ingest import Sample
from stepper import SessionStepper

REQUIRED_FIELDS = ("timestamp_ms", "accel_x", "accel_y", "accel_z",
                   "gyro_x", "gyro_y", "gyro_z")


def parse_sample(payload: dict) -> Sample:
    missing = [f for f in REQUIRED_FIELDS if f not in payload]
    if missing:
        raise ValueError(f"missing fields: {missing}")
    return Sample(
        timestamp_ms=int(payload["timestamp_ms"]),
        accel_x=float(payload["accel_x"]),
        accel_y=float(payload["accel_y"]),
        accel_z=float(payload["accel_z"]),
        gyro_x=float(payload["gyro_x"]),
        gyro_y=float(payload["gyro_y"]),
        gyro_z=float(payload["gyro_z"]),
        gps_lat=_optional_float(payload.get("gps_lat")),
        gps_lon=_optional_float(payload.get("gps_lon")),
        gps_accuracy_m=_optional_float(payload.get("gps_accuracy_m")),
    )


def _optional_float(v) -> float | None:
    if v is None or v == "":
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if f != f else f  # NaN check


def main() -> None:
    stepper = SessionStepper()
    for line_no, raw in enumerate(sys.stdin, start=1):
        raw = raw.strip()
        if not raw:
            continue
        try:
            payload = json.loads(raw)
            sample = parse_sample(payload)
            result = stepper.step(sample)
            out = result.to_dict()
        except Exception as e:  # noqa: BLE001 — keep the session alive
            out = {"error": str(e), "line_no": line_no}
        sys.stdout.write(json.dumps(out) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
