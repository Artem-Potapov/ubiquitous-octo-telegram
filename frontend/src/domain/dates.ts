// Dates in the contract are ISO "YYYY-MM-DD" strings. Everything here works in
// local time so "today" matches what the person sees on their calendar.

import type { ISODate, ISODateTime } from '../api/contract'

export function toISODate(date: Date): ISODate {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayISO(): ISODate {
  return toISODate(new Date())
}

export function daysFromToday(n: number): ISODate {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

export function parseISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Whole days from today until `iso` (negative = in the past). */
export function daysUntil(iso: ISODate | null): number | null {
  if (!iso) return null
  const ms = parseISODate(iso).getTime() - parseISODate(todayISO()).getTime()
  return Math.round(ms / 86_400_000)
}

/** Contract weekday: 0 = Monday ... 6 = Sunday. */
export function contractWeekday(iso: ISODate): number {
  return (parseISODate(iso).getDay() + 6) % 7
}

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function relativeDueLabel(iso: ISODate | null): string {
  const n = daysUntil(iso)
  if (iso === null || n === null) return 'No due date'
  if (n === 0) return 'Due today'
  if (n === 1) return 'Due tomorrow'
  if (n === -1) return '1 day overdue'
  if (n < 0) return `${-n} days overdue`
  if (n < 7) return `Due ${parseISODate(iso).toLocaleDateString(undefined, { weekday: 'long' })}`
  return `Due ${formatShortDate(iso)}`
}

export function formatShortDate(iso: ISODate | null): string {
  if (!iso) return '—'
  return parseISODate(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatDateTime(isoDateTime: ISODateTime | null): string {
  if (!isoDateTime) return '—'
  return new Date(isoDateTime).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, '0')} ${suffix}`
}
