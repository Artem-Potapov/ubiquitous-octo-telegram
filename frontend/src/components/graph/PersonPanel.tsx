import { Lock, X } from 'lucide-react'
import { StatusChip } from '../common/Chips'
import { burnoutParts, STRAIN_LABEL, strainLevel } from '../../lib/burnout'
import { useConstellation } from '../../store/useConstellation'

const LEVEL_BAR = { manageable: 'bg-slate-400', elevated: 'bg-warn-600', high: 'bg-danger-600' }

/** Small panel for the selected node: their tasks and a burnout breakdown. */
export function PersonPanel() {
  const selectedId = useConstellation((s) => s.selectedPersonId)
  const people = useConstellation((s) => s.people)
  const tasks = useConstellation((s) => s.tasks)
  const burnout = useConstellation((s) => s.burnout)
  const select = useConstellation((s) => s.selectPerson)

  const person = people.find((p) => p.id === selectedId)
  if (!person) return null

  const score = burnout.find((b) => b.person_id === person.id)
  const level = score ? strainLevel(score.score) : null
  const mine = tasks.filter((t) => t.assignments.some((a) => a.person_id === person.id))

  return (
    <section aria-label={`${person.full_name} details`} className="w-72 rounded-md border border-slate-200 bg-white text-sm">
      <header className="flex items-start gap-2 border-b border-slate-200 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">{person.full_name}</p>
          <p className="text-xs capitalize text-slate-500">{person.subrole}</p>
        </div>
        <button
          type="button"
          onClick={() => select(null)}
          aria-label="Close details"
          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <X className="size-4" />
        </button>
      </header>

      {score && level && (
        <div className="border-b border-slate-200 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Burnout</span>
            <span className="font-mono text-sm font-semibold text-slate-900">
              {score.score}
              <span className="text-xs font-normal text-slate-500"> / 100 · {STRAIN_LABEL[level]}</span>
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-100">
            <div className={`h-full ${LEVEL_BAR[level]}`} style={{ width: `${score.score}%` }} />
          </div>
          <ul className="mt-3 space-y-1.5">
            {burnoutParts(score).map((part) => (
              <li key={part.label} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-slate-600">
                  {part.label} <span className="text-slate-400">· {part.detail}</span>
                </span>
                <span className="font-mono text-slate-900">+{Math.round(part.points)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-slate-400">Illustrative heuristic, not a clinical measure.</p>
        </div>
      )}

      <div className="max-h-56 overflow-y-auto p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Tasks ({mine.length})</p>
        {mine.length === 0 ? (
          <p className="text-xs text-slate-500">No assigned tasks.</p>
        ) : (
          <ul className="space-y-2">
            {mine.map((t) => {
              const status = t.assignments.find((a) => a.person_id === person.id)?.status ?? 'pending'
              return (
                <li key={t.id} className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-start gap-1 text-xs text-slate-800">
                    {t.is_redacted && <Lock className="mt-0.5 size-3 shrink-0 text-slate-500" aria-label="Restricted" />}
                    <span className={t.is_redacted ? 'italic text-slate-500' : ''}>{t.title}</span>
                  </span>
                  <StatusChip status={status} />
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
