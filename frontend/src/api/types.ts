/**
 * Response contracts of the WindDesk API (mirrors backend/app/schemas.py).
 * Instants are UTC ISO-8601 strings, calendar dates are YYYY-MM-DD, power is MW.
 */

export type IsoInstant = string
export type IsoDate = string

export interface Interval {
  start: IsoInstant
  end: IsoInstant
}

export interface ErrorMetrics {
  count: number
  maeMw: number
  rmseMw: number
  biasMw: number
  medianAbsErrorMw: number
  p90AbsErrorMw: number
  p99AbsErrorMw: number
  maxOverForecastMw: number
  maxUnderForecastMw: number
  wapePct: number | null
  correlation: number | null
}

export interface MetricsPair {
  raw: ErrorMetrics | null
  calibrated: ErrorMetrics | null
}

export interface GateClosurePreset {
  id: string
  label: string
  time: string
}

export interface DataProvenance {
  source: 'snapshot' | 'live'
  provider: string
  fetchedAt: IsoInstant
  forecastPublishFrom: IsoInstant
  forecastPublishTo: IsoInstant
  actualSettlementFrom: IsoDate
  actualSettlementTo: IsoDate
  forecastRecords: number
  forecastRuns: number
  actualRecords: number
}

export interface Meta {
  product: string
  version: string
  timezone: string
  firstDecisionDate: IsoDate
  lastDecisionDate: IsoDate
  firstDeliveryDate: IsoDate
  lastDeliveryDate: IsoDate
  evaluationWindow: Interval
  defaultGateClosure: string
  gateClosurePresets: GateClosurePreset[]
  calibrationWindowDays: number
  bandCoverage: number
  maxLeadHours: number
  data: DataProvenance
}

export interface ForecastPoint {
  startTime: IsoInstant
  forecastMw: number
  publishTime: IsoInstant
  leadHours: number
  actualMw: number | null
  calibratedMw: number | null
  lowerMw: number | null
  upperMw: number | null
}

export interface ActualPoint {
  startTime: IsoInstant
  generationMw: number
}

export interface Calibration {
  slope: number
  interceptMw: number
  residualLowerMw: number
  residualUpperMw: number
  coverage: number
  trainingFrom: IsoDate
  trainingTo: IsoDate
  trainingDays: number
  trainingPoints: number
}

export interface VintagePoint {
  startTime: IsoInstant
  forecastMw: number
}

export interface Vintage {
  publishTime: IsoInstant
  availableAtDecision: boolean
  usedForDecision: boolean
  points: VintagePoint[]
}

export interface DaySummary {
  forecastEnergyMwh: number | null
  calibratedEnergyMwh: number | null
  dependableEnergyMwh: number | null
  actualEnergyMwh: number | null
  forecastMeanMw: number
  forecastPeakMw: number
  forecastPeakTime: IsoInstant
  forecastMinMw: number
  forecastMinTime: IsoInstant
}

export interface Briefing {
  deliveryDate: IsoDate
  decisionDate: IsoDate
  gateClosure: string
  decisionCutoff: IsoInstant
  window: Interval
  forecastPublishTime: IsoInstant | null
  nextPublishTime: IsoInstant | null
  leadHoursMin: number | null
  leadHoursMax: number | null
  expectedPoints: number
  calibration: Calibration | null
  summary: DaySummary | null
  metrics: MetricsPair
  points: ForecastPoint[]
  actuals: ActualPoint[]
  vintages: Vintage[]
}

export type SeriesMode = 'decision' | 'lead'

export interface TimeSeries {
  mode: SeriesMode
  gateClosure: string | null
  leadHours: number | null
  fromDate: IsoDate
  toDate: IsoDate
  window: Interval
  points: ForecastPoint[]
  actuals: ActualPoint[]
  metrics: MetricsPair
}

export interface Band {
  targetCoverage: number
  observedCoverage: number
  meanWidthMw: number
  count: number
}

export interface Energy {
  forecastGwh: number
  calibratedGwh: number | null
  actualGwh: number
}

export interface SegmentAccuracy {
  count: number
  rawMaeMw: number
  rawBiasMw: number
  calibratedMaeMw: number | null
  calibratedBiasMw: number | null
}

export interface DailyAccuracy extends SegmentAccuracy {
  deliveryDate: IsoDate
  forecastEnergyMwh: number
  actualEnergyMwh: number
}

export interface HourAccuracy extends SegmentAccuracy {
  hour: number
}

export interface LevelAccuracy extends SegmentAccuracy {
  lowerMw: number
  upperMw: number
}

export interface HistogramBin {
  lowerMw: number
  upperMw: number
  rawCount: number
  calibratedCount: number
}

export interface LeadAccuracy {
  leadHours: number
  count: number
  maeMw: number
  biasMw: number
  p90AbsErrorMw: number
}

export interface Buffer {
  confidence: number
  rawMw: number
  calibratedMw: number | null
}

export interface ScatterPoint {
  startTime: IsoInstant
  forecastMw: number
  calibratedMw: number | null
  actualMw: number
}

export interface Accuracy {
  gateClosure: string
  window: Interval
  firstDeliveryDate: IsoDate
  lastDeliveryDate: IsoDate
  deliveryDays: number
  decisionLeadHoursMin: number | null
  decisionLeadHoursMax: number | null
  metrics: MetricsPair
  maeReductionPct: number | null
  band: Band | null
  energy: Energy | null
  daily: DailyAccuracy[]
  byHour: HourAccuracy[]
  byLevel: LevelAccuracy[]
  histogramBinWidthMw: number
  histogram: HistogramBin[]
  byLead: LeadAccuracy[]
  buffers: Buffer[]
  scatter: ScatterPoint[]
}
