// The part of the Overview that changes with the viewer's role.

import { useMemo, useState, type ComponentType } from 'react'
import type { Task } from '../../api/contract'
import type { DashboardView } from '../../domain/roles'
import { ArrowRight, ClipboardList, FileText, HandHelping, Lock, Pill, ShieldCheck, Stethoscope } from 'lucide-react'
import { useCare } from '../../state/careContext'
import { Card, CardHeader, EmptyState } from '../ui/Card'
import { Button } from '../ui/Button'
import { AvatarStack } from '../ui/Avatar'
import { TaskRow } from '../tasks/TaskRow'
import { TaskDrawer } from '../tasks/TaskDrawer'
import { dashboardView, firstName } from '../../domain/roles'
import { rankCandidates } from '../../domain/suggestions'

type OnOpen = (taskId: number) => void

function TaskList({ tasks, empty, onOpen }: { tasks: Task[]; empty: string; onOpen: OnOpen }) {
  if (tasks.length === 0) return <EmptyState icon={ClipboardList} title={empty} />
  return (
    <div className="divide-y divide-slate-100">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} onOpen={() => onOpen(t.id)} compact />
      ))}
    </div>
  )
}

function PatientFocus({ onOpen }: { onOpen: OnOpen }) {
  const { data, navigate } = useCare()
  const authorized = data.people.filter(
    (p) => p.id !== data.patient.id && (p.is_physician || data.grants.some((g) => g.grantee_person_id === p.id)),
  )
  const mine = data.tasks.filter((t) => t.assignments.some((a) => a.person_id === data.viewer.id))
  return (
    <Card>
      <CardHeader icon={ShieldCheck} title="Your care, your rules" subtitle="You decide who sees your sensitive health information." />
      <div className="m-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-white p-4 ring-1 ring-indigo-100">
        <div className="flex items-center gap-3">
          <AvatarStack people={authorized} max={5} />
          <p className="text-sm text-slate-700">
            <span className="font-semibold text-slate-900">{authorized.length} people</span> can see restricted information
          </p>
        </div>
        <Button size="sm" variant="secondary" iconRight={ArrowRight} onClick={() => navigate('privacy')}>
          Manage access
        </Button>
      </div>
      <p className="px-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Your own tasks</p>
      <TaskList tasks={mine} empty="You have no tasks today" onOpen={onOpen} />
    </Card>
  )
}

function FamilyFocus({ onOpen }: { onOpen: OnOpen }) {
  const { data, actions, busy } = useCare()
  const me = data.viewer
  const mine = data.tasks.filter((t) => t.assignments.some((a) => a.person_id === me.id && a.status !== 'done'))
  const canHelp = useMemo(
    () =>
      data.tasks.filter(
        (t) =>
          t.assignments.length === 0 &&
          !t.is_redacted &&
          rankCandidates({ task: t, people: data.people, tasks: data.tasks, availability: data.availability }).eligible.some((c) => c.person.id === me.id),
      ),
    [data, me.id],
  )

  const volunteer = (task: Task) => {
    const gap = data.openGaps.find((g) => g.task_id === task.id && g.gap_kind === 'unowned')
    if (gap) actions.resolveGap(gap.id, (api) => api.assignTask(task.id, me.id), `Thanks, ${firstName(me)}. "${task.title}" is yours`)
    else actions.assign(task.id, me.id)
  }

  return (
    <Card>
      <CardHeader icon={ClipboardList} title={`Your responsibilities, ${firstName(me)}`} subtitle={`${mine.length} active tasks`} />
      {canHelp.length > 0 && (
        <div className="mx-5 mt-4 space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
            <HandHelping className="size-4" /> Nobody owns these yet. Could you help?
          </p>
          {canHelp.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-emerald-100">
              <span className="text-sm text-slate-800">{t.title}</span>
              <Button size="sm" variant="success" disabled={busy} onClick={() => volunteer(t)}>
                I'll take it
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2">
        <TaskList tasks={mine} empty="No tasks assigned to you" onOpen={onOpen} />
      </div>
    </Card>
  )
}

function ClinicianFocus({ onOpen }: { onOpen: OnOpen }) {
  const { data, navigate } = useCare()
  const mine = data.tasks.filter((t) => t.assignments.some((a) => a.person_id === data.viewer.id))
  const conflicts = data.openGaps.filter((g) => g.gap_kind === 'plan_conflict')
  return (
    <Card>
      <CardHeader icon={Stethoscope} title="Clinical overview" subtitle="Care plans across the team, and items needing clinical review" />
      {conflicts.length > 0 && (
        <button
          type="button"
          onClick={() => navigate('gaps', { openGapId: conflicts[0].id })}
          className="mx-5 mt-4 flex w-[calc(100%-2.5rem)] items-center gap-3 rounded-2xl bg-amber-50 p-4 text-left ring-1 ring-amber-200 transition hover:bg-amber-100/60"
        >
          <Stethoscope className="size-5 shrink-0 text-amber-700" />
          <span className="flex-1 text-sm text-amber-900">
            <span className="font-semibold">{conflicts.length} care-plan conflict needs physician review.</span> Caregivers are receiving contradictory
            instructions.
          </span>
          <ArrowRight className="size-4 text-amber-700" />
        </button>
      )}
      <ul className="mx-5 mt-4 grid gap-2 sm:grid-cols-2">
        {data.carePlans.map((p) => (
          <li key={p.id} className="rounded-xl border border-slate-200 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              {p.is_redacted ? <Lock className="size-3.5 text-slate-400" /> : <FileText className="size-3.5 text-slate-400" />}
              <span className={p.is_redacted ? 'italic text-slate-500' : ''}>{p.title}</span>
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{data.peopleById.get(p.author_person_id)?.full_name}</p>
            {!p.is_redacted && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600">{p.raw_text}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-5 px-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Assigned to you</p>
      <TaskList tasks={mine} empty="Nothing assigned to you" onOpen={onOpen} />
    </Card>
  )
}

function PharmacistFocus({ onOpen }: { onOpen: OnOpen }) {
  const { data } = useCare()
  const meds = data.tasks.filter((t) => t.category === 'medication')
  const problems = meds.filter((t) => t.assignments.length === 0 || t.assignments.some((a) => a.status === 'missed'))
  return (
    <Card>
      <CardHeader
        icon={Pill}
        title="Medication coordination"
        subtitle={`${meds.length} medication responsibilities across the network${problems.length ? ` · ${problems.length} need attention` : ''}`}
      />
      <div className="mt-2">
        <TaskList tasks={[...problems, ...meds.filter((t) => !problems.includes(t))]} empty="No medication tasks" onOpen={onOpen} />
      </div>
    </Card>
  )
}

const VIEWS: Record<DashboardView, ComponentType<{ onOpen: OnOpen }>> = { patient: PatientFocus, family: FamilyFocus, clinician: ClinicianFocus, pharmacist: PharmacistFocus }

export function RoleFocusPanel() {
  const { data } = useCare()
  const [openTaskId, setOpenTaskId] = useState<number | null>(null)
  const View = VIEWS[dashboardView(data.viewer)]
  return (
    <>
      <View onOpen={setOpenTaskId} />
      {openTaskId && <TaskDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
    </>
  )
}
