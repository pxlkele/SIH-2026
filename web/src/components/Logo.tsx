export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="10" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      <circle cx="16" cy="16" r="6" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
      <circle cx="16" cy="16" r="2.5" fill="currentColor" />
      <path
        d="M16 4 L16 8 M16 24 L16 28 M4 16 L8 16 M24 16 L28 16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.8"
      />
    </svg>
  );
}

export function Wordmark({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5 text-ink-100">
      <div className="text-accent">
        <Logo size={22} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-semibold tracking-tight">Beacon</span>
        {subtitle && (
          <span className="hidden text-xs font-medium uppercase tracking-widest text-ink-400 sm:inline">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
