/**
 * Client-side session log — stores every navigation session locally in
 * IndexedDB (per browser, ~50 MB quota by default, no server round-trip).
 *
 * A session is:
 *   { id, startedAt, endedAt, destination?, samples: [{t, lat, lon, mode?}] }
 *
 * Samples are subsampled to 1 Hz on ingest — plenty for a Strava-style
 * playback line and keeps a 10-min drive under ~8 KB per session.
 *
 * Exported as CSV on demand (Blob download, no dependency).
 */

const DB_NAME = "beacon";
const DB_VERSION = 1;
const STORE = "sessions";
const SAMPLE_INTERVAL_MS = 1000;   // 1 Hz subsample

export interface SessionSample {
  t: number;           // ms since session start
  lat: number;
  lon: number;
  mode?: string;       // motion classifier output at that time, if known
}

export interface Session {
  id: string;
  startedAt: number;   // epoch ms
  endedAt?: number;    // epoch ms, undefined = still recording
  destination?: { name: string; lat: number; lon: number };
  samples: SessionSample[];
}

export interface SessionSummary {
  id: string;
  startedAt: number;
  endedAt?: number;
  destinationName?: string;
  distanceM: number;
  durationS: number;
  sampleCount: number;
}

/* ----- IndexedDB primitives ----- */

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("startedAt", "startedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function put(session: Session): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function get(id: string): Promise<Session | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as Session) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function listAll(): Promise<Session[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as Session[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

async function del(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ----- Live session recorder ----- */

/**
 * Recorder that buffers 1 Hz samples in memory and flushes to IndexedDB
 * whenever we've accumulated ~10 seconds OR when the session ends.
 * Cheap on writes, resilient to page close (mostly).
 */
export class SessionRecorder {
  private session: Session;
  private lastSampleAt = 0;
  private lastFlushAt = 0;
  private flushIntervalMs = 10_000;

  constructor(destination?: { name: string; lat: number; lon: number }) {
    this.session = {
      id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      startedAt: Date.now(),
      destination,
      samples: [],
    };
  }

  get id(): string {
    return this.session.id;
  }

  /** Add a fused-position sample. Called at the fusion stream rate — we
   *  throttle to 1 Hz here so storage stays small. */
  sample(lat: number, lon: number, mode?: string): void {
    const now = Date.now();
    if (now - this.lastSampleAt < SAMPLE_INTERVAL_MS) return;
    this.lastSampleAt = now;
    this.session.samples.push({
      t: now - this.session.startedAt,
      lat,
      lon,
      mode,
    });
    if (now - this.lastFlushAt > this.flushIntervalMs) {
      this.lastFlushAt = now;
      void put({ ...this.session });   // fire-and-forget
    }
  }

  /** Close and persist. Idempotent. */
  async end(): Promise<Session> {
    if (!this.session.endedAt) this.session.endedAt = Date.now();
    await put({ ...this.session });
    return this.session;
  }
}

/* ----- Queries + export ----- */

export async function listSessions(): Promise<SessionSummary[]> {
  const all = await listAll();
  const summaries = all.map(summarize);
  summaries.sort((a, b) => b.startedAt - a.startedAt);
  return summaries;
}

export async function getSession(id: string): Promise<Session | null> {
  return get(id);
}

export async function deleteSession(id: string): Promise<void> {
  return del(id);
}

/**
 * Total storage used by all sessions — approximate, based on serialised JSON.
 * Useful for a "Storage: N MB" line in settings later.
 */
export async function totalStorageBytes(): Promise<number> {
  const all = await listAll();
  return JSON.stringify(all).length;
}

/** Trigger a browser download of the session as CSV. */
export async function exportSessionAsCsv(id: string): Promise<void> {
  const s = await get(id);
  if (!s) return;
  const rows = ["t_ms_from_start,lat,lon,mode"];
  for (const sample of s.samples) {
    rows.push(
      `${sample.t},${sample.lat.toFixed(6)},${sample.lon.toFixed(6)},${sample.mode ?? ""}`,
    );
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `beacon_${new Date(s.startedAt).toISOString().replace(/[:.]/g, "-")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ----- Helpers ----- */

function summarize(s: Session): SessionSummary {
  let dist = 0;
  for (let i = 1; i < s.samples.length; i++) {
    dist += haversine(s.samples[i - 1], s.samples[i]);
  }
  const durationS = s.endedAt ? (s.endedAt - s.startedAt) / 1000 : 0;
  return {
    id: s.id,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    destinationName: s.destination?.name,
    distanceM: dist,
    durationS,
    sampleCount: s.samples.length,
  };
}

function haversine(a: SessionSample, b: SessionSample): number {
  const R = 6_378_137;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
