import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a forecast date string (YYYY-MM-DD) for display.
 * Returns "Today", "Tomorrow", or a short weekday/date label,
 * keeping date wording consistent across the app.
 */
export function formatForecastDate(dateStr: string): string {
  // Anchor at noon to avoid timezone shifting the calendar day
  const date = new Date(dateStr + "T12:00:00")
  if (isNaN(date.getTime())) return dateStr

  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  if (date.toDateString() === today.toDateString()) return "Today"
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow"

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

const COMPASS_POINTS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
] as const

/**
 * Converts a compass bearing in degrees to a 16-point compass label
 * (e.g. 315 -> "NW"). Wind directions are the direction the wind comes FROM.
 */
export function degreesToCompass(degrees: number): string {
  if (!isFinite(degrees)) return ""
  const normalized = ((degrees % 360) + 360) % 360
  const index = Math.round(normalized / 22.5) % 16
  return COMPASS_POINTS[index]
}

/**
 * Formats a bearing as a combined compass + degrees label, e.g. "NW 315°".
 */
export function formatWindDirection(degrees: number): string {
  if (!isFinite(degrees)) return "—"
  return `${degreesToCompass(degrees)} ${Math.round(degrees)}°`
}
