import { useConstellation } from '../../store/useConstellation'
import type { Gap } from '../../types/api'
import { SeverityChip } from '../common/Chips'

export function ConflictCard({ gap }: { gap: Gap }) {
  const plans = useConstellation((s) => s.carePlans)
  const highlightGap = useConstellation((s) => s.highlightGap)
  const setDrawerTab = useConstellation((s) => s.setDrawerTab)
  const involved = plans.filter((p) => gap.related_care_plan_ids.includes(p.id))

  return (
    <li className="rounded-lg border border-danger-600/40 bg-danger-50 p-3">
      <div className="flex items-center gap-2">
        <SeverityChip severity={gap.severity} />
        <span className="text-xs font-medium text-danger-700">Care plan conflict</span>
      </div>
      <p className="mt-2 text-sm text-slate-900">{gap.description}</p>
      {involved.length > 0 && (
        <p className="mt-2 text-xs text-slate-600">Between: {involved.map((p) => p.title).join(' and ')}</p>
      )}
      <button
        type="button"
        onClick={() => {
          highlightGap(gap.id)
          setDrawerTab('gaps')
        }}
        className="mt-3 rounded-md border border-danger-600/40 bg-white px-2.5 py-1 text-xs font-medium text-danger-700 hover:bg-danger-50"
      >
        Show on graph and resolve
      </button>
    </li>
  )
}
