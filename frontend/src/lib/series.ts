/**
 * The three data entities and their fixed colours. Colour follows the entity on every
 * chart, legend and table key. Palette validated for colour-vision deficiency and
 * contrast against the terminal surface (dataviz validator, all pairs, dark mode).
 */

export type SeriesId = 'actual' | 'raw' | 'calibrated'

export interface SeriesSpec {
  id: SeriesId
  label: string
  short: string
  color: string
  description: string
}

export const SERIES: Record<SeriesId, SeriesSpec> = {
  actual: {
    id: 'actual',
    label: 'Outturn',
    short: 'OUTTURN',
    color: 'var(--series-actual)',
    description: 'Metered wind generation (FUELHH, WIND), known only after delivery',
  },
  raw: {
    id: 'raw',
    label: 'NESO forecast',
    short: 'RAW FCST',
    color: 'var(--series-raw)',
    description: 'WINDFOR forecast as published, the latest run before gate closure',
  },
  calibrated: {
    id: 'calibrated',
    label: 'Calibrated forecast',
    short: 'CALIBRATED',
    color: 'var(--series-calibrated)',
    description: 'Raw forecast corrected using the previous 14 settled days',
  },
}

export const BAND_FILL = 'var(--series-calibrated-wash)'
