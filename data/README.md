# Real sensor logs

Schema-conformant sensor CSVs — safe to feed to `model/run_on_log.py`,
`model/serve_stdio.py`, or Aleena's `POST /replay/:socketId` endpoint.

## Layout

```
data/
├── README.md                       # you are here
└── real/
    ├── ios_test_2026-08-24.csv     # first iOS capture (see notes below)
    └── output/                     # last run's raw + corrected paths
```

## What lives here

Every file under `real/` conforms to `../data_schema.md` — 10 columns,
device-frame raw values, GPS nulled on rows without a fresh fix (never
forward-filled). Aleena's backend accepts these directly.

## Files

### `real/ios_test_2026-08-24.csv`
- **Source:** `2026-08-24_19_54_07_my_iOS_device.csv` from a SensorLog-style
  iOS export
- **Adapter:** `model/adapters/ios_sensorlog.py`
- **Duration:** ~1.5 seconds, 45 IMU samples, 2 GPS fixes
- **Purpose:** proves the iOS-format ingestion path end-to-end. **Too short
  for meaningful tuning** — replace with a full drive log when available.

## Adding a new real log

If the source is iOS SensorLog format (columns like `accelerometerAccelerationX(G)`,
`locationTimestamp_since1970(s)`, etc.):

```bash
python -m model.adapters.ios_sensorlog <source.csv> data/real/<name>.csv
```

The adapter handles:
- G → m/s² conversion on accel
- seconds-since-1970 → Unix ms
- GPS forward-fill removal (only rows where `locationTimestamp_since1970`
  changed are treated as fresh fixes; the rest get nulled)
- Sentinel/garbage GPS filtering (accuracy < 0 or > 500 m dropped)

For other source formats (Android SensorLogger, Angad's custom rig, etc.)
add another module under `model/adapters/` following the same pattern.

## For Aleena

The files in `real/` are ready to POST at `/replay/:socketId` (or stream
sample-by-sample over the socket). No further preprocessing needed —
`model/serve_stdio.py` consumes them directly.
