import { useState } from 'react'
import { ArrowRight, Calculator, HeartHandshake, Lock, Scale, Stethoscope } from 'lucide-react'
import { useCare } from '../state/careContext'
import { useOpenGaps } from '../state/useGaps'
import { Card, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Avatar } from '../components/ui/Avatar'
import { RoleBadge, StrainBadge } from '../components/ui/Badge'
import { STRAIN_META } from '../components/ui/meta'
import { DistributionChart, StrainSparkline } from '../components/workload/WorkloadCharts'
import { GapResolutionDrawer } from '../components/gaps/GapResolutionDrawer'
import { STRAIN_WEIGHTS, STRAIN_LEVELS, computeWeeklyLoads } from '../domain/workload'
import { firstName } from '../domain/roles'
import { formatDateTime } from '../domain/dates'

const MOODS = [
  { score: -1, emoji: '😣', label: 'Overwhelmed' },
  { score: -0.5, emoji: '😟', label: 'Stretched' },
  { score: 0, emoji: '😐', label: 'Okay' },
  { score: 0.5, emoji: '🙂', label: 'Good' },
  { score: 1, emoji: '😄', label: 'Great' },
]

function CaregiverCard({ row }) {
  const { data } = useCare()
  const person = data.peopleById.get(row.person_id)
  const parts = [
    ['Share of family load', row.components.loadShare, `${Math.round(row.share * 100)}% × ${STRAIN_WEIGHTS.loadShare}`],
    ['Missed responsibilities', row.components.missed, `${row.missed_count} × ${STRAIN_WEIGHTS.perMissed} (max ${STRAIN_WEIGHTS.missedCap})`],
    ['Wellbeing check-ins', row.components.wellbeing, row.sentiment_average === null ? 'no check-ins' : `avg mood ${row.sentiment_average.toFixed(2)}`],
  ]
  return (
    <Card className={`p-5 ${row.level.key === 'high' ? 'ring-2 ring-rose-200' : ''}`}>
      <div className="flex items-start gap-3">
        <Avatar person={person} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">{person.full_name}</p>
          <RoleBadge person={person} />
        </div>
        <StrainBadge level={row.level} />
      </div>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="font-display text-4xl font-extrabold tabular-nums text-slate-900">{row.score}</p>
          <p className="text-xs text-slate-500">strain index / 100</p>
        </div>
        <div className="w-40">
          <StrainSparkline history={data.burnoutHistory[row.person_id] ?? []} current={row.score} />
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-all duration-700 ${STRAIN_META[row.level.key].bar}`} style={{ width: `${row.score}%` }} />
      </div>
      <ul className="mt-4 space-y-1.5 border-t border-slate-100 pt-3">
        {parts.map(([label, pts, how]) => (
          <li key={label} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-600">
              {label} <span className="text-slate-400">({how})</span>
            </span>
            <span className="font-semibold tabular-nums text-slate-800">+{Math.round(pts)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-500">
        {row.taskCount} active tasks · {Number(row.load.toFixed(1))} task occurrences per week
      </p>
    </Card>
  )
}

function CheckinCard() {
  const { data, actions, busy } = useCare()
  const [mood, setMood] = useState(null)
  const [note, setNote] = useState('')

  const submit = async () => {
    const m = MOODS.find((x) => x.score === mood)
    const ok = await actions.submitCheckin(m.score, note.trim() || `Feeling ${m.label.toLowerCase()}`)
    if (ok) {
      setMood(null)
      setNote('')
    }
  }

  return (
    <Card className="p-5">
      <p className="flex items-center gap-2 font-display text-sm font-bold text-slate-900">
        <HeartHandshake className="size-4 text-rose-500" /> How are you holding up, {firstName(data.viewer)}?
      </p>
      <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
        <Lock className="size-3" /> Private. Only you see your check-ins. Others see just the strain index.
      </p>
      <div className="mt-4 grid grid-cols-5 gap-2">
        {MOODS.map((m) => (
          <button
            key={m.score}
            type="button"
            onClick={() => setMood(m.score)}
            aria-pressed={mood === m.score}
            className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium transition ${
              mood === m.score ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-500' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span className="text-xl" aria-hidden>{m.emoji}</span>
            {m.label}
          </button>
        ))}
      </div>
      {mood !== null && (
        <div className="mt-3 space-y-3 animate-fade-in">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Anything you'd like to note? (optional)"
            className="w-full resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
          />
          <Button size="sm" disabled={busy} onClick={submit} className="w-full">
            Save check-in
          </Button>
        </div>
      )}
      {data.myCheckins.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-slate-100 pt-3">
          {data.myCheckins.slice(0, 3).map((c) => (
            <li key={c.id} className="text-xs">
              <p className="text-slate-700">“{c.message}”</p>
              <p className="text-slate-400">{formatDateTime(c.created_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function WorkloadPage() {
  const { data, derived } = useCare()
  const gaps = useOpenGaps()
  const [openGap, setOpenGap] = useState(null)
  const workloadGap = gaps.find((g) => g.gap_kind === 'workload')
  const imb = derived.imbalance
  const overloaded = imb && data.peopleById.get(imb.overloaded.person_id)
  const pros = data.people.filter((p) => p.person_type === 'professional')
  const loads = computeWeeklyLoads(data.tasks, data.people)

  return (
    <div className="space-y-6">
      {imb ? (
        <div className="flex flex-col gap-4 rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6 sm:flex-row sm:items-center">
          <Avatar person={overloaded} size="lg" className="!ring-4 !ring-amber-200" />
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Workload imbalance detected</p>
            <p className="mt-1 font-display text-xl font-bold text-slate-900">
              {overloaded.full_name} is carrying {Math.round(imb.overloaded.share * 100)}% of the family's care.
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Other family members have room to help. A rebalancing plan of {imb.plan.moves.length} task{imb.plan.moves.length === 1 ? '' : 's'} would bring{' '}
              {firstName(overloaded)}'s strain from {imb.overloaded.score} to about {imb.plan.after.find((r) => r.person_id === overloaded.id)?.score}.
            </p>
          </div>
          {workloadGap && (
            <Button onClick={() => setOpenGap(workloadGap)} iconRight={ArrowRight}>
              Rebalance care
            </Button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-4 rounded-3xl border border-emerald-200 bg-emerald-50/60 p-6">
          <Scale className="size-8 text-emerald-600" />
          <div>
            <p className="font-display text-lg font-bold text-slate-900">Care is shared fairly</p>
            <p className="text-sm text-slate-600">No family caregiver carries more than half of the weekly workload.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {derived.strainRows.map((row) => (
          <CaregiverCard key={row.person_id} row={row} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="pb-5">
            <CardHeader icon={Scale} title="How care is distributed" subtitle="Weekly task occurrences for each family caregiver, by category" />
            <div className="px-5 pt-5">
              <DistributionChart rows={derived.strainRows} />
            </div>
          </Card>

          <Card className="pb-2">
            <CardHeader icon={Stethoscope} title="Clinical team" subtitle="Shown for context. Professional workload is managed by their organizations." />
            <ul className="mt-3 divide-y divide-slate-100">
              {pros.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar person={p} size="sm" />
                  <span className="flex-1 text-sm font-medium text-slate-800">{p.full_name}</span>
                  <span className="text-xs text-slate-500">{loads.get(p.id).taskCount} task{loads.get(p.id).taskCount === 1 ? '' : 's'} in this network</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          {data.viewer.person_type === 'family' && <CheckinCard />}
          <Card className="p-5">
            <p className="flex items-center gap-2 font-display text-sm font-bold text-slate-900">
              <Calculator className="size-4 text-slate-400" /> How the strain index works
            </p>
            <div className="mt-3 rounded-xl bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-700">
              strain = {STRAIN_WEIGHTS.loadShare} × share of family load
              <br />+ {STRAIN_WEIGHTS.perMissed} × missed tasks (max {STRAIN_WEIGHTS.missedCap})
              <br />+ {STRAIN_WEIGHTS.wellbeing} × negative check-in mood
            </div>
            <ul className="mt-3 space-y-1 text-xs text-slate-600">
              {STRAIN_LEVELS.map((l) => (
                <li key={l.key} className="flex items-center gap-2">
                  <span className={`size-2 rounded-full ${STRAIN_META[l.key].bar}`} /> {l.label}: {l.min}+
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
              <span className="font-semibold">Illustrative only.</span> This is a transparent workload heuristic to prompt conversations about sharing care. It
              is not a clinically validated burnout or caregiver-strain assessment.
            </p>
          </Card>
        </div>
      </div>

      {openGap && <GapResolutionDrawer gap={openGap} onClose={() => setOpenGap(null)} />}
    </div>
  )
}
