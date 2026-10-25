import { Lock, ShieldCheck } from 'lucide-react'
import { useConstellation } from '../../store/useConstellation'
import { VIEWER_BY_ROLE } from '../../store/roles'

/** Says who you are viewing as and what that role can and cannot see. */
export function AccessBanner() {
  const role = useConstellation((s) => s.role)
  const people = useConstellation((s) => s.people)
  const tasks = useConstellation((s) => s.tasks)
  const plans = useConstellation((s) => s.carePlans)
  const rels = useConstellation((s) => s.relationships)
  const gaps = useConstellation((s) => s.gaps)
  const canView = useConstellation((s) => s.canViewRestricted)
  const loading = useConstellation((s) => s.loading)

  if (loading) return null

  const me = people.find((p) => p.id === VIEWER_BY_ROLE[role])
  const who = me ? `${role} (${me.full_name})` : role

  if (!canView) {
    const hidden =
      tasks.filter((t) => t.is_redacted).length +
      plans.filter((p) => p.is_redacted).length +
      rels.filter((r) => r.is_redacted).length +
      gaps.filter((g) => g.is_redacted).length
    return (
      <p role="status" className="flex items-center gap-2 rounded-md border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs text-slate-700">
        <Lock className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 truncate" title="The patient controls who can see restricted items.">
          <strong>{role}</strong> · {hidden} restricted {hidden === 1 ? 'item' : 'items'} hidden
        </span>
      </p>
    )
  }

  const restricted =
    tasks.filter((t) => t.sensitivity === 'restricted').length +
    plans.filter((p) => p.sensitivity === 'restricted').length +
    rels.filter((r) => r.sensitivity === 'restricted').length
  return (
    <p role="status" className="flex items-center gap-2 rounded-md border border-navy-100 bg-navy-50 px-3 py-1.5 text-xs text-navy-900">
      <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate" title={`Viewing as ${who}`}>
        <strong>{role}</strong> · restricted access ({restricted} {restricted === 1 ? 'item' : 'items'} visible)
      </span>
    </p>
  )
}
