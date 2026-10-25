import { useMemo } from 'react'
import { Background, Panel, ReactFlow, type Edge, type EdgeTypes, type Node, type NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useGapGeometry } from '../../hooks/useGapGeometry'
import { isBurnoutWarning } from '../../lib/burnout'
import { useConstellation } from '../../store/useConstellation'
import { Skeleton } from '../common/Skeleton'
import { GapEdge } from './GapEdge'
import { GhostTaskNode } from './GhostTaskNode'
import { Legend } from './Legend'
import { ghostLayout, radialLayout } from './layout'
import { PersonNode } from './PersonNode'
import { PersonPanel } from './PersonPanel'

// Defined once so React Flow doesn't treat them as new types on every render.
const nodeTypes: NodeTypes = { person: PersonNode, ghost: GhostTaskNode }
const edgeTypes: EdgeTypes = { gap: GapEdge }

const GHOST_PREFIX = 'ghost-'

export function ConstellationGraph() {
  const people = useConstellation((s) => s.people)
  const patient = useConstellation((s) => s.patient)
  const relationships = useConstellation((s) => s.relationships)
  const tasks = useConstellation((s) => s.tasks)
  const gaps = useConstellation((s) => s.gaps)
  const burnout = useConstellation((s) => s.burnout)
  const loading = useConstellation((s) => s.loading)
  const selectedPersonId = useConstellation((s) => s.selectedPersonId)
  const highlightedGapId = useConstellation((s) => s.highlightedGapId)
  const selectPerson = useConstellation((s) => s.selectPerson)
  const highlightGap = useConstellation((s) => s.highlightGap)
  const setDrawerTab = useConstellation((s) => s.setDrawerTab)
  const { links, peopleByGap } = useGapGeometry()

  const patientId = patient?.id ?? null
  const emphasizedPeople = useMemo(
    () => new Set(highlightedGapId === null ? [] : (peopleByGap.get(highlightedGapId) ?? [])),
    [highlightedGapId, peopleByGap],
  )

  const nodes = useMemo<Node[]>(() => {
    const positions = radialLayout(people, patientId)
    const warned = new Map(burnout.filter(isBurnoutWarning).map((b) => [b.person_id, b]))

    const personNodes: Node[] = people.map((person) => ({
      id: String(person.id),
      type: 'person',
      position: positions.get(person.id) ?? { x: 0, y: 0 },
      data: {
        person,
        burnout: warned.get(person.id) ?? null,
        selected: person.id === selectedPersonId,
        emphasized: emphasizedPeople.has(person.id),
      },
    }))

    const unowned = gaps.filter((g) => g.gap_kind === 'unowned')
    const spots = ghostLayout(unowned.length)
    const ghostNodes: Node[] = unowned.map((gap, i) => ({
      id: `${GHOST_PREFIX}${gap.id}`,
      type: 'ghost',
      position: spots[i],
      data: {
        gapId: gap.id,
        title: tasks.find((t) => t.id === gap.task_id)?.title ?? 'Unassigned task',
        redacted: gap.is_redacted,
        severity: gap.severity,
        emphasized: gap.id === highlightedGapId,
      },
    }))

    return [...personNodes, ...ghostNodes]
  }, [people, patientId, burnout, gaps, tasks, selectedPersonId, highlightedGapId, emphasizedPeople])

  const edges = useMemo<Edge[]>(() => {
    const care: Edge[] = relationships.map((r) => ({
      id: `rel-${r.id}`,
      source: String(r.source_person_id),
      target: String(r.target_person_id),
      type: 'straight',
      style: {
        stroke: 'var(--color-slate-300)',
        strokeWidth: 1.5,
        strokeDasharray: r.is_redacted ? '4 4' : undefined,
      },
      ...(r.is_redacted && {
        label: 'Restricted',
        labelStyle: { fontSize: 10, fill: 'var(--color-slate-600)' },
        labelBgStyle: { fill: 'white', stroke: 'var(--color-slate-300)' },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
      }),
    }))

    const gapEdges: Edge[] = links.map((l) => ({
      id: l.id,
      source: String(l.source),
      target: String(l.target),
      type: 'gap',
      data: { gapId: l.gapId, severity: l.severity, emphasized: l.gapId === highlightedGapId },
    }))

    const ghostEdges: Edge[] =
      patientId === null
        ? []
        : gaps
            .filter((g) => g.gap_kind === 'unowned')
            .map((g) => ({
              id: `ghost-edge-${g.id}`,
              source: `${GHOST_PREFIX}${g.id}`,
              target: String(patientId),
              type: 'straight',
              style: { stroke: 'var(--color-danger-600)', strokeWidth: 1.5, strokeDasharray: '6 4' },
            }))

    return [...care, ...ghostEdges, ...gapEdges]
  }, [relationships, links, gaps, patientId, highlightedGapId])

  if (loading) {
    return (
      <div role="status" aria-label="Loading care network" className="relative h-full">
        <Skeleton className="absolute left-1/2 top-1/2 size-28 -translate-x-1/2 -translate-y-1/2 rounded-full" />
        {[
          'left-[18%] top-[22%]',
          'right-[18%] top-[22%]',
          'left-[12%] top-[50%]',
          'right-[12%] top-[50%]',
          'left-[22%] bottom-[18%]',
          'right-[22%] bottom-[18%]',
        ].map((pos) => (
          <Skeleton key={pos} className={`absolute h-14 w-44 ${pos}`} />
        ))}
      </div>
    )
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.4}
      maxZoom={1.5}
      colorMode="light"
      onNodeClick={(_, node) => {
        setDrawerTab('gaps')
        if (node.type === 'ghost') {
          highlightGap(Number(node.id.slice(GHOST_PREFIX.length)))
          selectPerson(null)
        } else {
          const id = Number(node.id)
          selectPerson(id === selectedPersonId ? null : id)
          highlightGap(null)
        }
      }}
      onEdgeClick={(_, edge) => {
        if (edge.type !== 'gap') return
        setDrawerTab('gaps')
        highlightGap((edge.data as { gapId: number }).gapId)
      }}
      onPaneClick={() => {
        selectPerson(null)
        highlightGap(null)
      }}
    >
      <Background gap={24} color="var(--color-slate-200)" />
      <Panel position="top-right">
        <PersonPanel />
      </Panel>
      <Panel position="bottom-left">
        <Legend />
      </Panel>
    </ReactFlow>
  )
}
