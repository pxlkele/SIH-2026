import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { LoaderGooeyBlobs } from "@/components/ui/loaders-gooey-blobs";

/**
 * Splash at `/`. Full-black screen, brand reveal:
 *
 *   1. Logo drops in with a scale-up + fade  (~600ms, expo-out easing)
 *   2. Wordmark "Beacon" slides in from the left of its final position
 *      + fades, staggered ~180ms after the logo starts
 *   3. Both hold, subtle "breathing" on the logo
 *   4. Gooey loader fades in at the bottom
 *   5. After ~2.4s total we navigate to /app
 *
 * Timings tuned to feel confident and premium — think Linear/Vercel/Warp
 * splash rather than flashy or bouncy.
 */
const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => navigate("/app", { replace: true }), 2400);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className="relative flex h-[100dvh] w-screen items-center justify-center overflow-hidden bg-black text-white">
      {/* Centered wordmark: logo (left) + "Beacon" (right) */}
      <div className="flex items-center gap-5 sm:gap-8">
        <motion.img
          src="/logo.png"
          alt=""
          draggable={false}
          className="h-20 w-20 select-none sm:h-28 sm:w-28"
          initial={{ scale: 0.6, opacity: 0, filter: "blur(6px)" }}
          animate={{
            scale: [0.6, 1.05, 1],
            opacity: 1,
            filter: "blur(0px)",
          }}
          transition={{
            duration: 0.75,
            ease: EASE_OUT_EXPO,
            times: [0, 0.72, 1],
          }}
        />
        <div className="overflow-hidden">
          <motion.span
            className="block text-5xl font-semibold tracking-tight text-white sm:text-7xl"
            initial={{ x: -60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{
              duration: 0.65,
              ease: EASE_OUT_EXPO,
              delay: 0.18,
            }}
          >
            Beacon
          </motion.span>
        </div>
      </div>

      {/* Subtle radial vignette behind the mark for depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(59,130,246,0.10) 0%, rgba(0,0,0,0) 55%)",
        }}
      />

      {/* Gooey blob loader: 40px from bottom border, centered, fades in last */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 1.1 }}
        className="absolute inset-x-0 bottom-10 flex items-center justify-center text-white/85"
      >
        <LoaderGooeyBlobs size={12} color="#ffffff" />
      </motion.div>
    </div>
  );
}
