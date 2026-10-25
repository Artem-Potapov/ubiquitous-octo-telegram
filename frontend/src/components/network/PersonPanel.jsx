import { AlertTriangle, ArrowRight, Eye, EyeOff, Lock, Phone } from 'lucide-react'
import { useCare } from '../../state/careContext'
import { Avatar } from '../ui/Avatar'
import { RoleBadge, StrainBadge } from '../ui/Badge'
import { STRAIN_META, GAP_KIND_META } from '../ui/meta'
import { TaskRow } from '../tasks/TaskRow'
import { gapPeopleIds, gapTaskTitle } from '../../domain/gapView'
import { firstName, ROLE_KINDS, roleKind } from '../../domain/roles'
import { WEEKDAY_SHORT, formatTime } from '../../domain/dates'
import { useOpenGaps } from '../../state/useGaps'

function Block({ title, children, count }) {
  return (
    <div className="border-t border-slate-100 px-5 py-4">
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
        {count !== undefined && <span className="rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-500">{count}</span>}
      </p>
      {children}
    </div>
  )
}

function AvailabilityWeek({ windows }) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {WEEKDAY_SHORT.map((d, i) => {
        const w = windows.filter((x) => x.weekday === i)
        return (
          <div key={d} className="text-center">
            <p className="text-[10px] font-medium text-slate-400">{d}</p>
            <div
              className={`mt-1 flex h-10 items-center justify-center rounded-lg text-[9px] leading-tight ${w.length ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-50 text-slate-300'}`}
              title={w.map((x) => `${formatTime(x.start_time)}–${formatTime(x.end_time)}`).join(', ')}
            >
              {w.length ? formatTime(w[0].start_time).replace(':00', '') : '—'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function PersonPanel({ personId, onSelectPerson, onOpenTask, onOpenGap }) {
  const { data, derived } = useCare()
  const allGaps = useOpenGaps()
  const person = data.peopleById.get(personId)
  if (!person) return null

  const kind = roleKind(person)
  const isPatient = person.id === data.patient.id
  const canSeeRestricted = isPatient || person.is_physician || data.grants.some((g) => g.grantee_person_id === person.id)
  const tasks = data.tasks.filter((t) => t.assignments.some((a) => a.person_id === person.id))
  const strain = derived.strainRows.find((r) => r.person_id === person.id)
  const edges = data.edges.filter((e) => e.source_person_id === person.id || e.target_person_id === person.id)
  const gaps = allGaps.filter((g) =>
    g.gap_kind === 'workload' ? g.overloaded_person_id === person.id : gapPeopleIds(g, data).includes(person.id),
  )

  return (
    <div className="animate-fade-in">
      <div className="flex items-start gap-4 p-5">
        <Avatar person={person} size="lg" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: ROLE_KINDS[kind].color }}>
            {ROLE_KINDS[kind].label}
          </p>
          <h3 className="font-display text-lg font-bold text-slate-900">{person.full_name}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <RoleBadge person={person} />
            {person.phone_number && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <Phone className="size-3" /> {person.phone_number}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mx-5 mb-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {canSeeRestricted ? <Eye className="size-3.5 text-emerald-600" /> : <EyeOff className="size-3.5 text-slate-400" />}
        {isPatient
          ? 'Owns and controls all health information'
          : canSeeRestricted
            ? person.is_physician
              ? 'Can see restricted info (physician member)'
              : `Can see restricted info (granted by ${firstName(data.patient)})`
            : 'Sees coordination info only'}
      </div>

      {gaps.length > 0 && (
        <Block title="Involved in gaps" count={gaps.length}>
          <ul className="space-y-2">
            {gaps.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => onOpenGap(g)}
                  className="flex w-full items-center gap-2.5 rounded-xl bg-rose-50 px-3 py-2 text-left text-xs text-rose-800 ring-1 ring-rose-100 transition hover:bg-rose-100/70"
                >
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span className="flex-1">
                    <span className="font-semibold">{GAP_KIND_META[g.gap_kind].short}:</span>{' '}
                    {g.gap_kind === 'workload' ? 'Carrying most of the family workload' : g.is_redacted ? 'Restricted item' : gapTaskTitle(g, data)}
                  </span>
                  <ArrowRight className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {strain && (
        <Block title="Workload">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-700">
              <span className="font-display text-2xl font-bold text-slate-900">{strain.score}</span>
              <span className="text-slate-400">/100 strain</span>
            </p>
            <StrainBadge level={strain.level} />
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${STRAIN_META[strain.level.key].bar}`} style={{ width: `${strain.score}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {Math.round(strain.share * 100)}% of family care tasks · {strain.taskCount} active tasks
            {strain.missed_count ? ` · ${strain.missed_count} missed` : ''}
          </p>
        </Block>
      )}

      {!isPatient && (
        <Block title="Responsibilities" count={tasks.length}>
          {tasks.length === 0 ? (
            <p className="text-sm text-slate-500">No tasks assigned.</p>
          ) : (
            <div className="-mx-5 divide-y divide-slate-100">
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={() => onOpenTask(t.id)} compact />
              ))}
            </div>
          )}
        </Block>
      )}

      <Block title="Connections" count={edges.length}>
        <ul className="space-y-1.5">
          {edges.map((e) => {
            const otherId = e.source_person_id === person.id ? e.target_person_id : e.source_person_id
            const other = data.peopleById.get(otherId)
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onSelectPerson(otherId)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-slate-50"
                >
                  <Avatar person={other} size="xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-800">{other?.full_name}</span>
                    <span className={`flex items-center gap-1 truncate text-xs ${e.is_redacted ? 'italic text-slate-400' : 'text-slate-500'}`}>
                      {e.is_redacted && <Lock className="size-3" />}
                      {e.label}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </Block>

      {!isPatient && (
        <Block title="Availability">
          <AvailabilityWeek windows={data.availability[person.id] ?? []} />
        </Block>
      )}
    </div>
  )
}
