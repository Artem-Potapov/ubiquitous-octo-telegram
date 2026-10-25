import { useMemo, useState } from 'react'
import type { Person, Task } from '../../api/contract'
import { ChevronDown, CircleSlash, Sparkles } from 'lucide-react'
import { useCare } from '../../state/careContext'
import { rankCandidates, type ReasonTone } from '../../domain/suggestions'
import { Avatar } from '../ui/Avatar'

const TONE: Record<ReasonTone, string> = { good: 'text-emerald-700', warn: 'text-amber-700', neutral: 'text-slate-500' }
const DOT: Record<ReasonTone, string> = { good: 'bg-emerald-500', warn: 'bg-amber-500', neutral: 'bg-slate-300' }
const NONE: number[] = []

interface CandidateListProps {
  task: Task
  selectedId: number | null
  onSelect: (personId: number) => void
  suggestedId?: number | null
  pool?: Person[]
  excludeIds?: number[]
}

/**
 * Selectable, ranked list of people who could own `task`. The top-ranked
 * person (or `suggestedId`) is marked as the suggestion; ineligible people are
 * listed separately with the reason they can't be chosen.
 */
export function CandidateList({ task, selectedId, onSelect, suggestedId, pool, excludeIds = NONE }: CandidateListProps) {
  const { data } = useCare()
  const [showIneligible, setShowIneligible] = useState(false)

  const { eligible, ineligible } = useMemo(() => {
    const probe = { ...task, assignments: task.assignments.filter((a) => !excludeIds.includes(a.person_id)) }
    const ranked = rankCandidates({ task: probe, people: data.people, tasks: data.tasks, availability: data.availability, pool })
    return {
      eligible: ranked.eligible.filter((c) => !excludeIds.includes(c.person.id)),
      ineligible: ranked.ineligible.filter((c) => c.person.person_type !== 'patient'),
    }
  }, [task, data, pool, excludeIds])

  const suggestion = suggestedId ?? eligible[0]?.person.id
  const topScore = Math.max(1, ...eligible.map((c) => c.score))

  return (
    <div className="space-y-2">
      {eligible.length === 0 && (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">No one in the network is qualified and available for this task.</p>
      )}
      {eligible.map((c) => {
        const selected = selectedId === c.person.id
        const isSuggested = suggestion === c.person.id
        return (
          <button
            key={c.person.id}
            type="button"
            onClick={() => onSelect(c.person.id)}
            aria-pressed={selected}
            className={`w-full rounded-2xl border p-3.5 text-left transition ${
              selected ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className={`flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-brand-600' : 'border-slate-300'}`}>
                {selected && <span className="size-2 rounded-full bg-brand-600" />}
              </span>
              <Avatar person={c.person} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                  {c.person.full_name}
                  {isSuggested && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-200">
                      <Sparkles className="size-3" /> Suggested
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">{c.person.subrole}</p>
              </div>
              <div className="w-16 text-right">
                <p className="text-xs font-semibold text-slate-700 tabular-nums">Fit {Math.max(0, c.score)}</p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(4, (c.score / topScore) * 100)}%` }} />
                </div>
              </div>
            </div>
            <ul className="mt-2.5 grid gap-1 pl-7 sm:grid-cols-2">
              {c.reasons.map((r) => (
                <li key={r.text} className={`flex items-center gap-1.5 text-xs ${TONE[r.tone]}`}>
                  <span className={`size-1.5 shrink-0 rounded-full ${DOT[r.tone]}`} />
                  {r.text}
                </li>
              ))}
            </ul>
          </button>
        )
      })}

      {ineligible.length > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowIneligible((s) => !s)}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            <ChevronDown className={`size-3.5 transition ${showIneligible ? 'rotate-180' : ''}`} />
            {ineligible.length} not eligible {task.required_role ? `(requires ${task.required_role})` : ''}
          </button>
          {showIneligible && (
            <ul className="mt-2 space-y-1.5">
              {ineligible.map(({ person, reason }) => (
                <li key={person.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 opacity-80">
                  <Avatar person={person} size="xs" />
                  <span className="flex-1 text-xs font-medium text-slate-600">{person.full_name}</span>
                  <span className="flex items-center gap-1 text-[11px] text-slate-500">
                    <CircleSlash className="size-3" /> {reason}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
