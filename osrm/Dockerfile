FROM ghcr.io/project-osrm/osrm-backend

# Preprocessed MLD data only — not the source .osm.pbf (see build-extract.sh
# for how this was generated; the .osrm.* files are the runtime artifact).
COPY data/bangalore.osrm* /data/

EXPOSE 5000
CMD ["osrm-routed", "--algorithm", "mld", "--max-matching-size", "100", "/data/bangalore.osrm"]
