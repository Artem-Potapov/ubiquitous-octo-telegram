// Patient-controlled access. Toggling a grant calls grant/revoke on the API;
// the data layer then redacts restricted rows for that person everywhere
// (graph edges, tasks, gaps, care plans, search). The UI never hides
// restricted data itself; it only ever receives what the viewer may see.

import { Check, Eye, EyeOff, FileLock2, History, Lightbulb, Lock, ShieldCheck, Stethoscope, Users } from 'lucide-react'
import { useCare } from '../state/careContext'
import { Card, CardHeader } from '../components/ui/Card'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { RoleBadge } from '../components/ui/Badge'
import { firstName } from '../domain/roles'
import { formatDateTime } from '../domain/dates'

const COORDINATION_COLUMNS = ['Contact & schedule', 'Tasks & reminders', 'Care plans']

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label: string
}

function Switch({ checked, onChange, disabled, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-300'} disabled:opacity-50`}
    >
      <span className={`inline-block size-5 rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function useRestrictedItems() {
  const { data } = useCare()
  return {
    tasks: data.tasks.filter((t) => t.sensitivity === 'restricted'),
    plans: data.carePlans.filter((p) => p.sensitivity === 'restricted'),
    edges: data.edges.filter((e) => e.sensitivity === 'restricted'),
  }
}

function TierCards() {
  const { data } = useCare()
  const items = useRestrictedItems()
  const all = [
    ...items.plans.map((p) => ['Care plan', p.title, p.is_redacted]),
    ...items.tasks.map((t) => ['Task', t.title, t.is_redacted]),
    ...items.edges.map((e) => ['Relationship', e.label, e.is_redacted]),
  ]
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <p className="flex items-center gap-2 font-display text-sm font-bold text-slate-900">
          <Users className="size-4 text-brand-500" /> Care coordination information
        </p>
        <p className="mt-1 text-sm text-slate-500">Visible to everyone in {firstName(data.patient)}'s care network, so the team can work together.</p>
        <ul className="mt-4 grid grid-cols-1 gap-2 text-sm text-slate-700 sm:grid-cols-2">
          {['Names & contact details', 'Availability & schedules', 'Tasks, owners & deadlines', 'Medication & appointment reminders', 'Non-sensitive care plans', 'Care gaps on these items'].map((x) => (
            <li key={x} className="flex items-center gap-2">
              <Check className="size-4 shrink-0 text-emerald-500" /> {x}
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-5">
        <p className="flex items-center gap-2 font-display text-sm font-bold text-slate-900">
          <FileLock2 className="size-4 text-violet-500" /> Restricted health information
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Only {firstName(data.patient)}, physicians in the network, and people {firstName(data.patient)} explicitly approves.
        </p>
        <ul className="mt-4 space-y-2">
          {all.map(([type, title, redacted], i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <Lock className="size-3.5 shrink-0 text-violet-500" />
              <span className="w-24 shrink-0 text-xs text-slate-400">{type}</span>
              <span className={redacted ? 'italic text-slate-400' : 'text-slate-700'}>{redacted ? 'Hidden from you' : title}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function PatientControls() {
  const { data, actions, busy, setViewerId, privacyLog, name } = useCare()
  const members = data.people.filter((p) => p.id !== data.patient.id)
  const hasGrant = (id: number) => data.grants.some((g) => g.grantee_person_id === id)

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader icon={ShieldCheck} title="Who can see what" subtitle="Turn restricted access on or off for each person. Changes apply immediately everywhere." />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-5 py-2.5">Member</th>
                {COORDINATION_COLUMNS.map((c) => (
                  <th key={c} className="px-3 py-2.5 text-center">{c}</th>
                ))}
                <th className="px-3 py-2.5 text-center text-violet-500">Restricted health info</th>
                <th className="px-5 py-2.5 text-right">Demo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((p) => {
                const granted = p.is_physician || hasGrant(p.id)
                return (
                  <tr key={p.id} className="transition hover:bg-slate-50/50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar person={p} size="sm" />
                        <div>
                          <p className="font-semibold text-slate-900">{p.full_name}</p>
                          <RoleBadge person={p} />
                        </div>
                      </div>
                    </td>
                    {COORDINATION_COLUMNS.map((c) => (
                      <td key={c} className="px-3 py-3 text-center">
                        <Check className="mx-auto size-4 text-emerald-500" aria-label="Visible" />
                      </td>
                    ))}
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {p.is_physician ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
                            <Stethoscope className="size-3" /> Physician
                          </span>
                        ) : (
                          <>
                            <Switch checked={granted} disabled={busy} onChange={(v: boolean) => actions.setRestrictedAccess(p.id, v)} label={`Restricted access for ${p.full_name}`} />
                            <span className={`w-16 text-xs font-medium ${granted ? 'text-emerald-700' : 'text-slate-400'}`}>{granted ? 'Allowed' : 'Hidden'}</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant="ghost" icon={Eye} onClick={() => setViewerId(p.id)}>
                        Preview as
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Physician members can always view restricted information for clinical care, under the current backend rules.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="flex gap-3 p-5">
          <Lightbulb className="size-5 shrink-0 text-amber-500" />
          <div className="text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Try it</p>
            <p className="mt-1">
              Turn off restricted access for <span className="font-medium text-slate-800">Daniel</span>, then click{' '}
              <span className="font-medium text-slate-800">Preview as</span>. The behavioral health plan, the mood screening, and the related care gap
              turn into locked placeholders on every page of Daniel's view.
            </p>
          </div>
        </Card>
        <Card className="p-5">
          <p className="flex items-center gap-2 font-display text-sm font-bold text-slate-900">
            <History className="size-4 text-slate-400" /> Recent changes
          </p>
          {privacyLog.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No changes this session.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {privacyLog.map((entry, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  {entry.allow ? <Eye className="size-4 text-emerald-500" /> : <EyeOff className="size-4 text-slate-400" />}
                  <span className="flex-1 text-slate-700">
                    {entry.allow ? 'Granted' : 'Revoked'} restricted access for <span className="font-medium">{name(entry.personId)}</span>
                  </span>
                  <span className="text-xs text-slate-400">{formatDateTime(entry.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}

function MemberView() {
  const { data } = useCare()
  const v = data.viewer
  const granted = data.grants.find((g) => g.grantee_person_id === v.id)
  const authorized = data.people.filter((p) => p.id === data.patient.id || p.is_physician || data.grants.some((g) => g.grantee_person_id === p.id))
  const items = useRestrictedItems()
  const hidden = [...items.tasks, ...items.plans, ...items.edges].filter((x) => x.is_redacted).length

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className={`p-6 ${data.canViewRestricted ? '' : 'bg-slate-50/50'}`}>
        <span className={`inline-flex size-11 items-center justify-center rounded-2xl ${data.canViewRestricted ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
          {data.canViewRestricted ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
        </span>
        <p className="mt-4 font-display text-lg font-bold text-slate-900">
          {data.canViewRestricted ? 'You can see restricted information' : 'You see coordination information only'}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {v.is_physician
            ? 'As a physician in this network, you can view restricted information for clinical care.'
            : granted
              ? `${data.patient.full_name} granted you access on ${formatDateTime(granted.granted_at)}.`
              : `${data.patient.full_name} has restricted some health information. ${hidden} item${hidden === 1 ? ' is' : 's are'} hidden from you, including in search, alerts, and the network map.`}
        </p>
        <p className="mt-4 text-xs text-slate-400">Only {firstName(data.patient)} can change these settings.</p>
      </Card>
      <Card className="p-6">
        <p className="font-display text-sm font-bold text-slate-900">People with restricted access</p>
        <ul className="mt-3 space-y-2.5">
          {authorized.map((p) => (
            <li key={p.id} className="flex items-center gap-3">
              <Avatar person={p} size="sm" />
              <span className="flex-1 text-sm font-medium text-slate-800">{p.full_name}</span>
              <span className="text-xs text-slate-500">{p.id === data.patient.id ? 'Patient' : p.is_physician ? 'Physician' : 'Granted by patient'}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

export function PrivacyPage() {
  const { data } = useCare()
  const isPatient = data.viewer.id === data.patient.id

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-ink-900 p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative flex items-start gap-4">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
            <ShieldCheck className="size-6 text-violet-300" />
          </span>
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl font-extrabold tracking-tight">
              {isPatient ? 'You decide who sees your health information.' : `${firstName(data.patient)} controls who sees sensitive information.`}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Everyone in the care network shares what they need to coordinate. Sensitive details stay with the people {isPatient ? 'you' : firstName(data.patient)}{' '}
              {isPatient ? 'choose' : 'chooses'}.
            </p>
          </div>
        </div>
      </div>

      {isPatient ? <PatientControls /> : <MemberView />}
      <TierCards />

      <p className="rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-500">
        <span className="font-semibold text-slate-700">How this is enforced:</span> restricted rows are redacted in the data layer before they reach the
        interface, the same way the real backend must do it. Today that's the simulated backend. Hiding data only in the browser would not be real
        protection. This prototype uses fictional data and is not HIPAA-compliant.
      </p>
    </div>
  )
}
