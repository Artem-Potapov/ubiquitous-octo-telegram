import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { TriangleAlert } from 'lucide-react'
import { STRAIN_LABEL, strainLevel } from '../../lib/burnout'
import type { BurnoutScore, Person } from '../../types/api'
import { NODE_HEIGHT, NODE_WIDTH, PATIENT_SIZE } from './layout'

export type PersonNodeData = {
  person: Person
  /** Present only when the score is high enough to warn about. */
  burnout: BurnoutScore | null
  selected: boolean
  /** Touched by the gap the user is looking at in the drawer. */
  emphasized: boolean
}
export type PersonFlowNode = Node<PersonNodeData, 'person'>

// Edges join node centers, so the handles are invisible and centered.
const centerHandle = { opacity: 0, top: '50%', left: '50%', width: 1, height: 1, minWidth: 0, minHeight: 0 }

const ACCENT: Record<Person['person_type'], string> = {
  patient: 'border-navy-900',
  professional: 'border-navy-600',
  family: 'border-teal-600',
}

export function PersonNode({ data }: NodeProps<PersonFlowNode>) {
  const { person, burnout, selected, emphasized } = data
  const handles = (
    <>
      <Handle type="source" position={Position.Top} style={centerHandle} isConnectable={false} />
      <Handle type="target" position={Position.Top} style={centerHandle} isConnectable={false} />
    </>
  )

  if (person.person_type === 'patient') {
    return (
      <div
        role="img"
        aria-label={`Patient: ${person.full_name}`}
        style={{ width: PATIENT_SIZE, height: PATIENT_SIZE }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-full border-2 border-navy-900 bg-navy-900 px-3 text-center text-white ${
          selected ? 'ring-4 ring-navy-500/40' : ''
        }`}
      >
        {handles}
        <span className="text-[10px] font-medium uppercase tracking-wider text-navy-100">Patient</span>
        <span className="mt-0.5 text-sm font-semibold leading-tight">{person.full_name}</span>
      </div>
    )
  }

  const level = burnout ? strainLevel(burnout.score) : null
  const ring = burnout
    ? 'ring-2 ring-warn-600 ring-offset-2'
    : emphasized
      ? 'ring-2 ring-danger-600 ring-offset-2'
      : selected
        ? 'ring-2 ring-navy-600 ring-offset-2'
        : ''

  return (
    <div
      role="img"
      aria-label={`${person.full_name}, ${person.subrole}${burnout ? `, burnout warning: ${STRAIN_LABEL[level!]}` : ''}`}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      className={`relative flex cursor-pointer flex-col justify-center rounded-lg border border-l-4 border-slate-200 bg-white px-3 ${ACCENT[person.person_type]} ${ring}`}
    >
      {handles}
      <span className="truncate text-sm font-semibold text-slate-900">{person.full_name}</span>
      <span className="truncate text-xs capitalize text-slate-500">{person.subrole}</span>
      {burnout && (
        <span className="absolute -right-2 -top-3 flex items-center gap-1 rounded-full border border-warn-600 bg-warn-50 px-1.5 py-0.5 text-[10px] font-semibold text-warn-700">
          <TriangleAlert className="size-3" aria-hidden />
          Burnout {burnout.score}
        </span>
      )}
    </div>
  )
}
