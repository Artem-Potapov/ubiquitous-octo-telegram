import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { GapSeverity, Person, TaskCategory } from '../../api/contract'
import type { TaskDisplayStatus } from '../../domain/taskStatus'
import type { StrainLevel } from '../../domain/workload'
import { CATEGORY_META, SEVERITY_META, STRAIN_META, TASK_STATUS_META } from './meta'
import { ROLE_KINDS, roleKind } from '../../domain/roles'

interface BadgeProps {
  className?: string
  icon?: LucideIcon
  children: ReactNode
}

export function Badge({ className = 'bg-slate-100 text-slate-700 ring-slate-200', icon: Icon, children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}>
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </span>
  )
}

export function SeverityBadge({ severity }: { severity: GapSeverity }) {
  const m = SEVERITY_META[severity]
  return (
    <Badge className={m.badge} icon={m.icon}>
      {m.label} severity
    </Badge>
  )
}

export function TaskStatusBadge({ status }: { status: TaskDisplayStatus }) {
  const m = TASK_STATUS_META[status]
  return (
    <Badge className={m.badge} icon={m.icon}>
      {m.label}
    </Badge>
  )
}

export function StrainBadge({ level }: { level: StrainLevel }) {
  return <Badge className={STRAIN_META[level.key].badge}>{level.label}</Badge>
}

export function RoleBadge({ person }: { person: Person }) {
  const kind = roleKind(person)
  return <Badge className={ROLE_KINDS[kind].soft}>{person.subrole}</Badge>
}

export function CategoryIcon({ category, className = 'size-9' }: { category: TaskCategory; className?: string }) {
  const m = CATEGORY_META[category] ?? CATEGORY_META.other
  const Icon = m.icon
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl ${className}`}
      style={{ backgroundColor: `${m.color}14`, color: m.color }}
      title={m.label}
    >
      <Icon className="size-[55%]" aria-hidden />
    </span>
  )
}
