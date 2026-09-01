FROM node:22-slim

# Python for the Kalman filter subprocess (model/serve_stdio.py), plus
# build tools — better-sqlite3 is a native module and compiles from
# source on install (no prebuilt binary for this image's platform).
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY model/requirements.txt model/requirements.txt
RUN pip3 install --break-system-packages --no-cache-dir -r model/requirements.txt

COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev

COPY server/ server/
COPY model/ model/
COPY data_schema.md ./

# On Linux the real interpreter is python3 (unlike Windows dev machines,
# where python3 is a broken Store alias and modelBridge.js defaults to
# plain `python` instead — see server/modelBridge.js).
ENV PYTHON_BIN=python3
EXPOSE 4000

CMD ["node", "server/index.js"]
