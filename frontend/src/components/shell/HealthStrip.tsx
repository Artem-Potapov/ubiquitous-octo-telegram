import { CircleCheck } from 'lucide-react'
import { isBurnoutWarning } from '../../lib/burnout'
import { useConstellation } from '../../store/useConstellation'
import { Skeleton } from '../common/Skeleton'

type Tone = 'bad' | 'warn' | 'good'

const VALUE_TONE: Record<Tone, string> = { bad: 'text-danger-700', warn: 'text-warn-700', good: 'text-ok-700' }

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: Tone }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      {/* Remounting on change replays the fade, so a resolved gap visibly moves the number. */}
      <p key={value} className={`mt-0.5 flex animate-fade-in items-center gap-1.5 font-mono text-2xl font-semibold ${VALUE_TONE[tone]}`}>
        {tone === 'good' && <CircleCheck className="size-5" aria-hidden />}
        {value}
      </p>
      <p className="truncate text-xs text-slate-500">{sub}</p>
    </div>
  )
}

/** At-a-glance state of the care network. All figures come from data already in the store. */
export function HealthStrip() {
  const gaps = useConstellation((s) => s.gaps)
  const tasks = useConstellation((s) => s.tasks)
  const burnout = useConstellation((s) => s.burnout)
  const loading = useConstellation((s) => s.loading)

  if (loading) {
    return (
      <div role="status" aria-label="Loading summary" className="flex gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[76px] flex-1" />
        ))}
      </div>
    )
  }

  const unowned = gaps.filter((g) => g.gap_kind === 'unowned').length
  const atRisk = burnout.filter(isBurnoutWarning).length
  const withGap = new Set(gaps.map((g) => g.task_id).filter((id): id is number => id !== null))
  const covered = tasks.length - withGap.size

  return (
    <div className="flex gap-3" role="group" aria-label="Care network summary">
      <Tile label="Open gaps" value={String(gaps.length)} sub="Need a decision" tone={gaps.length > 0 ? 'bad' : 'good'} />
      <Tile label="Unowned tasks" value={String(unowned)} sub="Nobody is responsible" tone={unowned > 0 ? 'bad' : 'good'} />
      <Tile label="Burnout risk" value={String(atRisk)} sub="Caregivers to check on" tone={atRisk > 0 ? 'warn' : 'good'} />
      <Tile label="Tasks with a clear owner" value={`${covered}/${tasks.length}`} sub="Without any gap" tone={withGap.size > 0 ? 'warn' : 'good'} />
    </div>
  )
}
