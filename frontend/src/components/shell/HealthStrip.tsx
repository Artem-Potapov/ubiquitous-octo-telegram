import { useState } from 'react'
import { ChartNoAxesColumn, CircleCheck, X } from 'lucide-react'
import { isBurnoutWarning } from '../../lib/burnout'
import { useConstellation } from '../../store/useConstellation'
import { Skeleton } from '../common/Skeleton'

type Tone = 'bad' | 'warn' | 'good'

const TONE: Record<Tone, string> = {
  bad: 'text-danger-700',
  warn: 'text-warn-700',
  good: 'text-ok-700',
}

const STORAGE_KEY = 'constellation.summary.hidden'

// A per-viewer convenience only, so every read and write is guarded.
function readHidden(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}
function writeHidden(hidden: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, hidden ? '1' : '0')
  } catch {
    // Storage blocked: the choice just won't persist.
  }
}

function Pill({ value, label, tone }: { value: string; label: string; tone: Tone }) {
  return (
    <span className="flex items-baseline gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600">
      {/* Remounting on change replays the fade, so a resolved gap visibly moves the number. */}
      <span key={value} className={`inline-flex animate-fade-in items-center gap-1 font-mono text-sm font-semibold ${TONE[tone]}`}>
        {tone === 'good' && <CircleCheck className="size-3.5 self-center" aria-hidden />}
        {value}
      </span>
      {label}
    </span>
  )
}

/** Compact network summary that can be hidden to give the graph the whole canvas. */
export function HealthStrip() {
  const gaps = useConstellation((s) => s.gaps)
  const tasks = useConstellation((s) => s.tasks)
  const burnout = useConstellation((s) => s.burnout)
  const loading = useConstellation((s) => s.loading)
  const [hidden, setHidden] = useState(readHidden)

  const toggle = (next: boolean) => {
    setHidden(next)
    writeHidden(next)
  }

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => toggle(false)}
        aria-label="Show summary"
        title="Show summary"
        className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        <ChartNoAxesColumn className="size-3.5" aria-hidden />
        Summary
      </button>
    )
  }

  if (loading) return <Skeleton className="h-7 w-72" />

  const unowned = gaps.filter((g) => g.gap_kind === 'unowned').length
  const atRisk = burnout.filter(isBurnoutWarning).length
  const withGap = new Set(gaps.map((g) => g.task_id).filter((id): id is number => id !== null))
  const covered = tasks.length - withGap.size

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Care network summary">
      <Pill value={String(gaps.length)} label="open gaps" tone={gaps.length > 0 ? 'bad' : 'good'} />
      <Pill value={String(unowned)} label="unowned" tone={unowned > 0 ? 'bad' : 'good'} />
      <Pill value={String(atRisk)} label="burnout risk" tone={atRisk > 0 ? 'warn' : 'good'} />
      <Pill value={`${covered}/${tasks.length}`} label="tasks owned" tone={withGap.size > 0 ? 'warn' : 'good'} />
      <button
        type="button"
        onClick={() => toggle(true)}
        aria-label="Hide summary"
        title="Hide summary"
        className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
