import { CircleCheck, CircleX, Clock, Info, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { AssignmentStatus, GapSeverity } from '../../types/api'

// Color is never the only signal: every chip carries an icon and a text label.

const SEVERITY: Record<GapSeverity, { label: string; icon: LucideIcon; cls: string }> = {
  high: { label: 'High', icon: OctagonAlert, cls: 'border-danger-600/30 bg-danger-50 text-danger-700' },
  medium: { label: 'Medium', icon: TriangleAlert, cls: 'border-warn-600/30 bg-warn-50 text-warn-700' },
  low: { label: 'Low', icon: Info, cls: 'border-slate-300 bg-slate-50 text-slate-700' },
}

const STATUS: Record<AssignmentStatus, { label: string; icon: LucideIcon; cls: string }> = {
  pending: { label: 'Pending', icon: Clock, cls: 'border-slate-300 bg-slate-50 text-slate-700' },
  done: { label: 'Done', icon: CircleCheck, cls: 'border-ok-600/30 bg-ok-50 text-ok-700' },
  missed: { label: 'Missed', icon: CircleX, cls: 'border-danger-600/30 bg-danger-50 text-danger-700' },
}

const base = 'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold'

export function SeverityChip({ severity }: { severity: GapSeverity }) {
  const { label, icon: Icon, cls } = SEVERITY[severity]
  return (
    <span className={`${base} ${cls}`}>
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  )
}

export function StatusChip({ status }: { status: AssignmentStatus }) {
  const { label, icon: Icon, cls } = STATUS[status]
  return (
    <span className={`${base} ${cls}`}>
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  )
}
