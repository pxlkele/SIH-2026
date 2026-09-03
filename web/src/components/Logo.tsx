/** Beacon brand mark, served as `/logo.png` (rendered from the design source
 *  by `scripts/gen_icons.py`). Kept as a single component so the wordmark
 *  in every header stays consistent. */

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <img
      src="/logo.png"
      alt=""
      width={size}
      height={size}
      className="block select-none"
      draggable={false}
    />
  );
}

export function Wordmark({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5 text-ink-100">
      <Logo size={22} />
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
