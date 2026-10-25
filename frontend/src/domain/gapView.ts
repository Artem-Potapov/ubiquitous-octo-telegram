// Helpers for presenting gaps: who is involved, and how many open gaps touch each person.

import type { CarePlan, Gap, Task } from '../api/contract'
import type { WorkloadImbalance } from './gapEngine'

interface GapViewData {
  tasksById: Map<number, Task>
  carePlans: CarePlan[]
  openGaps: Gap[]
}

export function gapPeopleIds(gap: Pick<Gap, 'gap_kind' | 'task_id' | 'related_care_plan_ids'>, data: GapViewData): number[] {
  const task = gap.task_id ? data.tasksById.get(gap.task_id) : undefined
  if (gap.gap_kind === 'redundant') return task?.assignments.map((a) => a.person_id) ?? []
  if (gap.gap_kind === 'missed') return task?.assignments.filter((a) => a.status === 'missed').map((a) => a.person_id) ?? []
  if (gap.gap_kind === 'plan_conflict') {
    return data.carePlans.filter((p) => gap.related_care_plan_ids.includes(p.id)).map((p) => p.author_person_id)
  }
  return []
}

/** Map person_id -> number of open gaps they are part of (+1 for the overloaded caregiver). */
export function gapCountsByPerson(data: GapViewData, imbalance: WorkloadImbalance | null): Map<number, number> {
  const counts = new Map<number, number>()
  const bump = (id: number) => counts.set(id, (counts.get(id) ?? 0) + 1)
  for (const gap of data.openGaps) gapPeopleIds(gap, data).forEach(bump)
  if (imbalance) bump(imbalance.overloaded.person_id)
  return counts
}

export function gapTaskTitle(gap: Pick<Gap, 'gap_kind' | 'task_id'>, data: Pick<GapViewData, 'tasksById'>): string {
  if (gap.gap_kind === 'plan_conflict') return 'Conflicting care-plan instructions'
  return (gap.task_id ? data.tasksById.get(gap.task_id)?.title : undefined) ?? 'Task'
}
