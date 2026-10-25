import { useState } from 'react'
import type { GraphSelection } from '../state/careContext'
import type { DisplayGap } from '../state/useGaps'
import { ArrowRight, CircleDashed, Tags } from 'lucide-react'
import { useCare } from '../state/careContext'
import { useOpenGaps } from '../state/useGaps'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { CategoryIcon } from '../components/ui/Badge'
import { RestrictedNotice } from '../components/ui/Restricted'
import { ConstellationGraph, ConstellationLegend } from '../components/network/ConstellationGraph'
import { PersonPanel } from '../components/network/PersonPanel'
import { TaskDrawer } from '../components/tasks/TaskDrawer'
import { GapResolutionDrawer } from '../components/gaps/GapResolutionDrawer'
import { relativeDueLabel } from '../domain/dates'
import { firstName } from '../domain/roles'

function OrphanTaskPanel({ taskId, onResolve }: { taskId: number; onResolve: (gap: DisplayGap) => void }) {
  const { data } = useCare()
  const task = data.tasksById.get(taskId)
  if (!task) return null
  const gap = data.openGaps.find((g) => g.task_id === task.id && g.gap_kind === 'unowned')
  return (
    <div className="space-y-4 p-5 animate-fade-in">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-600">
        <CircleDashed className="size-4" /> Unowned responsibility
      </p>
      <div className="flex items-start gap-3">
        <CategoryIcon category={task.category} className="size-11" />
        <div>
          <h3 className="font-display text-lg font-bold text-slate-900">{task.title}</h3>
          <p className="text-sm text-slate-500">{relativeDueLabel(task.due_date)}</p>
        </div>
      </div>
      {task.is_redacted ? (
        <RestrictedNotice patientName={firstName(data.patient)} />
      ) : (
        <>
          <p className="text-sm leading-relaxed text-slate-600">
            This task is drifting between caregivers. It's connected to {firstName(data.patient)}, but nobody has claimed it.
          </p>
          {gap && (
            <Button className="w-full" iconRight={ArrowRight} onClick={() => onResolve(gap)}>
              Find an owner
            </Button>
          )}
        </>
      )}
    </div>
  )
}

export function NetworkPage() {
  const { data, derived, navParams } = useCare()
  const openGaps = useOpenGaps()
  const [selected, setSelected] = useState<GraphSelection>(() =>
    navParams.select?.type === 'person' || navParams.select?.type === 'task' ? navParams.select : { type: 'person', id: data.patient.id },
  )
  const [showLabels, setShowLabels] = useState(false)
  const [openTaskId, setOpenTaskId] = useState<number | null>(null)
  const [openGap, setOpenGap] = useState<DisplayGap | null>(null)

  const onSelect = (sel: GraphSelection) => {
    if (sel.type === 'gap') setOpenGap(openGaps.find((g) => g.id === sel.id) ?? null)
    else setSelected(sel)
  }

  const unowned = data.tasks.filter((t) => t.assignments.length === 0).length

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Card className="overflow-hidden p-2">
          <div className="h-[460px] sm:h-[560px] xl:h-[640px]">
            <ConstellationGraph data={data} derived={derived} selected={selected} onSelect={onSelect} showLabels={showLabels} />
          </div>
        </Card>
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <ConstellationLegend />
          <button
            type="button"
            onClick={() => setShowLabels((s) => !s)}
            aria-pressed={showLabels}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition ${showLabels ? 'bg-ink-900 text-white ring-ink-900' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'}`}
          >
            <Tags className="size-3.5" /> Relationship labels
          </button>
        </div>
        <p className="px-1 text-xs text-slate-500">
          Click anyone to see their role, responsibilities, and workload. Scroll to zoom, drag to pan.{' '}
          {unowned > 0 && (
            <span className="font-medium text-rose-600">
              {unowned} unowned task{unowned === 1 ? ' is' : 's are'} drifting in the gap between family and clinical teams.
            </span>
          )}
        </p>
      </div>

      <Card className="h-fit overflow-hidden xl:sticky xl:top-24">
        {selected.type === 'task' ? (
          <OrphanTaskPanel taskId={selected.id} onResolve={setOpenGap} />
        ) : (
          <PersonPanel
            personId={selected.id}
            onSelectPerson={(id) => setSelected({ type: 'person', id })}
            onOpenTask={setOpenTaskId}
            onOpenGap={setOpenGap}
          />
        )}
      </Card>

      {openTaskId && <TaskDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
      {openGap && (
        <GapResolutionDrawer
          gap={openGap}
          onClose={() => {
            setOpenGap(null)
            if (selected.type === 'task') setSelected({ type: 'person', id: data.patient.id })
          }}
        />
      )}
    </div>
  )
}
