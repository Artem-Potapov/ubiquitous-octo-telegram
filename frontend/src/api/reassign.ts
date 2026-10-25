import type { Gap, Task } from '../types/api'
import type { Backend } from '.'

/**
 * Accept a suggested reassignment using only the endpoints the API already has.
 *
 * Order matters: replace_open_gaps changes open gap ids, so the gap is resolved
 * before the task changes. Then detection is re-run so the gaps reflect the fix.
 * `task` is the gap's task as the UI last saw it (undefined for care-plan conflicts).
 */
export async function reassign(
  api: Backend,
  gap: Gap,
  task: Task | undefined,
  resolvedByPersonId: number,
  assigneeId: number | null,
): Promise<void> {
  await api.resolveGap(gap.id, resolvedByPersonId)

  if (assigneeId !== null && task) {
    const owners = task.assignments
    if (gap.gap_kind === 'missed') {
      for (const a of owners.filter((x) => x.status === 'missed')) await api.unassignTask(task.id, a.person_id)
    } else if (gap.gap_kind === 'redundant') {
      for (const a of owners.filter((x) => x.person_id !== assigneeId)) await api.unassignTask(task.id, a.person_id)
    }
    if (!owners.some((a) => a.person_id === assigneeId && (gap.gap_kind !== 'missed' || a.status !== 'missed'))) {
      await api.assignTask(task.id, assigneeId)
    }
  }

  await api.detectGaps(gap.network_id)
}
