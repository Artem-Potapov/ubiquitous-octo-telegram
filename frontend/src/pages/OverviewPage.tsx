import { useState } from 'react'
import type { CarePlan } from '../api/contract'
import type { DisplayGap } from '../state/useGaps'
import { AlertTriangle, ArrowRight, CalendarCheck, CheckCircle2, ListChecks, Lock, MapPin, Orbit, Scale, Users } from 'lucide-react'
import { useCare } from '../state/careContext'
import { useOpenGaps } from '../state/useGaps'
import { Card, CardHeader, EmptyState, StatTile } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Avatar } from '../components/ui/Avatar'
import { StrainBadge } from '../components/ui/Badge'
import { STRAIN_META } from '../components/ui/meta'
import { ConstellationGraph } from '../components/network/ConstellationGraph'
import { GapCard } from '../components/gaps/GapCard'
import { GapResolutionDrawer } from '../components/gaps/GapResolutionDrawer'
import { RoleFocusPanel } from '../components/overview/RoleFocusPanel'
import { firstName } from '../domain/roles'
import { formatShortDate } from '../domain/dates'

function conditionName(plan: CarePlan) {
  return plan.title.replace(/\s*(management\s*)?plan$/i, '')
}

function PatientHero({ gapsCount, onReview }: { gapsCount: number; onReview: () => void }) {
  const { data } = useCare()
  const { patient, profile } = data
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="relative overflow-hidden rounded-3xl bg-ink-900 p-6 text-white sm:p-8">
      <div className="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 size-72 rounded-full bg-amber-400/10 blur-3xl" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4 sm:gap-5">
          <Avatar person={patient} size="xl" className="!ring-4 !ring-white/10" />
          <div className="min-w-0">
            <p className="text-sm text-indigo-200">
              {greeting}, {firstName(data.viewer)}. {data.viewer.id === patient.id ? 'Here is your care network.' : `Here is ${firstName(patient)}'s care network.`}
            </p>
            <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{patient.full_name}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-300">
              <span>{profile.age} years</span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" /> {profile.location}
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarCheck className="size-3.5" /> Discharged {formatShortDate(profile.discharged_on)}
              </span>
            </p>
            <p className="mt-3 text-sm text-slate-300">{profile.headline}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.carePlans.map((p) =>
                p.is_redacted ? (
                  <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-xs italic text-slate-400 ring-1 ring-white/10">
                    <Lock className="size-3" /> Restricted
                  </span>
                ) : (
                  <span key={p.id} className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-100 ring-1 ring-white/15">
                    {conditionName(p)}
                  </span>
                ),
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10 lg:max-w-xs">
          {gapsCount > 0 ? (
            <>
              <p className="flex items-center gap-2 text-sm font-semibold text-rose-300">
                <AlertTriangle className="size-4" /> {gapsCount} coordination gap{gapsCount === 1 ? '' : 's'} detected
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
                These are responsibilities that could fall through the cracks between caregivers.
              </p>
              <Button className="mt-4 w-full" onClick={onReview} iconRight={ArrowRight}>
                Review care gaps
              </Button>
            </>
          ) : (
            <>
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                <CheckCircle2 className="size-4" /> No open coordination gaps
              </p>
              <p className="mt-1.5 text-sm text-slate-300">Every responsibility has a clear owner.</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function WorkloadSummary() {
  const { data, derived, navigate } = useCare()
  return (
    <Card className="pb-5">
      <CardHeader
        icon={Scale}
        title="Family workload"
        subtitle="Share of weekly family care tasks"
        action={
          <Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={() => navigate('workload')}>
            Details
          </Button>
        }
      />
      <ul className="mt-4 space-y-3.5 px-5">
        {derived.strainRows.map((row) => {
          const person = data.peopleById.get(row.person_id)
          return (
            <li key={row.person_id} className="flex items-center gap-3">
              <Avatar person={person} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-800">{person?.full_name}</span>
                  <span className="text-xs tabular-nums text-slate-500">{Math.round(row.share * 100)}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full transition-all duration-700 ${STRAIN_META[row.level.key].bar}`} style={{ width: `${Math.max(2, row.share * 100)}%` }} />
                </div>
              </div>
              <StrainBadge level={row.level} />
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

export function OverviewPage() {
  const { data, derived, navigate } = useCare()
  const gaps = useOpenGaps()
  const [openGap, setOpenGap] = useState<DisplayGap | null>(null)

  const family = data.people.filter((p) => p.person_type === 'family')
  const clinical = data.people.filter((p) => p.person_type === 'professional')
  const active = data.tasks.filter((t) => !t.assignments.length || t.assignments.some((a) => a.status !== 'done'))
  const unassigned = data.tasks.filter((t) => t.assignments.length === 0).length
  const high = gaps.filter((g) => g.severity === 'high').length
  const topStrain = derived.strainRows[0]

  return (
    <div className="space-y-6">
      <PatientHero gapsCount={gaps.length} onReview={() => navigate('gaps')} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Users} tone="brand" label="Care network" value={data.people.length - 1} sublabel={`${family.length} family & friends · ${clinical.length} clinical`} onClick={() => navigate('network')} />
        <StatTile icon={ListChecks} tone="slate" label="Open responsibilities" value={active.length} sublabel={`${unassigned} with no owner`} onClick={() => navigate('tasks')} />
        <StatTile icon={AlertTriangle} tone="rose" label="Care gaps" value={gaps.length} sublabel={`${high} high severity`} onClick={() => navigate('gaps')} />
        <StatTile
          icon={Scale}
          tone={topStrain?.level.key === 'high' ? 'amber' : 'emerald'}
          label="Highest family strain"
          value={topStrain ? `${topStrain.score}` : '—'}
          sublabel={topStrain ? `${firstName(data.peopleById.get(topStrain.person_id))} · ${topStrain.level.label}` : ''}
          onClick={() => navigate('workload')}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          <Card>
            <CardHeader
              icon={AlertTriangle}
              title="Needs attention"
              subtitle="Highest-severity coordination gaps"
              action={
                <Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={() => navigate('gaps')}>
                  All gaps
                </Button>
              }
            />
            <div className="space-y-3 p-5">
              {gaps.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="Nothing is falling through the cracks">
                  Every responsibility has exactly one clear owner.
                </EmptyState>
              ) : (
                gaps.slice(0, 3).map((g) => <GapCard key={g.id} gap={g} onOpen={setOpenGap} compact />)
              )}
            </div>
          </Card>
          <RoleFocusPanel />
        </div>

        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader
              icon={Orbit}
              title="Care constellation"
              subtitle={`${data.people.length} people · ${data.edges.length} connections`}
              action={
                <Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={() => navigate('network')}>
                  Explore
                </Button>
              }
            />
            <div className="m-5 aspect-[16/11]">
              <ConstellationGraph data={data} derived={derived} compact onSelect={(sel) => navigate('network', { select: sel })} />
            </div>
          </Card>
          <WorkloadSummary />
        </div>
      </div>

      {openGap && <GapResolutionDrawer gap={openGap} onClose={() => setOpenGap(null)} />}
    </div>
  )
}
