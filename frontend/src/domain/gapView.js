// Helpers for presenting gaps: who is involved, and how many open gaps touch each person.

export function gapPeopleIds(gap, data) {
  const task = gap.task_id ? data.tasksById.get(gap.task_id) : null
  if (gap.gap_kind === 'redundant') return task?.assignments.map((a) => a.person_id) ?? []
  if (gap.gap_kind === 'missed') return task?.assignments.filter((a) => a.status === 'missed').map((a) => a.person_id) ?? []
  if (gap.gap_kind === 'plan_conflict') {
    return data.carePlans.filter((p) => gap.related_care_plan_ids.includes(p.id)).map((p) => p.author_person_id)
  }
  return []
}

/** Map person_id -> number of open gaps they are part of (+1 for the overloaded caregiver). */
export function gapCountsByPerson(data, imbalance) {
  const counts = new Map()
  const bump = (id) => counts.set(id, (counts.get(id) ?? 0) + 1)
  for (const gap of data.openGaps) gapPeopleIds(gap, data).forEach(bump)
  if (imbalance) bump(imbalance.overloaded.person_id)
  return counts
}

export function gapTaskTitle(gap, data) {
  if (gap.gap_kind === 'plan_conflict') return 'Conflicting care-plan instructions'
  return data.tasksById.get(gap.task_id)?.title ?? 'Task'
}
