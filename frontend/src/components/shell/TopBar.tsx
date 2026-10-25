import { daysUntil } from '../../lib/format'
import { useConstellation } from '../../store/useConstellation'
import { ROLES } from '../../store/roles'

export function TopBar() {
  const role = useConstellation((s) => s.role)
  const setRole = useConstellation((s) => s.setRole)
  const patient = useConstellation((s) => s.patient)
  const profile = useConstellation((s) => s.profile)

  const discharged = profile ? -daysUntil(profile.discharged_on) : null
  const context = profile
    ? [
        `${profile.age}`,
        profile.location,
        discharged !== null && `Discharged ${discharged === 0 ? 'today' : `${discharged} days ago`}`,
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  return (
    <header className="flex h-14 shrink-0 items-center gap-5 border-b border-slate-200 bg-white px-5">
      <h1 className="text-sm font-semibold tracking-tight text-navy-900">Caregiver Constellation</h1>

      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm">
          <span className="mr-2 text-xs uppercase tracking-wide text-slate-500">Patient</span>
          <span className="font-medium text-slate-900">{patient?.full_name ?? '—'}</span>
        </p>
        {context && <p className="truncate font-mono text-[11px] text-slate-500">{context}</p>}
      </div>

      <div role="radiogroup" aria-label="Viewing as" className="ml-auto flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
        {ROLES.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={role === r}
            onClick={() => setRole(r)}
            className={`rounded px-3 py-1 text-xs font-medium ${
              role === r ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-white hover:text-slate-900'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
    </header>
  )
}
