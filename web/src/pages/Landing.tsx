import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-2xl space-y-8 text-center">
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-widest text-neutral-500">
            SIH 2026 · Problem SIH26168
          </div>
          <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
            Intelligent Dead Reckoning
          </h1>
          <p className="mt-4 text-lg text-neutral-400">
            Continuous positioning where GPS fails.
            <br />
            Tunnels, basements, urban canyons — no vehicle hardware required.
          </p>
        </div>

        <div className="flex justify-center gap-3">
          <Link
            to="/demo"
            className="rounded-md bg-blue-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-400"
          >
            See Demo
          </Link>
          <Link
            to="/app"
            className="rounded-md border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-200 transition hover:border-neutral-500"
          >
            Open App
          </Link>
        </div>

        <div className="pt-6 text-xs text-neutral-500">
          Kalman filter · IMU + GPS fusion · classical, deterministic, on-device
        </div>
      </div>
    </div>
  );
}
