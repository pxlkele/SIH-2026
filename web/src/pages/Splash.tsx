import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { LoaderGooeyBlobs } from "@/components/ui/loaders-gooey-blobs";

/**
 * Home at `/`. Persistent brand landing — logo + wordmark fade in, gooey
 * loader animates at the bottom. Tap anywhere to enter the app.
 * No auto-navigate — this IS the home page, not a transient splash.
 */
export default function Splash() {
  const navigate = useNavigate();

  const enter = () => navigate("/app");

  return (
    <button
      onClick={enter}
      aria-label="Enter Beacon"
      className="relative flex h-[100dvh] w-screen items-center justify-center overflow-hidden bg-black text-white outline-none focus-visible:ring-2 focus-visible:ring-white/30"
    >
      {/* Centered wordmark: logo (left) + "Beacon" (right) */}
      <div className="pointer-events-none flex items-center gap-5 sm:gap-8">
        <motion.img
          src="/logo.png"
          alt=""
          draggable={false}
          className="h-20 w-20 select-none sm:h-28 sm:w-28"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
        <motion.span
          className="block text-5xl font-semibold tracking-tight text-white sm:text-7xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, ease: "easeOut", delay: 0.15 }}
        >
          Beacon
        </motion.span>
      </div>

      {/* Subtle depth behind the mark */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(59,130,246,0.10) 0%, rgba(0,0,0,0) 55%)",
        }}
      />

      {/* Gooey blob loader — permanent, animating, 40px from bottom */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.9 }}
        className="pointer-events-none absolute inset-x-0 bottom-10 flex flex-col items-center justify-center gap-3 text-white/85"
      >
        <LoaderGooeyBlobs size={12} color="#ffffff" />
        <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/50">
          Tap to enter
        </span>
      </motion.div>
    </button>
  );
}
