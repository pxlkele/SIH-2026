#!/usr/bin/env bash
# Rebuilds osrm/data/bangalore.osrm.* from scratch. Only needed if the
# route/demo area changes, or the data goes stale — the .osrm.* files
# themselves are gitignored (derived binary data, ~300MB) and deployed
# straight to Railway via `railway up`, not through git.
#
# Bounding box is generous "greater Bangalore metro" — every real GPS
# capture so far (data/real/*.csv) falls in central Bangalore, well
# inside it. Adjust BBOX below if the demo moves to a different city.
set -euo pipefail
cd "$(dirname "$0")"

BBOX="77.35,12.75,77.85,13.20"  # min_lon,min_lat,max_lon,max_lat
OSRM_IMAGE="ghcr.io/project-osrm/osrm-backend"

mkdir -p data
if [ ! -f data/southern-zone-latest.osm.pbf ]; then
  echo "Downloading South India extract (~550MB)..."
  curl -L -o data/southern-zone-latest.osm.pbf \
    "https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf"
fi

echo "Clipping to bounding box $BBOX..."
docker run --rm -v "$(pwd)/data:/data" ubuntu:22.04 bash -c "
  apt-get update -qq && apt-get install -y -qq osmium-tool >/dev/null 2>&1
  osmium extract -b $BBOX -o /data/bangalore.osm.pbf /data/southern-zone-latest.osm.pbf --overwrite
"
rm -f data/southern-zone-latest.osm.pbf

echo "Running osrm-extract / partition / customize (car profile, MLD)..."
docker run --rm -v "$(pwd)/data:/data" "$OSRM_IMAGE" osrm-extract -p /opt/car.lua /data/bangalore.osm.pbf
docker run --rm -v "$(pwd)/data:/data" "$OSRM_IMAGE" osrm-partition /data/bangalore.osrm
docker run --rm -v "$(pwd)/data:/data" "$OSRM_IMAGE" osrm-customize /data/bangalore.osrm

echo "Done. data/bangalore.osrm.* is ready for the Dockerfile in this directory."
