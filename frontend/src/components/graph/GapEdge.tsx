import { BaseEdge, getStraightPath, type Edge, type EdgeProps } from '@xyflow/react'
import type { GapSeverity } from '../../types/api'

export type GapEdgeData = { gapId: number; severity: GapSeverity; emphasized: boolean }
export type GapFlowEdge = Edge<GapEdgeData, 'gap'>

/** A glowing red line between two people with a coordination gap. */
export function GapEdge({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<GapFlowEdge>) {
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  const base = data?.severity === 'high' ? 3 : 2
  const width = data?.emphasized ? base + 1.5 : base

  return (
    <>
      <BaseEdge
        id={`${id}-glow`}
        path={path}
        className={data?.emphasized ? 'gap-edge-glow gap-edge-glow-strong' : 'gap-edge-glow'}
        style={{ strokeWidth: width + 6 }}
      />
      <BaseEdge id={id} path={path} style={{ stroke: 'var(--color-danger-600)', strokeWidth: width }} interactionWidth={20} />
    </>
  )
}
