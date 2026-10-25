import { ChevronRight, HandHelping, Lock } from 'lucide-react'
import { useCare } from '../../state/careContext'
import { CategoryIcon, TaskStatusBadge } from '../ui/Badge'
import { Avatar } from '../ui/Avatar'
import { FREQUENCY_LABEL, SEVERITY_META } from '../ui/meta'
import { needsHelp, taskStatus, taskUrgency } from '../../domain/taskStatus'
import { daysUntil, relativeDueLabel } from '../../domain/dates'

export function TaskRow({ task, onOpen, compact = false }) {
  const { data, derived } = useCare()
  const status = taskStatus(task)
  const urgency = taskUrgency(task)
  const help = needsHelp(task, derived.imbalance?.overloaded.person_id)
  const due = daysUntil(task.due_date)
  const owners = task.assignments.map((a) => ({ a, person: data.peopleById.get(a.person_id) })).filter((o) => o.person)

  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50/80 sm:gap-4 sm:px-5"
    >
      <CategoryIcon category={task.category} className="size-10" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-900">
          {task.is_redacted && <Lock className="size-3.5 shrink-0 text-slate-400" />}
          <span className={`truncate ${task.is_redacted ? 'italic text-slate-500' : ''}`}>{task.title}</span>
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
          <span>{FREQUENCY_LABEL[task.frequency]}</span>
          {task.due_date && (
            <span className={due !== null && due < 0 && status !== 'done' ? 'font-medium text-rose-600' : due !== null && due <= 1 ? 'font-medium text-amber-700' : ''}>
              {relativeDueLabel(task.due_date)}
            </span>
          )}
          {!compact && task.required_role && <span className="hidden sm:inline">Requires {task.required_role}</span>}
          {!compact && task.sensitivity === 'restricted' && !task.is_redacted && (
            <span className="inline-flex items-center gap-1 text-violet-700">
              <Lock className="size-3" /> Restricted
            </span>
          )}
        </p>
      </div>

      {!compact && (
        <span className="hidden w-20 items-center gap-1.5 text-xs text-slate-500 md:flex" title="Derived urgency">
          <span className="size-2 rounded-full" style={{ background: SEVERITY_META[urgency].dot }} />
          {SEVERITY_META[urgency].label}
        </span>
      )}

      <span className="hidden w-28 justify-end sm:flex">
        {owners.length === 0 ? (
          <span className="inline-flex size-8 items-center justify-center rounded-full border-2 border-dashed border-rose-300 text-xs font-bold text-rose-400">?</span>
        ) : (
          <span className="flex -space-x-2">
            {owners.slice(0, 3).map(({ a, person }) => (
              <Avatar key={person.id} person={person} size="sm" status={a.status} />
            ))}
          </span>
        )}
      </span>

      <span className="flex w-auto flex-col items-end gap-1 sm:w-40">
        <TaskStatusBadge status={status} />
        {help && status !== 'unassigned' && !compact && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
            <HandHelping className="size-3" /> Needs help
          </span>
        )}
      </span>
      <ChevronRight className="hidden size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500 sm:block" />
    </button>
  )
}
