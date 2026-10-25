import { useState, type ReactNode } from 'react'
import { AlertTriangle, ArrowRight, Check, Clock, RotateCcw, UserMinus, UserPlus } from 'lucide-react'
import { useCare } from '../../state/careContext'
import { Drawer } from '../ui/Drawer'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Badge, CategoryIcon, TaskStatusBadge } from '../ui/Badge'
import { RestrictedNotice } from '../ui/Restricted'
import { CATEGORY_META, FREQUENCY_LABEL, GAP_KIND_META } from '../ui/meta'
import { CandidateList } from '../gaps/CandidateList'
import { formatShortDate, relativeDueLabel } from '../../domain/dates'
import { taskStatus } from '../../domain/taskStatus'
import { firstName } from '../../domain/roles'

const ASSIGNMENT_BADGE = {
  pending: 'bg-slate-100 text-slate-700 ring-slate-200',
  done: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  missed: 'bg-rose-50 text-rose-700 ring-rose-200',
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{children}</dd>
    </div>
  )
}

export function TaskDrawer({ taskId, onClose }: { taskId: number; onClose: () => void }) {
  const { data, actions, busy, navigate } = useCare()
  const [adding, setAdding] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const task = data.tasksById.get(taskId)
  if (!task) return null

  const status = taskStatus(task)
  const gaps = data.openGaps.filter((g) => g.task_id === task.id)
  const creator = task.created_by_person_id ? data.peopleById.get(task.created_by_person_id) : undefined
  const hasOwner = task.assignments.length > 0
  const patientFirst = firstName(data.patient)

  const assign = async () => {
    if (selectedId === null) return
    const ok = await actions.assign(task.id, selectedId)
    if (ok) {
      setAdding(false)
      setSelectedId(null)
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={task.title}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <TaskStatusBadge status={status} />
          {task.sensitivity === 'restricted' && <Badge className="bg-violet-50 text-violet-700 ring-violet-200">Restricted</Badge>}
        </span>
      }
    >
      {task.is_redacted && (
        <div className="mb-5">
          <RestrictedNotice patientName={patientFirst} />
        </div>
      )}

      <div className="flex items-center gap-3">
        <CategoryIcon category={task.category} className="size-12" />
        <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Fact label="Category">{CATEGORY_META[task.category].label}</Fact>
          <Fact label="Frequency">{FREQUENCY_LABEL[task.frequency]}</Fact>
          <Fact label="Due">{task.due_date ? `${formatShortDate(task.due_date)} · ${relativeDueLabel(task.due_date)}` : 'Recurring'}</Fact>
          <Fact label="Ownership">{task.is_exclusive ? 'Single owner' : 'Shared'}</Fact>
          <Fact label="Requires">{task.required_role ?? 'Anyone in the network'}</Fact>
          <Fact label="Created by">{creator?.full_name ?? '—'}</Fact>
        </dl>
      </div>

      {gaps.length > 0 && (
        <div className="mt-5 space-y-2">
          {gaps.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                onClose()
                navigate('gaps', { openGapId: g.id })
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-left text-sm text-rose-800 transition hover:bg-rose-100/70"
            >
              <AlertTriangle className="size-4 shrink-0" />
              <span className="flex-1">
                <span className="font-semibold">{GAP_KIND_META[g.gap_kind].label}</span> detected on this task
              </span>
              <span className="flex items-center gap-1 text-xs font-semibold">
                Resolve <ArrowRight className="size-3.5" />
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-7">
        <div className="flex items-center justify-between">
          <p className="font-display text-sm font-bold text-slate-900">Owners</p>
          {!task.is_redacted && !adding && (
            <Button size="sm" variant="secondary" icon={UserPlus} onClick={() => setAdding(true)}>
              {hasOwner ? 'Add owner' : 'Assign'}
            </Button>
          )}
        </div>

        {!hasOwner && (
          <div className="mt-3 rounded-2xl border-2 border-dashed border-rose-200 bg-rose-50/40 px-4 py-5 text-center">
            <p className="text-sm font-semibold text-rose-700">Nobody owns this yet</p>
            <p className="mt-0.5 text-xs text-rose-600/80">Everyone may be assuming someone else is handling it.</p>
          </div>
        )}

        <ul className="mt-3 space-y-2">
          {task.assignments.map((a) => {
            const person = data.peopleById.get(a.person_id)
            if (!person) return null
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 p-3">
                <Avatar person={person} size="sm" status={a.status} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{person.full_name}</p>
                  <p className="text-xs text-slate-500">{person.subrole}</p>
                </div>
                <Badge className={ASSIGNMENT_BADGE[a.status]}>{a.status === 'done' ? 'Done' : a.status === 'missed' ? 'Missed' : 'Pending'}</Badge>
                {!task.is_redacted && (
                  <div className="flex gap-1">
                    {a.status !== 'done' && (
                      <button type="button" disabled={busy} onClick={() => actions.setStatus(task.id, person.id, 'done')} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600" title="Mark done" aria-label={`Mark done for ${person.full_name}`}>
                        <Check className="size-4" />
                      </button>
                    )}
                    {a.status === 'pending' && (
                      <button type="button" disabled={busy} onClick={() => actions.setStatus(task.id, person.id, 'missed')} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" title="Mark missed" aria-label={`Mark missed for ${person.full_name}`}>
                        <Clock className="size-4" />
                      </button>
                    )}
                    {a.status !== 'pending' && (
                      <button type="button" disabled={busy} onClick={() => actions.setStatus(task.id, person.id, 'pending')} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" title="Reset to pending" aria-label={`Reset to pending for ${person.full_name}`}>
                        <RotateCcw className="size-4" />
                      </button>
                    )}
                    <button type="button" disabled={busy} onClick={() => actions.unassign(task.id, person.id)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600" title="Remove owner" aria-label={`Remove ${person.full_name}`}>
                      <UserMinus className="size-4" />
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {adding && (
          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <p className="font-display text-sm font-bold text-slate-900">Choose an owner</p>
            {task.is_exclusive && hasOwner && (
              <p className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                This is a single-owner task. Adding a second owner creates an overlap gap, so remove the current owner first if you're handing it over.
              </p>
            )}
            <div className="mt-3">
              <CandidateList task={task} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
              <Button size="sm" disabled={!selectedId || busy} onClick={assign} icon={UserPlus}>
                Assign {selectedId ? firstName(data.peopleById.get(selectedId)) : ''}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  )
}
