// Deterministic "who could take this?" ranking. Used by the gap engine to pick
// a suggested assignee and by the UI to show every candidate with reasons.
//
// Safety rule: a person who does not match a task's required_role is never
// suggested - so clinical tasks can't land on family members by accident.

import type { AvailabilityMap, AvailabilityWindowCreate, Person, Task } from '../api/contract'
import { computeWeeklyLoads } from './workload'
import { contractWeekday, daysUntil, formatTime, WEEKDAY_SHORT } from './dates'

export const SUGGESTION_WEIGHTS = { availability: 40, lightLoad: 40, exactRole: 20, perMissed: 10 }

export type ReasonTone = 'good' | 'warn' | 'neutral'
export interface Reason {
  text: string
  tone: ReasonTone
}

export interface Candidate {
  person: Person
  score: number
  reasons: Reason[]
  load: number
}

export interface Ineligible {
  person: Person
  reason: string
}

export interface RankArgs {
  task: Task
  people: Person[]
  tasks: Task[]
  availability: AvailabilityMap
  /** Limits which people are considered at all. */
  pool?: Person[]
}

/** Contract rule: required_role is matched against subrole or person_type. */
export function matchesRequiredRole(person: Person, requiredRole: string | null): boolean {
  if (!requiredRole) return true
  const r = requiredRole.toLowerCase()
  return person.subrole.toLowerCase() === r || person.person_type === r
}

function availabilityFit(task: Task, windows: AvailabilityWindowCreate[]): { coverage: number; reason: string; tone: ReasonTone } {
  const dueIn = daysUntil(task.due_date)
  if (task.due_date && dueIn !== null && dueIn >= 0) {
    const day = contractWeekday(task.due_date)
    const match = windows.find((w) => w.weekday === day)
    const dayName = WEEKDAY_SHORT[day]
    return match
      ? { coverage: 1, reason: `Available ${dayName} ${formatTime(match.start_time)}–${formatTime(match.end_time)}`, tone: 'good' }
      : { coverage: 0, reason: `No availability on ${dayName} (due date)`, tone: 'warn' }
  }
  const days = new Set(windows.map((w) => w.weekday)).size
  return {
    coverage: days / 7,
    reason: days === 0 ? 'No availability shared' : `Available ${days} of 7 days a week`,
    tone: days >= 5 ? 'good' : days >= 3 ? 'neutral' : 'warn',
  }
}

function ineligibleReason(person: Person, task: Task): string | null {
  if (person.person_type === 'patient') return 'Patient — not asked to cover coordination tasks'
  if (task.assignments.some((a) => a.person_id === person.id)) return 'Already assigned to this task'
  if (!matchesRequiredRole(person, task.required_role)) {
    return person.person_type === 'family' && task.required_role !== 'family'
      ? `Clinical role required: ${task.required_role}`
      : `Requires: ${task.required_role}`
  }
  return null
}

/** Rank everyone in the network for a task. */
export function rankCandidates({ task, people, tasks, availability, pool }: RankArgs): { eligible: Candidate[]; ineligible: Ineligible[] } {
  const loads = computeWeeklyLoads(tasks, people)
  const loadOf = (id: number) => loads.get(id) ?? { load: 0, missedCount: 0 }
  const considered = pool ?? people
  const eligible: Person[] = []
  const ineligible: Ineligible[] = []

  for (const person of considered) {
    const reason = ineligibleReason(person, task)
    if (reason) ineligible.push({ person, reason })
    else eligible.push(person)
  }

  const maxLoad = Math.max(1, ...eligible.map((p) => loadOf(p.id).load))
  const avgLoad = eligible.reduce((s, p) => s + loadOf(p.id).load, 0) / Math.max(1, eligible.length)

  const ranked = eligible.map((person): Candidate => {
    const { load, missedCount } = loadOf(person.id)
    const avail = availabilityFit(task, availability[person.id] ?? [])
    const exact = !!task.required_role && person.subrole.toLowerCase() === task.required_role.toLowerCase()
    const reasons: Reason[] = []

    if (!task.required_role) reasons.push({ text: 'No special qualification needed', tone: 'neutral' })
    else if (exact) reasons.push({ text: `Exact role match: ${person.subrole}`, tone: 'good' })
    else reasons.push({ text: `Qualifies as ${task.required_role}`, tone: 'good' })

    reasons.push({ text: avail.reason, tone: avail.tone })

    const loadText = `${Number(load.toFixed(1))} task occurrences / week`
    if (load <= avgLoad) reasons.push({ text: `Lighter load: ${loadText}`, tone: 'good' })
    else reasons.push({ text: `Heavier load: ${loadText}`, tone: 'warn' })

    if (missedCount > 0) {
      reasons.push({ text: `${missedCount} missed responsibilit${missedCount === 1 ? 'y' : 'ies'} recently`, tone: 'warn' })
    }

    const score =
      SUGGESTION_WEIGHTS.availability * avail.coverage +
      SUGGESTION_WEIGHTS.lightLoad * (1 - load / maxLoad) +
      (exact ? SUGGESTION_WEIGHTS.exactRole : 0) -
      SUGGESTION_WEIGHTS.perMissed * missedCount

    return { person, score: Math.round(score), reasons, load }
  })

  ranked.sort((a, b) => b.score - a.score || a.person.id - b.person.id)
  return { eligible: ranked, ineligible }
}

export function suggestedAssignee(args: RankArgs): Person | null {
  return rankCandidates(args).eligible[0]?.person ?? null
}
