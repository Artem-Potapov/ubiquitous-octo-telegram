import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { CircleDashed, Lock } from 'lucide-react'
import type { GapSeverity } from '../../types/api'
import { GHOST_HEIGHT, GHOST_WIDTH } from './layout'

export type GhostNodeData = {
  gapId: number
  title: string
  redacted: boolean
  severity: GapSeverity
  emphasized: boolean
}
export type GhostFlowNode = Node<GhostNodeData, 'ghost'>

const centerHandle = { opacity: 0, top: '50%', left: '50%', width: 1, height: 1, minWidth: 0, minHeight: 0 }

/** A task nobody owns, drawn as a dashed placeholder attached to the patient. */
export function GhostTaskNode({ data }: NodeProps<GhostFlowNode>) {
  return (
    <div
      role="img"
      aria-label={`Unowned task: ${data.title}`}
      style={{ width: GHOST_WIDTH, height: GHOST_HEIGHT }}
      className={`flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-danger-600 bg-danger-50 px-2.5 text-danger-700 ${
        data.emphasized ? 'ring-2 ring-danger-600 ring-offset-2' : ''
      }`}
    >
      <Handle type="source" position={Position.Top} style={centerHandle} isConnectable={false} />
      <Handle type="target" position={Position.Top} style={centerHandle} isConnectable={false} />
      {data.redacted ? <Lock className="size-4 shrink-0" aria-hidden /> : <CircleDashed className="size-4 shrink-0" aria-hidden />}
      <span className="min-w-0 leading-tight">
        <span className="block text-[10px] font-semibold uppercase tracking-wide">No owner</span>
        <span className="line-clamp-2 block text-[11px] font-medium">{data.title}</span>
      </span>
    </div>
  )
}
