import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";

/* ---------- Button ---------- */

type ButtonVariant = "primary" | "secondary" | "ghost";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium " +
  "transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-bright";

const btnVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] " +
    "hover:bg-accent-bright active:translate-y-px",
  secondary:
    "border border-ink-600 bg-ink-800/60 text-ink-100 backdrop-blur " +
    "hover:border-ink-500 hover:bg-ink-700/70 active:translate-y-px",
  ghost:
    "text-ink-200 hover:bg-ink-700/40",
};

const btnSizes = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4",
  lg: "h-11 px-5",
};

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: keyof typeof btnSizes;
}

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "primary", size = "md", className = "", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`${btnBase} ${btnVariants[variant]} ${btnSizes[size]} ${className}`}
      {...props}
    />
  );
});

interface LinkBtnProps extends LinkProps {
  variant?: ButtonVariant;
  size?: keyof typeof btnSizes;
  children: ReactNode;
  className?: string;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: LinkBtnProps) {
  return (
    <Link
      className={`${btnBase} ${btnVariants[variant]} ${btnSizes[size]} ${className}`}
      {...props}
    >
      {children}
    </Link>
  );
}

/* ---------- Panel: dashboard-style card ---------- */

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "rounded-lg border border-ink-700 bg-ink-800/80 shadow-panel backdrop-blur " +
        className
      }
    >
      {children}
    </div>
  );
}

/* ---------- Pill / status badge ---------- */

type PillTone = "neutral" | "ok" | "warn" | "alert" | "accent";

const pillTones: Record<PillTone, string> = {
  neutral: "border-ink-600 bg-ink-800/70 text-ink-200",
  ok:      "border-status-ok/40 bg-status-ok/10 text-status-ok",
  warn:    "border-status-warn/40 bg-status-warn/10 text-status-warn",
  alert:   "border-status-alert/50 bg-status-alert/15 text-status-alert",
  accent:  "border-accent-line bg-accent-soft text-accent-bright",
};

export function Pill({
  tone = "neutral",
  children,
  className = "",
  dot = false,
}: {
  tone?: PillTone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={
        `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ` +
        `uppercase tracking-wider ${pillTones[tone]} ${className}`
      }
    >
      {dot && (
        <span
          className={
            "h-1.5 w-1.5 animate-pulse rounded-full " +
            (tone === "ok" ? "bg-status-ok"
              : tone === "warn" ? "bg-status-warn"
              : tone === "alert" ? "bg-status-alert"
              : tone === "accent" ? "bg-accent-bright"
              : "bg-ink-400")
          }
        />
      )}
      {children}
    </span>
  );
}

/* ---------- Section heading ---------- */

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-bright">
      {children}
    </div>
  );
}
