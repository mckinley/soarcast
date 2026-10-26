/**
 * The cloud and the wing climbing under it, the way a thermal day looks
 * from launch. The cloud is in the text color, the wing in the accent.
 * Also the app icon (scripts/generate-icons-svg.mjs writes public/*.svg).
 */
export function LogoMark({ className = 'size-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path
        d="M17.5 16.5H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"
        className="stroke-foreground"
      />
      <path d="M7.5 22.4C8.3 20.5 15.7 20.5 16.5 22.4" className="stroke-primary" />
    </svg>
  );
}

/** The mark and the name, as in the top bar. */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <LogoMark />
      <span className="text-lg font-semibold">SoarCast</span>
    </span>
  );
}
