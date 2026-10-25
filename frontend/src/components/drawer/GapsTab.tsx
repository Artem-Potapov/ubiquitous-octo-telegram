import { CircleCheck, X } from 'lucide-react'
import { useGapGeometry } from '../../hooks/useGapGeometry'
import { useConstellation } from '../../store/useConstellation'
import { CardSkeletons } from '../common/Skeleton'
import { GapCard } from './GapCard'

export function GapsTab() {
  const gaps = useConstellation((s) => s.gaps)
  const loading = useConstellation((s) => s.loading)
  const actionError = useConstellation((s) => s.actionError)
  const dismiss = useConstellation((s) => s.dismissActionError)
  const highlightedGapId = useConstellation((s) => s.highlightedGapId)
  const selectedPersonId = useConstellation((s) => s.selectedPersonId)
  const { peopleByGap } = useGapGeometry()

  if (loading) return <CardSkeletons />

  return (
    <div className="space-y-3">
      {actionError && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-danger-600/30 bg-danger-50 p-2.5 text-xs text-danger-700">
          <span className="flex-1">{actionError}</span>
          <button type="button" onClick={dismiss} aria-label="Dismiss" className="rounded p-0.5 hover:bg-danger-600/10">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {gaps.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-ok-600/30 bg-ok-50 px-4 py-8 text-center">
          <CircleCheck className="size-8 text-ok-600" aria-hidden />
          <p className="text-sm font-semibold text-ok-700">No gaps. Care network is healthy</p>
          <p className="text-xs text-slate-600">Every task has a clear owner and no care plans conflict.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {gaps.map((gap) => (
            <GapCard
              key={gap.id}
              gap={gap}
              active={
                gap.id === highlightedGapId ||
                (selectedPersonId !== null && (peopleByGap.get(gap.id) ?? []).includes(selectedPersonId))
              }
            />
          ))}
        </ul>
      )}
    </div>
  )
}
