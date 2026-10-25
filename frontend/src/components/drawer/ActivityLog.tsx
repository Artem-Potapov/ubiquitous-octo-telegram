import { CircleAlert, CircleCheck, MessageSquare } from 'lucide-react'
import { timeLabel } from '../../lib/format'
import { useConstellation } from '../../store/useConstellation'

const ICON = {
  info: <MessageSquare className="size-3.5 text-navy-600" aria-hidden />,
  success: <CircleCheck className="size-3.5 text-ok-600" aria-hidden />,
  error: <CircleAlert className="size-3.5 text-danger-600" aria-hidden />,
}

/** Closed-loop trail: gap resolved, task reassigned, SMS alert delivered. */
export function ActivityLog() {
  const activity = useConstellation((s) => s.activity)

  return (
    <section aria-label="Activity" className="shrink-0 border-t border-slate-200 bg-slate-50">
      <p className="px-4 pb-1 pt-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Activity</p>
      <ul aria-live="polite" className="max-h-36 space-y-1.5 overflow-y-auto px-4 pb-3">
        {activity.length === 0 ? (
          <li className="text-xs text-slate-500">Reassignments and SMS alerts will appear here.</li>
        ) : (
          activity.map((a) => (
            <li key={a.id} className="flex items-start gap-2 text-xs text-slate-700">
              <span className="mt-0.5">{ICON[a.tone]}</span>
              <span className="min-w-0 flex-1">{a.text}</span>
              <span className="font-mono text-slate-400">{timeLabel(a.at)}</span>
            </li>
          ))
        )}
      </ul>
    </section>
  )
}
