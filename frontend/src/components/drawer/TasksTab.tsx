import { Lock } from 'lucide-react'
import { dueLabel, FREQUENCY_LABEL } from '../../lib/format'
import { useConstellation } from '../../store/useConstellation'
import { VIEWER_BY_ROLE } from '../../store/roles'
import { StatusChip } from '../common/Chips'
import { CardSkeletons } from '../common/Skeleton'

export function TasksTab() {
  const role = useConstellation((s) => s.role)
  const tasks = useConstellation((s) => s.tasks)
  const loading = useConstellation((s) => s.loading)
  const canView = useConstellation((s) => s.canViewRestricted)

  if (loading) return <CardSkeletons count={2} />

  const viewerId = VIEWER_BY_ROLE[role]
  const mine = tasks.filter((t) => t.assignments.some((a) => a.person_id === viewerId))
  const hidden = tasks.filter((t) => t.is_redacted).length

  return (
    <div className="space-y-3">
      {mine.length === 0 ? (
        <p className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">Nothing is assigned to you.</p>
      ) : (
        <ul className="space-y-2">
          {mine.map((task) => {
            const status = task.assignments.find((a) => a.person_id === viewerId)?.status ?? 'pending'
            return (
              <li key={task.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className={`flex items-start gap-1.5 text-sm font-medium ${task.is_redacted ? 'italic text-slate-500' : 'text-slate-900'}`}>
                    {task.is_redacted && <Lock className="mt-0.5 size-3.5 shrink-0" aria-label="Restricted" />}
                    {task.title}
                  </p>
                  <StatusChip status={status} />
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  {FREQUENCY_LABEL[task.frequency]} · <span className="font-mono">{dueLabel(task.due_date)}</span>
                </p>
              </li>
            )
          })}
        </ul>
      )}

      {!canView && hidden > 0 && (
        <p className="flex items-start gap-1.5 rounded-md bg-slate-100 p-2.5 text-xs text-slate-600">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {hidden} restricted {hidden === 1 ? 'task is' : 'tasks are'} hidden from this role.
        </p>
      )}
    </div>
  )
}
