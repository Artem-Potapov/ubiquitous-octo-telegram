// Caregiver workload & strain index.
//
// ILLUSTRATIVE ONLY - this is a transparent heuristic for spotting uneven
// workload, not a clinically validated burnout measure. Every number shown in
// the UI can be traced back to the constants below.

import type { Person, Task, TaskAssignment, TaskCategory, TaskFrequency } from '../api/contract'

export const FREQUENCY_WEIGHT: Record<TaskFrequency, number> = { daily: 7, weekly: 1, monthly: 0.25, once: 1, as_needed: 0.5 }

export const STRAIN_WEIGHTS = {
  loadShare: 65, // points at 100% of the family's weekly task load
  perMissed: 10, // points per missed responsibility...
  missedCap: 15, // ...capped here
  wellbeing: 20, // points at the most negative check-in sentiment (-1)
}

export type StrainLevelKey = 'high' | 'elevated' | 'manageable'
export interface StrainLevel {
  min: number
  key: StrainLevelKey
  label: string
}

export const STRAIN_LEVELS: StrainLevel[] = [
  { min: 60, key: 'high', label: 'High strain' },
  { min: 35, key: 'elevated', label: 'Elevated' },
  { min: 0, key: 'manageable', label: 'Manageable' },
]

/** A caregiver is flagged when they carry at least this share of family load. */
export const IMBALANCE_SHARE = 0.5

/** person_id -> average check-in sentiment (-1..1), or null if none. */
export type SentimentMap = Record<number, number | null>

export interface WeeklyLoad {
  load: number
  taskCount: number
  missedCount: number
  byCategory: Partial<Record<TaskCategory, number>>
}

export interface StrainRow {
  person_id: number
  load: number
  totalFamilyLoad: number
  share: number
  taskCount: number
  missed_count: number
  sentiment_average: number | null
  byCategory: Partial<Record<TaskCategory, number>>
  components: { loadShare: number; missed: number; wellbeing: number }
  score: number
  level: StrainLevel
}

/** Hand a task from one caregiver to another. */
export interface TaskMove {
  taskId: number
  fromId: number
  toId: number
}

const isActive = (a: TaskAssignment) => a.status !== 'done'

/** Weekly occurrences one person carries for a task. Shared (non-exclusive) tasks are split. */
export function taskLoadFor(task: Task, personId: number): number {
  const active = task.assignments.filter(isActive)
  if (!active.some((a) => a.person_id === personId)) return 0
  const weight = FREQUENCY_WEIGHT[task.frequency] ?? 1
  return task.is_exclusive ? weight : weight / active.length
}

export function computeWeeklyLoads(tasks: Task[], people: Person[]): Map<number, WeeklyLoad> {
  const loads = new Map<number, WeeklyLoad>(people.map((p) => [p.id, { load: 0, taskCount: 0, missedCount: 0, byCategory: {} }]))
  for (const task of tasks) {
    for (const a of task.assignments) {
      const entry = loads.get(a.person_id)
      if (!entry) continue
      if (a.status === 'missed') entry.missedCount += 1
      if (!isActive(a)) continue
      const l = taskLoadFor(task, a.person_id)
      entry.load += l
      entry.taskCount += 1
      entry.byCategory[task.category] = (entry.byCategory[task.category] ?? 0) + l
    }
  }
  return loads
}

export function strainLevel(score: number): StrainLevel {
  return STRAIN_LEVELS.find((l) => score >= l.min) ?? STRAIN_LEVELS[STRAIN_LEVELS.length - 1]
}

/** Strain rows for informal (family) caregivers, highest score first. */
export function computeStrain(tasks: Task[], people: Person[], sentimentByPerson: SentimentMap = {}): StrainRow[] {
  const family = people.filter((p) => p.person_type === 'family')
  const loads = computeWeeklyLoads(tasks, people)
  const loadOf = (id: number) => loads.get(id) ?? { load: 0, taskCount: 0, missedCount: 0, byCategory: {} }
  const total = family.reduce((sum, p) => sum + loadOf(p.id).load, 0)

  return family
    .map((p): StrainRow => {
      const { load, taskCount, missedCount, byCategory } = loadOf(p.id)
      const share = total > 0 ? load / total : 0
      const sentiment = sentimentByPerson[p.id] ?? null
      const components = {
        loadShare: share * STRAIN_WEIGHTS.loadShare,
        missed: Math.min(missedCount * STRAIN_WEIGHTS.perMissed, STRAIN_WEIGHTS.missedCap),
        wellbeing: sentiment !== null && sentiment < 0 ? -sentiment * STRAIN_WEIGHTS.wellbeing : 0,
      }
      const score = Math.min(100, Math.round(components.loadShare + components.missed + components.wellbeing))
      return {
        person_id: p.id,
        load,
        totalFamilyLoad: total,
        share,
        taskCount,
        missed_count: missedCount,
        sentiment_average: sentiment,
        byCategory,
        components,
        score,
        level: strainLevel(score),
      }
    })
    .sort((a, b) => b.score - a.score)
}

export function detectImbalance(strainRows: StrainRow[]): StrainRow | null {
  if (strainRows.length < 2) return null
  const top = [...strainRows].sort((a, b) => b.share - a.share)[0]
  return top.share >= IMBALANCE_SHARE ? top : null
}

/** Return a copy of `tasks` with each move's assignment handed from one person to another. */
export function applyMoves(tasks: Task[], moves: TaskMove[]): Task[] {
  return tasks.map((task) => {
    const move = moves.find((m) => m.taskId === task.id)
    if (!move) return task
    return {
      ...task,
      assignments: task.assignments.map((a) => (a.person_id === move.fromId ? { ...a, person_id: move.toId } : a)),
    }
  })
}
