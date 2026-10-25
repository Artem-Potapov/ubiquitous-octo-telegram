import type { BurnoutScore } from '../types/api'

// Display only. The score itself comes from the backend; these constants just split it
// into the parts shown in the breakdown. They mirror the backend heuristic and are
// illustrative, not a clinical measure. The backend should eventually send the parts.
const WEIGHTS = { loadShare: 65, perMissed: 10, missedCap: 15, wellbeing: 20 }

export type StrainLevel = 'manageable' | 'elevated' | 'high'

export function strainLevel(score: number): StrainLevel {
  return score >= 60 ? 'high' : score >= 35 ? 'elevated' : 'manageable'
}

export const STRAIN_LABEL: Record<StrainLevel, string> = {
  manageable: 'Manageable',
  elevated: 'Elevated',
  high: 'High strain',
}

/** Elevated or worse gets the amber ring and badge on the graph. */
export const isBurnoutWarning = (s: BurnoutScore) => s.score >= 35

export interface BurnoutPart {
  label: string
  points: number
  detail: string
}

export function burnoutParts(s: BurnoutScore): BurnoutPart[] {
  const missed = Math.min(s.missed_count * WEIGHTS.perMissed, WEIGHTS.missedCap)
  const wellbeing = s.sentiment_average !== null && s.sentiment_average < 0 ? -s.sentiment_average * WEIGHTS.wellbeing : 0
  return [
    {
      label: 'Share of family tasks',
      points: s.task_share * WEIGHTS.loadShare,
      detail: `${Math.round(s.task_share * 100)}% of weekly load`,
    },
    {
      label: 'Missed responsibilities',
      points: missed,
      detail: `${s.missed_count} missed`,
    },
    {
      label: 'Check-in sentiment',
      points: wellbeing,
      detail: s.sentiment_average === null ? 'No check-ins' : `${s.sentiment_average.toFixed(1)} average`,
    },
  ]
}
