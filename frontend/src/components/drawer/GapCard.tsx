import { useEffect, useRef } from 'react'
import { Lock, UserRound } from 'lucide-react'
import { GAP_KIND_LABEL } from '../../lib/format'
import { useConstellation } from '../../store/useConstellation'
import type { Gap } from '../../types/api'
import { SeverityChip } from '../common/Chips'

interface Props {
  gap: Gap
  /** Highlighted because the graph selection or hover touches this gap. */
  active: boolean
}

export function GapCard({ gap, active }: Props) {
  const ref = useRef<HTMLLIElement>(null)
  const assignee = useConstellation((s) => s.people.find((p) => p.id === gap.suggested_assignee_id))
  const pinned = useConstellation((s) => s.highlightedGapId === gap.id)
  const highlightGap = useConstellation((s) => s.highlightGap)
  const accept = useConstellation((s) => s.acceptReassignment)

  // When the graph points at this gap, bring the card into view.
  useEffect(() => {
    if (pinned) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [pinned])

  return (
    <li
      ref={ref}
      onMouseEnter={() => highlightGap(gap.id)}
      onMouseLeave={() => highlightGap(null)}
      onFocus={() => highlightGap(gap.id)}
      onBlur={() => highlightGap(null)}
      className={`rounded-lg border bg-white p-3 transition-colors ${
        active ? 'border-danger-600 ring-1 ring-danger-600/30' : 'border-slate-200'
      }`}
    >
      <div className="flex items-center gap-2">
        <SeverityChip severity={gap.severity} />
        <span className="text-xs font-medium text-slate-500">{GAP_KIND_LABEL[gap.gap_kind]}</span>
      </div>

      <p className={`mt-2 flex items-start gap-1.5 text-sm ${gap.is_redacted ? 'italic text-slate-500' : 'text-slate-900'}`}>
        {gap.is_redacted && <Lock className="mt-0.5 size-3.5 shrink-0" aria-label="Restricted" />}
        {gap.description}
      </p>

      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
        <UserRound className="size-3.5 text-slate-400" aria-hidden />
        {assignee ? (
          <span>
            Suggested: <span className="font-semibold text-slate-900">{assignee.full_name}</span>{' '}
            <span className="capitalize text-slate-500">· {assignee.subrole}</span>
          </span>
        ) : (
          <span className="text-slate-500">No suggested assignee</span>
        )}
      </p>

      <button
        type="button"
        disabled={gap.is_redacted}
        onClick={() => void accept(gap)}
        className="mt-3 w-full rounded-md bg-navy-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
      >
        {gap.is_redacted
          ? 'Restricted: ask the patient for access'
          : gap.suggested_assignee_id === null
            ? 'Mark resolved'
            : 'Accept reassignment'}
      </button>
    </li>
  )
}
