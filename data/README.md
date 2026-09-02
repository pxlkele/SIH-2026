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
- **Purpose:** proves the iOS-format ingestion path end-to-end. Too short
  for meaningful tuning.

### `real/ios_drive_2026-08-24.csv`
- **Source:** `2026-08-24_20_49_48_my_iOS_device.csv`
- **Duration:** ~18 s, 739 IMU samples (~41 Hz), 7 GPS fixes
- **Purpose:** short real drive. Bootstraps the filter but too little GPS to
  meaningfully tune noise settings.

### `real/ios_drive_2026-08-29.csv`
- **Source:** `2026-08-29_10_35_46_my_iOS_device.csv`
- **Duration:** ~150 s (2.5 min), 4663 IMU samples (~31 Hz), 52 GPS fixes
- **Purpose:** first log at drive-scale duration; but actual movement was only ~90 m (walking around campus, not driving). Used to set the initial `accel_process_std=2.0`.

### `real/ios_drive_2026-09-02a.csv`
- **Source:** `2026-09-02_17_28_22_my_iOS_device.csv`
- **Duration:** ~7.1 min, 14227 IMU samples (~33 Hz), 431 GPS fixes
- **Movement:** 1.8 km × 1.2 km bounds, ~3.2 km driven, North Bengaluru
- **Purpose:** **first real drive log at driving-scale movement.** Kalman tracks raw GPS to **2.3 m mean drift** across the full drive; RTS-smoothed to **1.7 m**.
- **Missing:** no GPS-outage segment (healthy 1 Hz GPS throughout, max 1s gap).

### `real/ios_drive_2026-09-02b.csv`
- **Source:** `2026-09-02_17_35_41_my_iOS_device.csv`
- **Duration:** ~9.5 min, 18912 IMU samples (~33 Hz), 571 GPS fixes
- **Movement:** 3.2 km × 1.2 km bounds, ~4.7 km driven, North Bengaluru
- **Purpose:** longest real drive log to date. Kalman tracks to **3.0 m mean** (RTS-smoothed to **2.1 m**), path length within 1% of raw GPS.
- **Missing:** same as above — no GPS-outage segment. The tunnel/basement capture remains the biggest data gap for the pitch.

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
