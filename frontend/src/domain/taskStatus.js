// Display status for a task, derived from its assignments. The contract stores
// status per assignment (pending/done/missed); the UI needs one label per task.

import { daysUntil } from './dates'

export function taskStatus(task) {
  const a = task.assignments
  if (a.length === 0) return 'unassigned'
  if (a.some((x) => x.status === 'missed')) return 'missed'
  if (task.is_exclusive && a.length >= 2) return 'overlap'
  if (a.every((x) => x.status === 'done')) return 'done'
  const due = daysUntil(task.due_date)
  if (due !== null && due < 0 && task.frequency === 'once') return 'overdue'
  return 'assigned'
}

const PROBLEM_STATUSES = new Set(['unassigned', 'missed', 'overlap', 'overdue'])

export function isProblem(task) {
  return PROBLEM_STATUSES.has(taskStatus(task))
}

/**
 * Urgency is DERIVED (the contract has no priority field yet): problems due
 * soon are high, anything due within a week is medium.
 */
export function taskUrgency(task) {
  const status = taskStatus(task)
  if (status === 'done') return 'low'
  const due = daysUntil(task.due_date)
  if (PROBLEM_STATUSES.has(status) && (due === null || due <= 2)) return status === 'unassigned' && due === null ? 'medium' : 'high'
  if (due !== null && due <= 2) return task.category === 'medication' ? 'high' : 'medium'
  if (due !== null && due <= 7) return 'medium'
  return 'low'
}

/** "Needs help" = a coordination problem, or the owner is the overloaded caregiver. */
export function needsHelp(task, overloadedId) {
  if (isProblem(task)) return true
  return overloadedId != null && task.assignments.some((a) => a.person_id === overloadedId && a.status === 'pending')
}
