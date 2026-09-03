/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontFeatureSettings: {
        // enabled by default via CSS; kept here for reference
      },
      colors: {
        // Neutral scale — the entire UI lives here. Restrained.
        ink: {
          950: "#07090d",
          900: "#0b0e13",
          800: "#111319",
          700: "#181b23",
          600: "#242832",
          500: "#3a3f4b",
          400: "#5c6270",
          300: "#8b91a0",
          200: "#c4c8d1",
          100: "#e5e7ed",
        },
        // Single accent for the product. Not a rainbow.
        accent: {
          DEFAULT: "#3b82f6",
          bright:  "#60a5fa",
          soft:    "rgba(59,130,246,0.12)",
          line:    "rgba(59,130,246,0.35)",
        },
        // Data-layer colors — used ONLY for paths on the map.
        path: {
          raw:     "#ef4444",   // red
          live:    "#3b82f6",   // blue
          smooth:  "#8b5cf6",   // purple
          snapped: "#10b981",   // emerald
        },
        // Status colors — used sparingly.
        status: {
          ok:    "#10b981",
          warn:  "#f59e0b",
          alert: "#ef4444",
        },
      },
      boxShadow: {
        "panel": "0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px rgba(0,0,0,0.4)",
        "raised": "0 1px 0 rgba(255,255,255,0.05) inset, 0 12px 32px rgba(0,0,0,0.5)",
      },
      backgroundImage: {
        "grid-fade": "radial-gradient(ellipse at top, rgba(59,130,246,0.08), transparent 60%)",
      },
    },
  },
  plugins: [],
};
