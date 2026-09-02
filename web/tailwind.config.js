/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        // Path layer colors — pop on both light and projector conditions
        "path-raw": "#ef4444",       // red - raw GPS
        "path-live": "#3b82f6",      // blue - Kalman corrected (live)
        "path-smooth": "#8b5cf6",    // purple - RTS smoothed
        "path-snapped": "#10b981",   // emerald - road-snapped
      },
    },
  },
  plugins: [],
};
