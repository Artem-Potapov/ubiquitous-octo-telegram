import { ArrowRight, CheckCircle2, Cpu, Lock, Sparkles } from 'lucide-react'
import type { Person } from '../../api/contract'
import { useCare } from '../../state/careContext'
import type { DisplayGap } from '../../state/useGaps'
import { GAP_KIND_META, SEVERITY_META } from '../ui/meta'
import { SeverityBadge } from '../ui/Badge'
import { Avatar, AvatarStack } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { gapPeopleIds, gapTaskTitle } from '../../domain/gapView'
import { formatDateTime } from '../../domain/dates'
import { firstName } from '../../domain/roles'

interface GapCardProps {
  gap: DisplayGap
  onOpen?: (gap: DisplayGap) => void
  compact?: boolean
}

export function GapCard({ gap, onOpen, compact = false }: GapCardProps) {
  const { data, name } = useCare()
  const meta = GAP_KIND_META[gap.gap_kind]
  const sev = SEVERITY_META[gap.severity]
  const Icon = meta.icon
  // Only stored gaps can be resolved; the workload insight disappears instead.
  const resolvedGap = gap.gap_kind !== 'workload' && gap.status === 'resolved' ? gap : null
  const resolved = resolvedGap !== null

  const involvedIds = gap.gap_kind === 'workload' ? [gap.overloaded_person_id] : gapPeopleIds(gap, data)
  const involved = involvedIds.map((id) => data.peopleById.get(id)).filter((p): p is Person => !!p)
  const suggested = gap.suggested_assignee_id ? data.peopleById.get(gap.suggested_assignee_id) : null
  const title =
    gap.gap_kind === 'workload'
      ? `${name(gap.overloaded_person_id)} may be overloaded`
      : gap.is_redacted
        ? 'Restricted item'
        : gapTaskTitle(gap, data)

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border bg-white transition ${
        resolved ? 'border-emerald-200/70' : 'border-slate-200/80 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60'
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${resolved ? 'bg-emerald-400' : sev.bar}`} aria-hidden />
      <div className={`flex flex-col gap-3 ${compact ? 'p-4 pl-5' : 'p-5 pl-6'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex size-8 items-center justify-center rounded-lg ${resolved ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-700'}`}
          >
            {resolved ? <CheckCircle2 className="size-4" /> : <Icon className="size-4" />}
          </span>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{meta.label}</span>
          <span className="flex-1" />
          {resolved ? (
            <span className="text-xs font-medium text-emerald-700">Resolved</span>
          ) : (
            <SeverityBadge severity={gap.severity} />
          )}
        </div>

        <div>
          <h3 className="flex items-center gap-1.5 font-display text-[15px] font-bold leading-snug text-slate-900">
            {gap.is_redacted && <Lock className="size-4 text-slate-400" />}
            {title}
          </h3>
          <p className={`mt-1 text-sm leading-relaxed text-slate-600 ${compact ? 'line-clamp-2' : ''}`}>
            {gap.is_redacted ? `${firstName(data.patient)} has restricted this item. Only people they authorize can see or resolve it.` : gap.description}
          </p>
        </div>

        {!compact && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
            {involved.length > 0 && (
              <span className="flex items-center gap-2">
                <AvatarStack people={involved} size="xs" /> Involved
              </span>
            )}
            {gap.gap_kind === 'plan_conflict' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-700 ring-1 ring-violet-200">
                <Cpu className="size-3" /> Optional AI plan review
              </span>
            )}
            {gap.gap_kind === 'workload' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                Illustrative strain formula
              </span>
            )}
          </div>
        )}

        {resolved ? (
          <p className="text-xs text-slate-500">
            Resolved by {name(resolvedGap?.resolved_by_person_id)} · {formatDateTime(resolvedGap?.resolved_at ?? null)}
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            {suggested && !gap.is_redacted ? (
              <span className="flex min-w-0 items-center gap-2 text-xs text-slate-600">
                <Sparkles className="size-3.5 shrink-0 text-indigo-500" />
                <span className="shrink-0">{gap.gap_kind === 'redundant' ? 'Suggested owner to keep:' : 'Suggested:'}</span>
                <Avatar person={suggested} size="xs" />
                <span className="truncate font-semibold text-slate-800">{suggested.full_name}</span>
              </span>
            ) : (
              <span className="text-xs text-slate-400">{gap.is_redacted ? 'Authorized members only' : meta.action}</span>
            )}
            {onOpen && !gap.is_redacted && (
              <Button size="sm" onClick={() => onOpen(gap)} iconRight={ArrowRight}>
                {meta.action}
              </Button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

