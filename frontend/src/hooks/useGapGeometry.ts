import { useMemo } from 'react'
import { gapGeometry } from '../components/graph/gapEdges'
import { useConstellation } from '../store/useConstellation'

/** Which people each open gap touches, shared by the graph and the drawer. */
export function useGapGeometry() {
  const gaps = useConstellation((s) => s.gaps)
  const tasks = useConstellation((s) => s.tasks)
  const carePlans = useConstellation((s) => s.carePlans)
  const patientId = useConstellation((s) => s.patient?.id ?? null)
  return useMemo(() => gapGeometry(gaps, tasks, carePlans, patientId), [gaps, tasks, carePlans, patientId])
}
