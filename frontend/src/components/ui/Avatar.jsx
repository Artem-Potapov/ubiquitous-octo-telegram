import { initials, roleColor } from '../../domain/roles'

const SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-lg',
  xl: 'size-20 text-2xl',
}

export function Avatar({ person, size = 'md', className = '', status }) {
  if (!person) return null
  const color = roleColor(person)
  const ring =
    status === 'missed' ? 'ring-2 ring-rose-500' : status === 'done' ? 'ring-2 ring-emerald-500' : 'ring-2 ring-white'
  return (
    <span
      title={`${person.full_name} · ${person.subrole}`}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${SIZES[size]} ${ring} ${className}`}
      style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
    >
      {initials(person.full_name)}
    </span>
  )
}

export function AvatarStack({ people, max = 4, size = 'sm' }) {
  const shown = people.slice(0, max)
  return (
    <span className="flex -space-x-2">
      {shown.map((p) => (
        <Avatar key={p.id} person={p} size={size} />
      ))}
      {people.length > max && (
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600 ring-2 ring-white">
          +{people.length - max}
        </span>
      )}
    </span>
  )
}
