import type { GapKind, TaskFrequency } from '../types/api'

function parseDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Whole days from today until the date (negative = overdue). */
export function daysUntil(iso: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((parseDate(iso).getTime() - today.getTime()) / 86_400_000)
}

export function dueLabel(iso: string | null): string {
  if (!iso) return 'No due date'
  const n = daysUntil(iso)
  if (n === 0) return 'Due today'
  if (n === 1) return 'Due tomorrow'
  if (n === -1) return '1 day overdue'
  if (n < 0) return `${-n} days overdue`
  return `Due in ${n} days`
}

export const FREQUENCY_LABEL: Record<TaskFrequency, string> = {
  once: 'One time',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  as_needed: 'As needed',
}

export const GAP_KIND_LABEL: Record<GapKind, string> = {
  unowned: 'No owner',
  redundant: 'Double-booked',
  missed: 'Missed',
  plan_conflict: 'Care plan conflict',
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
