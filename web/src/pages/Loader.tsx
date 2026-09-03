import { motion } from "motion/react";
import { LoaderGooeyBlobs } from "@/components/ui/loaders-gooey-blobs";

/** Transient loader shown before the home page reveals. Simple fade,
 *  gooey loader at the bottom. Presentational only — the parent decides
 *  when to swap it out for actual content. */
export function Loader() {
  return (
    <motion.div
      key="loader"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="relative flex h-[100dvh] w-screen items-center justify-center overflow-hidden bg-black text-white"
    >
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

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(59,130,246,0.10) 0%, rgba(0,0,0,0) 55%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.9 }}
        className="pointer-events-none absolute inset-x-0 bottom-10 flex items-center justify-center text-white/85"
      >
        <LoaderGooeyBlobs size={12} color="#ffffff" />
      </motion.div>
    </motion.div>
  );
}
