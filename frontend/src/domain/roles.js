// The contract stores person_type (patient / professional / family) plus a free
// text subrole. The UI groups people into a few "role kinds" for colour coding
// and for choosing which dashboard view to show.

export const ROLE_KINDS = {
  patient: { label: 'Patient', color: '#eda100', soft: 'bg-amber-50 text-amber-800 ring-amber-200' },
  family: { label: 'Family & friends', color: '#1baf7a', soft: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  physician: { label: 'Physician', color: '#2a78d6', soft: 'bg-blue-50 text-blue-800 ring-blue-200' },
  nurse: { label: 'Nursing', color: '#e87ba4', soft: 'bg-pink-50 text-pink-800 ring-pink-200' },
  pharmacist: { label: 'Pharmacy', color: '#6250d6', soft: 'bg-violet-50 text-violet-800 ring-violet-200' },
  professional: { label: 'Other professional', color: '#64748b', soft: 'bg-slate-100 text-slate-700 ring-slate-200' },
}

export function roleKind(person) {
  if (!person) return 'professional'
  if (person.person_type === 'patient') return 'patient'
  if (person.person_type === 'family') return 'family'
  if (person.is_physician) return 'physician'
  const sub = person.subrole.toLowerCase()
  if (sub.includes('pharmac')) return 'pharmacist'
  if (sub.includes('nurse')) return 'nurse'
  return 'professional'
}

export function roleColor(person) {
  return ROLE_KINDS[roleKind(person)].color
}

export function initials(name) {
  return name
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

export function firstName(person) {
  if (!person) return 'Someone'
  if (person.is_physician) return `Dr. ${person.full_name.split(' ').at(-1)}`
  return person.full_name.split(' ')[0]
}

export function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** Which dashboard flavour a viewer gets. */
export function dashboardView(person) {
  const kind = roleKind(person)
  if (kind === 'patient') return 'patient'
  if (kind === 'family') return 'family'
  if (kind === 'pharmacist') return 'pharmacist'
  return 'clinician'
}
