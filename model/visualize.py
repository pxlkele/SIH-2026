"""Generate folium map HTML from raw + corrected + smoothed path CSVs.

Open the resulting HTML in a browser to screenshot for Aarushi / the pitch
deck.

Design choices for a clean pitch shot:
- Clean grey CartoDB Positron basemap (paths pop instead of drowning
  in colored OSM road tiles).
- Polylines are downsampled to ~1 point / second — the raw filter output
  is jittery at 30-50 Hz, jaggedness distracts from the story.
- Raw GPS: hollow circles so they don't paint over the fused line.
- Smoothed line is drawn thickest so it "wins" the visual hierarchy.
- Optional --snap-corrected calls OSRM to road-match the corrected path
  (the same idea as Aleena's server/mapMatch.js, but done here so the
  screenshot doesn't need her backend running).

Usage:
    python visualize.py <log_dir>
    python visualize.py <log_dir> --snap-corrected     # snap Kalman path to roads
    python visualize.py <log_dir> --out map.html
"""

from __future__ import annotations

import argparse
from pathlib import Path

import folium
import pandas as pd


# name, filename, color, kind (circle/line), draw weight
LAYERS = [
    ("Raw GPS fixes",           "raw_gps_path.csv",   "#dc2626", "circle", 2),
    ("Kalman-corrected (live)", "corrected_path.csv", "#2563eb", "line",   4),
    ("RTS smoothed (post-run)", "smoothed_path.csv",  "#7c3aed", "line",   6),
]

DEFAULT_SUBSAMPLE_HZ = 1.0   # 1 point per second is enough for a screenshot


def _subsample(df: pd.DataFrame, target_hz: float) -> pd.DataFrame:
    if len(df) < 3 or target_hz <= 0:
        return df
    dt_ms = 1000.0 / target_hz
    keep = [df.iloc[0]]
    last_ts = df.timestamp_ms.iloc[0]
    for _, row in df.iloc[1:-1].iterrows():
        if row.timestamp_ms - last_ts >= dt_ms:
            keep.append(row)
            last_ts = row.timestamp_ms
    keep.append(df.iloc[-1])
    return pd.DataFrame(keep)


def _snap_to_roads(points: list[tuple[float, float]]) -> list[tuple[float, float]] | None:
    """Call the public OSRM match service. Returns snapped (lat, lon) list or None on failure.

    OSRM's demo service caps `/match` at 100 coordinates per request. We chunk
    the path and stitch the results. On any failure we return None so the
    caller can fall back to the raw polyline.
    """
    import urllib.request, urllib.parse, json, ssl
    # macOS Python often lacks a working cert bundle; this is a local dev tool
    # calling a public unauthenticated demo API, so verification adds no security value.
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    # Public OSRM demo caps /match at 10 coordinates — confirmed empirically
    # in Aleena's server/mapMatch.js. Chunks of 10 with 1-point overlap so the
    # snapped segments join cleanly.
    CHUNK = 10
    snapped: list[tuple[float, float]] = []
    # 1-point overlap between chunks so the joins look continuous
    step = CHUNK - 1
    for i in range(0, len(points), step):
        chunk = points[i : i + CHUNK]
        if len(chunk) < 2:
            continue
        coords = ";".join(f"{lon},{lat}" for lat, lon in chunk)
        url = (
            f"https://router.project-osrm.org/match/v1/driving/{coords}"
            f"?geometries=geojson&overview=full&radiuses={';'.join(['50'] * len(chunk))}"
        )
        try:
            with urllib.request.urlopen(url, timeout=10, context=ctx) as resp:
                data = json.loads(resp.read())
        except Exception as e:
            print(f"  OSRM chunk {i}: {e}")
            return None
        if data.get("code") != "Ok":
            print(f"  OSRM chunk {i}: {data.get('message', data.get('code'))}")
            return None
        for match in data.get("matchings", []):
            for lon, lat in match["geometry"]["coordinates"]:
                snapped.append((lat, lon))
    return snapped or None


def make_map(log_dir: Path, out_html: Path, snap_corrected: bool = False) -> None:
    layers = []
    for name, filename, color, kind, weight in LAYERS:
        p = log_dir / filename
        if not p.exists():
            continue
        df = pd.read_csv(p).dropna(subset=["lat", "lon"])
        if df.empty:
            continue
        if kind == "line":
            df = _subsample(df, DEFAULT_SUBSAMPLE_HZ)
        layers.append((name, df, color, kind, weight))

    if not layers:
        raise SystemExit(f"no path CSVs found in {log_dir}")

    snapped_layer = None
    if snap_corrected:
        corrected = next((df for name, df, _, kind, _ in layers if "corrected" in name.lower()), None)
        if corrected is not None:
            pts = list(zip(corrected.lat, corrected.lon))
            print(f"  snapping {len(pts)} points to OSM roads via OSRM...")
            snapped_pts = _snap_to_roads(pts)
            if snapped_pts:
                snapped_layer = pd.DataFrame(snapped_pts, columns=["lat", "lon"])
                print(f"  got {len(snapped_layer)} snapped points")
            else:
                print("  road-snapping failed, skipping")

    all_lat = pd.concat([df.lat for _, df, _, _, _ in layers])
    all_lon = pd.concat([df.lon for _, df, _, _, _ in layers])
    m = folium.Map(
        location=[all_lat.mean(), all_lon.mean()],
        zoom_start=18,
        # Standard OpenStreetMap tiles — actually free, no API key. CartoDB's
        # CDN endpoints started requiring API keys and stamp "API KEY REQUIRED"
        # watermarks on the tiles otherwise. OSM's default tile server is
        # the safe fallback for a dev-tool visualization.
        tiles="https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        attr='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        control_scale=True,
    )
    m.fit_bounds([[all_lat.min(), all_lon.min()], [all_lat.max(), all_lon.max()]])

    for name, df, color, kind, weight in layers:
        fg = folium.FeatureGroup(name=name, show=True)
        if kind == "circle":
            for _, r in df.iterrows():
                folium.CircleMarker(
                    location=[r.lat, r.lon],
                    radius=5, color=color, fill=False, weight=weight,
                    tooltip=name,
                ).add_to(fg)
        else:
            folium.PolyLine(
                df[["lat", "lon"]].values.tolist(),
                color=color, weight=weight, opacity=0.85, tooltip=name,
                smooth_factor=1.5,
            ).add_to(fg)
        fg.add_to(m)

    if snapped_layer is not None:
        fg = folium.FeatureGroup(name="Road-snapped (OSRM)", show=True)
        folium.PolyLine(
            snapped_layer[["lat", "lon"]].values.tolist(),
            color="#059669", weight=7, opacity=0.9, tooltip="Road-snapped (OSRM)",
            smooth_factor=1.5,
        ).add_to(fg)
        fg.add_to(m)

    folium.LayerControl(collapsed=False).add_to(m)

    all_names = [(n, c) for n, _, c, _, _ in layers]
    if snapped_layer is not None:
        all_names.append(("Road-snapped (OSRM)", "#059669"))
    legend_rows = "".join(
        f'<div style="margin:4px 0;"><span style="display:inline-block;width:18px;height:6px;'
        f'background:{color};margin-right:8px;vertical-align:middle;"></span>{name}</div>'
        for name, color in all_names
    )
    legend = f"""
    <div style="position: fixed; top: 20px; right: 20px; z-index:9999;
                background: white; padding: 12px 16px; border: 1px solid #444;
                border-radius: 6px; font: 13px -apple-system, sans-serif;
                box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
      <div style="font-weight:600;margin-bottom:6px;">SIH26168 · Dead Reckoning</div>
      {legend_rows}
    </div>
    """
    m.get_root().html.add_child(folium.Element(legend))

    out_html.parent.mkdir(parents=True, exist_ok=True)
    m.save(str(out_html))


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("log_dir", type=Path)
    p.add_argument("--out", type=Path, default=None)
    p.add_argument("--snap-corrected", action="store_true",
                   help="Snap the Kalman-corrected path to OSM roads via OSRM")
    args = p.parse_args()

    out = args.out or (args.log_dir / "map.html")
    make_map(args.log_dir, out, snap_corrected=args.snap_corrected)
    print(f"wrote {out}")
    print(f"open in browser: file://{out.resolve()}")


if __name__ == "__main__":
    main()
