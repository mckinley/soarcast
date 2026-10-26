/** SoarCast's mark: a paraglider wing and its lines down to the pilot. Also the app icon (public/*.svg). */
export function LogoMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path
        d="M4 13.5C8.5 7.3 23.5 7.3 28 13.5"
        className="stroke-primary"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M6.8 14.6L16 25L25.2 14.6"
        className="stroke-primary"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="16" cy="26.4" r="2.3" className="fill-foreground" />
    </svg>
  );
}

/** The mark and the name, as in the top bar. */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <LogoMark />
      <span className="text-lg font-bold tracking-tight">SoarCast</span>
    </span>
  );
}
