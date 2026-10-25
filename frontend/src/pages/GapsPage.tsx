import { useState } from 'react'
import { CheckCircle2, Info } from 'lucide-react'
import { useCare } from '../state/careContext'
import { useOpenGaps } from '../state/useGaps'
import { Card, EmptyState } from '../components/ui/Card'
import { GapCard } from '../components/gaps/GapCard'
import { GapResolutionDrawer } from '../components/gaps/GapResolutionDrawer'
import { GAP_KIND_META, SEVERITY_META } from '../components/ui/meta'
import { IMBALANCE_SHARE } from '../domain/workload'
import type { GapSeverity } from '../api/contract'
import type { DisplayGap } from '../state/useGaps'
import type { DisplayGapKind } from '../components/ui/meta'

const KIND_ORDER: DisplayGapKind[] = ['unowned', 'redundant', 'missed', 'workload', 'plan_conflict']

const RULES: [DisplayGapKind, string][] = [
  ['unowned', 'A task has zero owners.'],
  ['redundant', 'A single-owner task has two or more owners. Shared tasks with backups are fine.'],
  ['missed', 'An owner’s assignment is marked missed.'],
  ['workload', `One family caregiver carries ≥${IMBALANCE_SHARE * 100}% of the family’s weekly task load.`],
  ['plan_conflict', 'Optional AI review finds contradictory care-plan instructions.'],
]

export function GapsPage() {
  const { data, navParams } = useCare()
  const open = useOpenGaps()
  const [tab, setTab] = useState<'open' | 'resolved'>('open')
  const [openGap, setOpenGap] = useState<DisplayGap | null>(() => (navParams.openGapId ? open.find((g) => g.id === navParams.openGapId) ?? null : null))

  const list: DisplayGap[] = tab === 'open' ? open : [...data.resolvedGaps].reverse()
  const bySeverity = (s: GapSeverity) => open.filter((g) => g.severity === s).length

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-ink-900 p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -left-16 -top-20 size-72 rounded-full bg-rose-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-0 size-80 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-300">Care gap detection</p>
            <h2 className="mt-2 font-display text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
              We make the invisible space between caregivers visible.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Chronic care rarely fails because people don't care. It fails when nobody knows who is responsible for what. These gaps were found
              automatically from the care network's tasks and assignments.
            </p>
          </div>
          <div className="flex gap-3">
            {(['high', 'medium', 'low'] as const).map((s) => (
              <div key={s} className="min-w-20 rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
                <p className="flex items-center gap-1.5 text-xs text-slate-300">
                  <span className="size-2 rounded-full" style={{ background: SEVERITY_META[s].dot }} />
                  {SEVERITY_META[s].label}
                </p>
                <p className="mt-1 font-display text-2xl font-bold tabular-nums">{bySeverity(s)}</p>
              </div>
            ))}
            <div className="min-w-20 rounded-2xl bg-emerald-400/10 px-4 py-3 ring-1 ring-emerald-400/20">
              <p className="flex items-center gap-1.5 text-xs text-emerald-200">
                <CheckCircle2 className="size-3" /> Resolved
              </p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums">{data.resolvedGaps.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {KIND_ORDER.map((k) => {
          const m = GAP_KIND_META[k]
          const Icon = m.icon
          const n = open.filter((g) => g.gap_kind === k).length
          return (
            <div key={k} className={`rounded-2xl border p-4 ${n ? 'border-rose-200 bg-white' : 'border-slate-200 bg-white/60'}`}>
              <div className="flex items-center justify-between">
                <Icon className={`size-5 ${n ? 'text-rose-500' : 'text-slate-300'}`} />
                <span className={`font-display text-xl font-bold tabular-nums ${n ? 'text-slate-900' : 'text-slate-300'}`}>{n}</span>
              </div>
              <p className={`mt-2 text-sm font-semibold ${n ? 'text-slate-800' : 'text-slate-400'}`}>{m.label}</p>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-4 inline-flex rounded-xl bg-white p-1 ring-1 ring-slate-200" role="tablist">
            {(
              [
                ['open', `Open (${open.length})`],
                ['resolved', `Resolved (${data.resolvedGaps.length})`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${tab === k ? 'bg-ink-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {list.length === 0 ? (
            <Card>
              <EmptyState icon={CheckCircle2} title={tab === 'open' ? 'Nothing is falling through the cracks' : 'No resolved gaps yet'}>
                {tab === 'open' ? 'Every responsibility has exactly one clear owner, and nothing is overdue.' : 'Resolved gaps will appear here with who fixed them.'}
              </EmptyState>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {list.map((g) => (
                <GapCard key={g.id} gap={g} onOpen={tab === 'open' ? setOpenGap : undefined} />
              ))}
            </div>
          )}
        </div>

        <Card className="h-fit p-5">
          <p className="flex items-center gap-2 font-display text-sm font-bold text-slate-900">
            <Info className="size-4 text-slate-400" /> How detection works
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Deterministic rules run whenever tasks change. They need no AI, and they're the same rules the backend engine will run.
          </p>
          <ul className="mt-4 space-y-3">
            {RULES.map(([k, text]) => {
              const m = GAP_KIND_META[k]
              const Icon = m.icon
              return (
                <li key={k} className="flex gap-3">
                  <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  <p className="text-xs leading-relaxed text-slate-600">
                    <span className="font-semibold text-slate-800">{m.label}.</span> {text}
                  </p>
                </li>
              )
            })}
          </ul>
          <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
            Suggestions rank people by role match, availability on the due date, and current workload. Anyone who doesn't match a task's required role
            is never suggested, so clinical tasks can't land on family members.
          </p>
        </Card>
      </div>

      {openGap && <GapResolutionDrawer gap={openGap} onClose={() => setOpenGap(null)} />}
    </div>
  )
}
