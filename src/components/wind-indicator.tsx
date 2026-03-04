'use client';

interface WindIndicatorProps {
  direction: number; // degrees (0-360)
  size?: number; // size in pixels
}

/**
 * Visual wind direction indicator (arrow pointing towards wind direction)
 */
export function WindIndicator({ direction, size = 20 }: WindIndicatorProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ transform: `rotate(${direction}deg)` }}
      className="inline-block"
    >
      <path
        d="M12 2 L16 10 L12 8 L8 10 Z"
        fill="currentColor"
        className="text-primary"
      />
      <circle cx="12" cy="12" r="2" fill="currentColor" className="text-muted-foreground" />
    </svg>
  );
}
