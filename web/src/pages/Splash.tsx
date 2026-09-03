import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LoaderGooeyBlobs } from "@/components/ui/loaders-gooey-blobs";

/**
 * Loader/splash at `/`. Full-black screen, wordmark centered, gooey blob
 * loader at the bottom. Auto-navigates into the app after ~1.8s.
 *
 * When Charvi ships the marketing landing, this splash can either become
 * the entry animation before the landing appears, or the landing can take
 * over `/` entirely.
 */
export default function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => navigate("/app", { replace: true }), 1800);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className="relative flex h-[100dvh] w-screen items-center justify-center overflow-hidden bg-black text-white">
      {/* Centered wordmark: logo + "Beacon" */}
      <div className="flex items-center gap-6 sm:gap-8">
        <img
          src="/logo.png"
          alt="Beacon"
          className="h-20 w-20 select-none sm:h-28 sm:w-28"
          draggable={false}
        />
        <span className="text-5xl font-semibold tracking-tight text-white sm:text-7xl">
          Beacon
        </span>
      </div>

      {/* Gooey blob loader: 40px from bottom border, centered */}
      <div className="absolute inset-x-0 bottom-10 flex items-center justify-center text-white/80">
        <LoaderGooeyBlobs size={12} color="#ffffff" />
      </div>
    </div>
  );
}
