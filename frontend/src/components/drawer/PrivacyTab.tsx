import { useConstellation } from '../../store/useConstellation'

/** Patient-only: choose who may see restricted information. Physicians always can. */
export function PrivacyTab() {
  const people = useConstellation((s) => s.people)
  const patient = useConstellation((s) => s.patient)
  const grants = useConstellation((s) => s.grants)
  const toggleGrant = useConstellation((s) => s.toggleGrant)

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Restricted items, such as mental-health notes, are hidden from everyone except your physicians and the people you choose.
      </p>
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {people
          .filter((p) => p.id !== patient?.id)
          .map((p) => {
            const granted = p.is_physician || grants.some((g) => g.grantee_person_id === p.id)
            return (
              <li key={p.id} className="flex items-center gap-3 p-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{p.full_name}</span>
                  <span className="block text-xs capitalize text-slate-500">
                    {p.subrole}
                    {p.is_physician && ' · always has access'}
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={granted}
                  aria-label={`Share restricted information with ${p.full_name}`}
                  disabled={p.is_physician}
                  onClick={() => void toggleGrant(p.id, !granted)}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    granted ? 'bg-navy-900' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${granted ? 'left-[18px]' : 'left-0.5'}`}
                  />
                </button>
              </li>
            )
          })}
      </ul>
    </div>
  )
}
