import { CATEGORY_META, GAP_KIND_META, SEVERITY_META, STRAIN_META, TASK_STATUS_META } from './meta'
import { ROLE_KINDS, roleKind } from '../../domain/roles'

export function Badge({ className = 'bg-slate-100 text-slate-700 ring-slate-200', icon: Icon, children }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}>
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </span>
  )
}

export function SeverityBadge({ severity }) {
  const m = SEVERITY_META[severity]
  return (
    <Badge className={m.badge} icon={m.icon}>
      {m.label} severity
    </Badge>
  )
}

export function GapKindBadge({ kind }) {
  const m = GAP_KIND_META[kind]
  return (
    <Badge className="bg-white text-slate-700 ring-slate-200" icon={m.icon}>
      {m.short}
    </Badge>
  )
}

export function TaskStatusBadge({ status }) {
  const m = TASK_STATUS_META[status]
  return (
    <Badge className={m.badge} icon={m.icon}>
      {m.label}
    </Badge>
  )
}

export function StrainBadge({ level }) {
  return <Badge className={STRAIN_META[level.key].badge}>{level.label}</Badge>
}

export function RoleBadge({ person }) {
  const kind = roleKind(person)
  return <Badge className={ROLE_KINDS[kind].soft}>{person.subrole}</Badge>
}

export function CategoryIcon({ category, className = 'size-9' }) {
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
