/**
 * Lapse rate math and the windgram's lapse-rate colors.
 *
 * The colors are the RASP windgram's (TJ Olney and Dr. Jack Glendening),
 * which canadarasp.com and the PNW windgrams also use, so a pilot who reads
 * those reads ours: the same breaks in °C of cooling per 1000 ft and the same
 * colors. Dry air cools 3 °C per 1000 ft as it rises, so a layer cooling that
 * fast or faster (red) lets thermals rise freely; warm colors down to tan are
 * conditionally unstable; blue is stable; grey is an inversion that caps them.
 */

/**
 * Lapse rate between two heights, as cooling per 1000 ft (positive when the
 * air cools with height, negative in an inversion)
 * @returns °C/1000ft, or null if the upper height is not above the lower
 */
export function calculateLapseRateBetweenLevels(
  tempLower: number,
  tempUpper: number,
  heightLower: number,
  heightUpper: number,
): number | null {
  const heightDiffMeters = heightUpper - heightLower;
  if (heightDiffMeters <= 0) return null;

  const heightDiffFeet = heightDiffMeters * 3.28084;
  const tempDiff = tempLower - tempUpper;

  return (tempDiff / heightDiffFeet) * 1000;
}

export type LapseGroup = 'unstable' | 'conditional' | 'stable' | 'inversion';

export interface LapseBand {
  /** Lowest cooling rate in the band, °C/1000ft */
  min: number;
  color: string;
  group: LapseGroup;
}

/** RASP windgram bands, lowest cooling rate first */
export const LAPSE_BANDS: readonly LapseBand[] = [
  { min: -Infinity, color: 'rgb(153, 153, 153)', group: 'inversion' },
  { min: -0.5, color: 'rgb(204, 204, 204)', group: 'inversion' },
  { min: 0, color: 'rgb(128, 128, 230)', group: 'stable' },
  { min: 1.2, color: 'rgb(250, 202, 177)', group: 'conditional' },
  { min: 1.5, color: 'rgb(204, 191, 255)', group: 'conditional' },
  { min: 2, color: 'rgb(255, 150, 255)', group: 'conditional' },
  { min: 2.5, color: 'rgb(255, 120, 0)', group: 'conditional' },
  { min: 3, color: 'rgb(255, 61, 61)', group: 'unstable' },
];

export const LAPSE_GROUP_LABEL: Record<LapseGroup, string> = {
  unstable: 'Unstable',
  conditional: 'Conditionally unstable',
  stable: 'Stable',
  inversion: 'Inversion',
};

/** The band a cooling rate (°C/1000ft) falls in */
export function lapseBand(rate: number): LapseBand {
  for (let i = LAPSE_BANDS.length - 1; i > 0; i--) {
    if (rate >= LAPSE_BANDS[i].min) return LAPSE_BANDS[i];
  }
  return LAPSE_BANDS[0];
}

/** What a band means for thermals, in a pilot's words */
export function lapseMeaning(rate: number): string {
  if (rate >= 3) return 'unstable, strong thermals';
  if (rate >= 1.5) return 'good for thermals';
  if (rate >= 1.2) return 'weak thermals';
  if (rate >= 0) return 'stable, thermals stop';
  return 'inversion, thermals stop';
}
