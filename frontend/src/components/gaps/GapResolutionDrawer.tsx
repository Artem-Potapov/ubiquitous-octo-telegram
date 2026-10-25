// Guided resolution for each kind of care gap.
//
// Flow: understand the problem -> pick a fix (suggestion pre-selected, user can
// override) -> the chosen caregiver "accepts" (SIMULATED - in production they'd
// get a notification) -> API writes -> gap engine re-runs -> gap shows resolved.

import { useMemo, useState, type ComponentType, type ReactNode } from 'react'
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Cpu,
  Loader2,
  Orbit,
  Send,
  Stethoscope,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Gap, Person, Task } from '../../api/contract'
import { useCare } from '../../state/careContext'
import { useOpenGaps, type DisplayGap, type WorkloadGap } from '../../state/useGaps'
import { Drawer } from '../ui/Drawer'
import { Button } from '../ui/Button'
import { Avatar } from '../ui/Avatar'
import { CategoryIcon, SeverityBadge } from '../ui/Badge'
import { RestrictedNotice } from '../ui/Restricted'
import { CATEGORY_META, FREQUENCY_LABEL, GAP_KIND_META } from '../ui/meta'
import { CandidateList } from './CandidateList'
import { daysFromToday, relativeDueLabel } from '../../domain/dates'
import { firstName } from '../../domain/roles'
import { rankCandidates } from '../../domain/suggestions'
import { applyMoves, computeStrain } from '../../domain/workload'
import type { RebalanceMove } from '../../domain/gapEngine'

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

interface Result {
  headline: string
  detail: string
}

interface RunArgs {
  /** When set, a simulated "request sent -> accepted" step is shown for this person. */
  person?: Person
  sentText: string
  acceptedText?: string
  work: () => Promise<boolean>
  result: Result
}

type Run = (args: RunArgs) => Promise<void>

interface FlowProps<G extends DisplayGap = Gap> {
  gap: G
  task: Task
  run: Run
  onClose: () => void
}

// ----- shared pieces -------------------------------------------------------

function ProblemPanel({ gap, task }: { gap: DisplayGap; task?: Task }) {
  const meta = GAP_KIND_META[gap.gap_kind]
  return (
    <div className="space-y-4">
      {task && (
        <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
          <CategoryIcon category={task.category} className="size-10" />
          <div className="min-w-0">
            <p className="font-display font-bold text-slate-900">{task.title}</p>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>{CATEGORY_META[task.category].label}</span>
              <span>{FREQUENCY_LABEL[task.frequency]}</span>
              <span>{relativeDueLabel(task.due_date)}</span>
              {task.required_role && <span>Requires: {task.required_role}</span>}
              <span>{task.is_exclusive ? 'Single owner' : 'Shared task'}</span>
            </p>
          </div>
        </div>
      )}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">What we detected</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">{gap.description}</p>
      </div>
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Why it matters</p>
        <p className="mt-1 text-sm leading-relaxed text-indigo-950/80">{meta.why}</p>
      </div>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mt-6">
      <p className="font-display text-sm font-bold text-slate-900">{title}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  )
}

function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky -bottom-5 -mx-6 mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-white/95 px-6 py-4 backdrop-blur">
      {children}
    </div>
  )
}

interface OptionCardProps {
  selected: boolean
  onSelect: () => void
  icon?: LucideIcon
  title: string
  children?: ReactNode
}

function OptionCard({ selected, onSelect, icon: Icon, title, children }: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${
        selected ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-brand-600' : 'border-slate-300'}`}>
        {selected && <span className="size-2 rounded-full bg-brand-600" />}
      </span>
      {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-slate-500" />}
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        {children && <span className="mt-0.5 block text-xs text-slate-500">{children}</span>}
      </span>
    </button>
  )
}

interface Progress {
  person?: Person
  stage: 'sent' | 'accepted'
  sentText: string
  acceptedText?: string
}

function Working({ progress }: { progress: Progress }) {
  const accepted = progress.stage === 'accepted'
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="relative">
        {progress.person ? <Avatar person={progress.person} size="xl" /> : <Loader2 className="size-12 animate-spin text-brand-500" />}
        {progress.person && (
          <span
            className={`absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full ring-4 ring-white transition ${accepted ? 'bg-emerald-500' : 'bg-brand-500'}`}
          >
            {accepted ? <CheckCircle2 className="size-5 text-white animate-pop" /> : <Send className="size-4 text-white" />}
          </span>
        )}
      </div>
      <p className="mt-6 font-display text-lg font-bold text-slate-900">{accepted ? progress.acceptedText : progress.sentText}</p>
      <p className="mt-1 max-w-xs text-sm text-slate-500">{accepted ? 'Updating the care network…' : 'Waiting for a response…'}</p>
      {progress.person && (
        <p className="mt-6 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
          Simulated: in production, {firstName(progress.person)} would get a notification and accept in the app
        </p>
      )}
    </div>
  )
}

function Done({ result, onClose }: { result: Result; onClose: () => void }) {
  const { navigate } = useCare()
  const remaining = useOpenGaps().length
  return (
    <div className="flex flex-col items-center py-12 text-center">
      <span className="flex size-20 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/60 animate-pop">
        <CheckCircle2 className="size-10 text-emerald-600" />
      </span>
      <p className="mt-6 font-display text-xl font-bold text-slate-900">{result.headline}</p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-600">{result.detail}</p>
      <p className="mt-6 text-sm text-slate-500">
        {remaining === 0
          ? 'No open care gaps remain. Nothing is falling through the cracks.'
          : `${remaining} open gap${remaining === 1 ? '' : 's'} remaining`}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button
          variant="secondary"
          icon={Orbit}
          onClick={() => {
            onClose()
            navigate('network')
          }}
        >
          See it on the network
        </Button>
        <Button onClick={onClose} iconRight={ArrowRight}>
          Back to care gaps
        </Button>
      </div>
    </div>
  )
}

// ----- per-kind flows ------------------------------------------------------

function UnownedFlow({ gap, task, run, onClose }: FlowProps) {
  const { actions, data } = useCare()
  const [selectedId, setSelectedId] = useState<number | null>(gap.suggested_assignee_id)
  const person = selectedId === null ? undefined : data.peopleById.get(selectedId)

  const send = (p: Person) =>
    run({
      person: p,
      sentText: `Request sent to ${firstName(p)}`,
      acceptedText: `${firstName(p)} accepted`,
      work: () => actions.resolveGap(gap.id, (api) => api.assignTask(task.id, p.id)),
      result: {
        headline: 'Gap resolved',
        detail: `"${task.title}" is now owned by ${p.full_name}. Everyone in the network can see who's handling it.`,
      },
    })

  return (
    <>
      <ProblemPanel gap={gap} task={task} />
      <Section title="Who could take this on?" hint="Ranked by role, availability, and current workload. Pick someone else to override the suggestion.">
        <CandidateList task={task} selectedId={selectedId} onSelect={setSelectedId} suggestedId={gap.suggested_assignee_id} />
      </Section>
      <ActionBar>
        <Button variant="ghost" onClick={onClose}>
          Not now
        </Button>
        <Button icon={Send} disabled={!person} onClick={() => person && send(person)}>
          {person ? `Ask ${firstName(person)} to take it` : 'Choose someone'}
        </Button>
      </ActionBar>
    </>
  )
}

function RedundantFlow({ gap, task, run, onClose }: FlowProps) {
  const { actions, data } = useCare()
  const owners = task.assignments
    .map((a) => ({ a, person: data.peopleById.get(a.person_id) }))
    .filter((o): o is { a: (typeof task.assignments)[number]; person: Person } => !!o.person)
  const [choice, setChoice] = useState<number | 'shared' | undefined>(gap.suggested_assignee_id ?? owners[0]?.person.id)

  const confirm = () => {
    if (choice === 'shared') {
      return run({
        work: () => actions.resolveGap(gap.id, (api) => api.updateTask(task.id, { is_exclusive: false })),
        sentText: 'Converting to a shared task',
        result: { headline: 'Gap resolved', detail: `"${task.title}" is now a shared task, so multiple owners are intentional backup coverage.` },
      })
    }
    const keep = choice === undefined ? undefined : data.peopleById.get(choice)
    if (!keep) return
    const others = owners.filter((o) => o.person.id !== keep.id)
    return run({
      person: keep,
      sentText: `Confirming with ${firstName(keep)}`,
      acceptedText: `${firstName(keep)} confirmed`,
      work: () =>
        actions.resolveGap(gap.id, async (api) => {
          for (const o of others) await api.unassignTask(task.id, o.person.id)
        }),
      result: {
        headline: 'One clear owner',
        detail: `${keep.full_name} now owns "${task.title}". ${others.map((o) => firstName(o.person)).join(', ')} will be notified they can stand down (simulated).`,
      },
    })
  }

  return (
    <>
      <ProblemPanel gap={gap} task={task} />
      <Section title="Who should own it?" hint="The others are removed from this task. The suggestion is the owner with the lighter overall workload.">
        <div className="space-y-2">
          {owners.map(({ a, person }) => (
            <OptionCard key={person.id} selected={choice === person.id} onSelect={() => setChoice(person.id)} title={`Keep ${person.full_name}`}>
              {person.subrole} · assigned {new Date(a.assigned_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              {gap.suggested_assignee_id === person.id && ' · Suggested (lighter workload)'}
            </OptionCard>
          ))}
          <OptionCard selected={choice === 'shared'} onSelect={() => setChoice('shared')} icon={Users} title="Keep everyone and make it a shared task">
            Use this if the overlap is intentional, for example a backup caregiver.
          </OptionCard>
        </div>
      </Section>
      <ActionBar>
        <Button variant="ghost" onClick={onClose}>
          Not now
        </Button>
        <Button icon={UserCheck} onClick={confirm}>
          Resolve overlap
        </Button>
      </ActionBar>
    </>
  )
}

function MissedFlow({ gap, task, run, onClose }: FlowProps) {
  const { actions, data } = useCare()
  const missed = task.assignments.find((a) => a.status === 'missed')
  const ownerId = missed?.person_id ?? -1
  const owner = data.peopleById.get(ownerId)
  const [mode, setMode] = useState<'reassign' | 'retry' | 'done'>('reassign')
  const [selectedId, setSelectedId] = useState<number | null>(gap.suggested_assignee_id)
  const excludeIds = [ownerId]
  const person = selectedId === null ? undefined : data.peopleById.get(selectedId)

  if (!owner) return <p className="text-sm text-slate-600">This task no longer has a missed assignment.</p>

  const confirm = () => {
    if (mode === 'reassign') {
      if (!person) return
      return run({
        person,
        sentText: `Request sent to ${firstName(person)}`,
        acceptedText: `${firstName(person)} accepted`,
        work: () =>
          actions.resolveGap(gap.id, async (api) => {
            await api.unassignTask(task.id, owner.id)
            await api.assignTask(task.id, person.id)
            await api.updateTask(task.id, { due_date: daysFromToday(1) })
          }),
        result: { headline: 'Back on track', detail: `${person.full_name} will handle "${task.title}" by tomorrow.` },
      })
    }
    if (mode === 'retry') {
      return run({
        person: owner,
        sentText: `Reminder sent to ${firstName(owner)}`,
        acceptedText: `${firstName(owner)} confirmed`,
        work: () =>
          actions.resolveGap(gap.id, async (api) => {
            await api.updateTask(task.id, { due_date: daysFromToday(1) })
            await api.setAssignmentStatus(task.id, owner.id, 'pending')
          }),
        result: { headline: 'Rescheduled', detail: `${owner.full_name} committed to "${task.title}" by tomorrow.` },
      })
    }
    return run({
      work: () => actions.resolveGap(gap.id, (api) => api.setAssignmentStatus(task.id, owner.id, 'done')),
      sentText: 'Marking complete',
      result: { headline: 'Marked complete', detail: `"${task.title}" is recorded as done.` },
    })
  }

  return (
    <>
      <ProblemPanel gap={gap} task={task} />
      <Section title="How do you want to recover it?">
        <div className="space-y-2">
          <OptionCard selected={mode === 'reassign'} onSelect={() => setMode('reassign')} title="Hand it to someone else">
            Assign a different caregiver and set the deadline to tomorrow.
          </OptionCard>
          <OptionCard selected={mode === 'retry'} onSelect={() => setMode('retry')} title={`Give ${firstName(owner)} a new deadline`}>
            Keep {firstName(owner)} as owner and reschedule for tomorrow.
          </OptionCard>
          <OptionCard selected={mode === 'done'} onSelect={() => setMode('done')} title="It actually happened, so mark it complete">
            Use this if it was done but never recorded.
          </OptionCard>
        </div>
      </Section>
      {mode === 'reassign' && (
        <Section title="Who should take it over?">
          <CandidateList task={task} selectedId={selectedId} onSelect={setSelectedId} suggestedId={gap.suggested_assignee_id} excludeIds={excludeIds} />
        </Section>
      )}
      <ActionBar>
        <Button variant="ghost" onClick={onClose}>
          Not now
        </Button>
        <Button icon={CheckCircle2} disabled={mode === 'reassign' && !person} onClick={confirm}>
          Recover task
        </Button>
      </ActionBar>
    </>
  )
}

function highlightAmounts(text: string): ReactNode[] {
  const parts = text.split(/(\d[\d.–-]*\s?L(?:\s?per day|\/day)?)/g)
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded bg-amber-100 px-0.5 font-semibold text-amber-900">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

function PlanConflictFlow({ gap, run, onClose }: Omit<FlowProps, 'task'>) {
  const { actions, data, toast } = useCare()
  const plans = data.carePlans.filter((p) => gap.related_care_plan_ids.includes(p.id))
  const isPhysician = data.viewer.is_physician
  const reviewer = gap.suggested_assignee_id ? data.peopleById.get(gap.suggested_assignee_id) : undefined
  const [prevails, setPrevails] = useState(plans[0]?.id)

  const reconcile = () => {
    const plan = plans.find((p) => p.id === prevails)
    if (!plan) return
    return run({
      work: () => actions.resolveGap(gap.id),
      sentText: 'Recording reconciliation',
      result: {
        headline: 'Plans reconciled',
        detail: `${data.viewer.full_name} confirmed that the "${plan.title}" guidance takes priority. Caregivers now see one instruction.`,
      },
    })
  }

  return (
    <>
      <ProblemPanel gap={gap} />
      <div className="mt-4 flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-800 ring-1 ring-violet-200">
        <Cpu className="size-4 shrink-0" />
        Flagged by the optional AI care-plan review (simulated in this demo). Core gap detection never depends on it.
      </div>
      <Section title="Conflicting instructions">
        <div className="grid gap-3 sm:grid-cols-2">
          {plans.map((p) => (
            <div key={p.id} className="rounded-2xl border border-slate-200 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Avatar person={data.peopleById.get(p.author_person_id)} size="xs" /> {p.title}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{data.peopleById.get(p.author_person_id)?.full_name}</p>
              {p.is_redacted ? (
                <div className="mt-3">
                  <RestrictedNotice patientName={firstName(data.patient)} />
                </div>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-slate-700">{highlightAmounts(p.raw_text)}</p>
              )}
            </div>
          ))}
        </div>
      </Section>

      {isPhysician ? (
        <Section title="Which guidance should caregivers follow?" hint="Physician-only action.">
          <div className="space-y-2">
            {plans.map((p) => (
              <OptionCard key={p.id} selected={prevails === p.id} onSelect={() => setPrevails(p.id)} icon={Stethoscope} title={p.title}>
                {data.peopleById.get(p.author_person_id)?.full_name}
              </OptionCard>
            ))}
          </div>
        </Section>
      ) : (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">Clinical decision needed</p>
          <p className="mt-1">
            Family members and non-physician staff can't resolve clinical conflicts. You can ask {reviewer?.full_name ?? 'a physician'} to review it.
          </p>
        </div>
      )}

      <ActionBar>
        <Button variant="ghost" onClick={onClose}>
          Not now
        </Button>
        {isPhysician ? (
          <Button icon={Stethoscope} onClick={reconcile}>
            Mark reconciled
          </Button>
        ) : (
          <Button
            icon={Bell}
            onClick={() => {
              toast(`Review request sent to ${reviewer?.full_name ?? 'the physician'} (simulated)`)
              onClose()
            }}
          >
            Ask {reviewer ? firstName(reviewer) : 'physician'} to review
          </Button>
        )}
      </ActionBar>
    </>
  )
}

type EditableMove = RebalanceMove & { include: boolean }

function WorkloadFlow({ gap, run, onClose }: Omit<FlowProps<WorkloadGap>, 'task'>) {
  const { actions, data, derived } = useCare()
  const imb = derived.imbalance
  const overloaded = data.peopleById.get(gap.overloaded_person_id)
  const family = data.people.filter((p) => p.person_type === 'family' && p.id !== gap.overloaded_person_id)
  const [moves, setMoves] = useState<EditableMove[]>(() => (imb?.plan.moves ?? []).map((m) => ({ ...m, include: true })))

  const accepted = moves.filter((m) => m.include)
  const projected = useMemo(
    () => computeStrain(applyMoves(data.tasks, accepted), data.people, derived.sentimentByPerson),
    [data, accepted, derived.sentimentByPerson],
  )
  const before = derived.strainRows

  if (!imb || !overloaded) return <p className="text-sm text-slate-600">Workload is already balanced.</p>

  const updateMove = (i: number, change: Partial<EditableMove>) => setMoves((all) => all.map((x, j) => (j === i ? { ...x, ...change } : x)))

  const apply = () => {
    const first = data.peopleById.get(accepted[0].toId)
    return run({
      person: first,
      sentText: accepted.length > 1 ? `Requests sent to ${accepted.length} caregivers` : `Request sent to ${firstName(first)}`,
      acceptedText: accepted.length > 1 ? 'Everyone accepted' : `${firstName(first)} accepted`,
      work: () => actions.applyMoves(accepted),
      result: {
        headline: 'Care rebalanced',
        detail: `${accepted.length} task${accepted.length === 1 ? '' : 's'} moved off ${firstName(overloaded)}'s plate. ${firstName(overloaded)}'s strain index is now projected at ${projected.find((r) => r.person_id === overloaded.id)?.score}/100.`,
      },
    })
  }

  return (
    <>
      <ProblemPanel gap={gap} />
      <Section title="Before and after" hint="Projected strain index for each family caregiver if you accept the plan below.">
        <div className="space-y-2.5">
          {before.map((row) => {
            const after = projected.find((r) => r.person_id === row.person_id) ?? row
            const person = data.peopleById.get(row.person_id)
            return (
              <div key={row.person_id} className="flex items-center gap-3">
                <Avatar person={person} size="xs" />
                <span className="w-20 truncate text-xs font-medium text-slate-700">{firstName(person)}</span>
                <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-slate-300" style={{ width: `${row.score}%` }} />
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${after.level.key === 'high' ? 'bg-rose-500' : after.level.key === 'elevated' ? 'bg-amber-400' : 'bg-emerald-500'}`}
                    style={{ width: `${after.score}%` }}
                  />
                </div>
                <span className="w-16 text-right text-xs tabular-nums text-slate-600">
                  {row.score} → <span className="font-semibold text-slate-900">{after.score}</span>
                </span>
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="Suggested rebalancing plan" hint="Accept, skip, or reassign each move. Suggestions only use family caregivers who match the task's role.">
        <div className="space-y-2">
          {moves.map((m, i) => {
            const task = data.tasksById.get(m.taskId)
            if (!task) return null
            const ranked = rankCandidates({ task, people: data.people, tasks: data.tasks, availability: data.availability, pool: family }).eligible
            return (
              <div key={m.taskId} className={`rounded-2xl border p-4 transition ${m.include ? 'border-slate-200' : 'border-dashed border-slate-200 opacity-60'}`}>
                <div className="flex items-start gap-3">
                  <CategoryIcon category={task.category} className="size-9" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                    <p className="text-xs text-slate-500">{FREQUENCY_LABEL[task.frequency]}</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                    <input
                      type="checkbox"
                      checked={m.include}
                      onChange={(e) => updateMove(i, { include: e.target.checked })}
                      className="size-4 accent-brand-600"
                    />
                    Include
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 pl-12 text-xs text-slate-600">
                  <Avatar person={overloaded} size="xs" /> {firstName(overloaded)}
                  <ArrowRight className="size-3.5 text-slate-400" />
                  <select
                    value={m.toId}
                    onChange={(e) => updateMove(i, { toId: Number(e.target.value) })}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                    aria-label={`New owner for ${task.title}`}
                  >
                    {ranked.map((c) => (
                      <option key={c.person.id} value={c.person.id}>
                        {c.person.full_name}
                        {c.person.id === imb.plan.moves[i]?.toId ? ' (suggested)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )
          })}
        </div>
      </Section>
      <p className="mt-4 text-xs text-slate-400">
        The strain index is illustrative, not a clinical burnout measure. The formula is shown on the Workload page.
      </p>
      <ActionBar>
        <Button variant="ghost" onClick={onClose}>
          Not now
        </Button>
        <Button icon={Send} disabled={accepted.length === 0} onClick={apply}>
          Send {accepted.length} request{accepted.length === 1 ? '' : 's'}
        </Button>
      </ActionBar>
    </>
  )
}

// ----- drawer --------------------------------------------------------------

const TASK_FLOWS: Partial<Record<Gap['gap_kind'], ComponentType<FlowProps>>> = {
  unowned: UnownedFlow,
  redundant: RedundantFlow,
  missed: MissedFlow,
}

function FlowFor({ gap, run, onClose }: { gap: DisplayGap; run: Run; onClose: () => void }) {
  const { data } = useCare()
  if (gap.gap_kind === 'workload') return <WorkloadFlow gap={gap} run={run} onClose={onClose} />
  if (gap.is_redacted) return <RestrictedNotice patientName={firstName(data.patient)} />
  if (gap.status === 'resolved') return <p className="text-sm text-slate-600">This gap has already been resolved.</p>
  if (gap.gap_kind === 'plan_conflict') return <PlanConflictFlow gap={gap} run={run} onClose={onClose} />

  const task = gap.task_id ? data.tasksById.get(gap.task_id) : undefined
  const Flow = TASK_FLOWS[gap.gap_kind]
  if (!task || !Flow) return <p className="text-sm text-slate-600">This task no longer exists.</p>
  return <Flow gap={gap} task={task} run={run} onClose={onClose} />
}

export function GapResolutionDrawer({ gap, onClose }: { gap: DisplayGap | null; onClose: () => void }) {
  const [phase, setPhase] = useState<'review' | 'working' | 'done'>('review')
  const [progress, setProgress] = useState<Progress | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  if (!gap) return null
  const meta = GAP_KIND_META[gap.gap_kind]

  const run: Run = async ({ person, sentText, acceptedText, work, result: r }) => {
    setPhase('working')
    setProgress({ person, stage: 'sent', sentText, acceptedText })
    if (person) {
      await wait(1300)
      setProgress((p) => (p ? { ...p, stage: 'accepted' } : p))
      await wait(600)
    }
    const ok = await work()
    if (ok) {
      setResult(r)
      setPhase('done')
    } else {
      setPhase('review')
    }
  }

  const resolved = gap.gap_kind !== 'workload' && gap.status === 'resolved'

  return (
    <Drawer
      open
      onClose={onClose}
      title={meta.label}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          {resolved ? <span className="text-emerald-700">Resolved</span> : <SeverityBadge severity={gap.severity} />}
          {gap.gap_kind === 'workload' && <span className="text-xs text-slate-500">Computed from the illustrative strain formula</span>}
        </span>
      }
    >
      {phase === 'working' && progress && <Working progress={progress} />}
      {phase === 'done' && result && <Done result={result} onClose={onClose} />}
      {phase === 'review' && <FlowFor gap={gap} run={run} onClose={onClose} />}
    </Drawer>
  )
}
