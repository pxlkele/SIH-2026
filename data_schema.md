# Sensor Data Schema

**Status:** Locked. Build against this starting today with synthetic/dummy rows — do not wait for real car data.

## Format

CSV. One row per sensor reading. UTF-8, no BOM. Header row required.

## Columns

| Column           | Type  | Unit / Notes                                            |
|------------------|-------|---------------------------------------------------------|
| `timestamp_ms`   | int   | Unix epoch milliseconds, UTC                            |
| `accel_x`        | float | m/s², device frame                                      |
| `accel_y`        | float | m/s², device frame                                      |
| `accel_z`        | float | m/s², device frame                                      |
| `gyro_x`         | float | rad/s, device frame                                     |
| `gyro_y`         | float | rad/s, device frame                                     |
| `gyro_z`         | float | rad/s, device frame                                     |
| `gps_lat`        | float | nullable — empty when GPS unavailable                   |
| `gps_lon`        | float | nullable — empty when GPS unavailable                   |
| `gps_accuracy_m` | float | nullable — GPS's own reported error radius, in meters   |

Nullable = leave the cell empty (`,,`), do **not** forward-fill. Downstream code needs to tell real fixes from gaps.

## Locked decisions

- **Sampling rate:** 50 Hz for accel/gyro (standard for IMU work; matches public datasets like RIDI/RoNIN if we supplement). GPS logs at its natural ~1 Hz — leave GPS columns null on rows without a fix.
- **Coordinate frame:** device-frame raw values. World-frame (gravity-aligned) requires an orientation estimate; the Kalman filter step handles frame alignment. Do not rotate at capture time.

## Example (5 rows)

```csv
timestamp_ms,accel_x,accel_y,accel_z,gyro_x,gyro_y,gyro_z,gps_lat,gps_lon,gps_accuracy_m
1735024800000,0.12,-0.03,9.81,0.001,-0.002,0.000,12.9716,77.5946,5.2
1735024800020,0.15,-0.02,9.80,0.002,-0.001,0.001,,,
1735024800040,0.11,-0.04,9.79,0.001,-0.003,0.000,,,
1735024800060,0.13,-0.05,9.82,0.000,-0.002,0.001,,,
1735024800080,0.14,-0.03,9.80,0.001,-0.001,0.000,12.9716,77.5946,5.1
```

See `example_sensor_data.csv` in this folder for a copy-pasteable file.
