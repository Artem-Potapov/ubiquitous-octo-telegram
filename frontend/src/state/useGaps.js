import { useMemo } from 'react'
import { useCare } from './careContext'
import { firstName } from '../domain/roles'

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 }

/**
 * Open gaps from the backend plus the client-computed workload-imbalance
 * insight (not a contract GapKind yet), as one list sorted by severity.
 */
export function useOpenGaps() {
  const { data, derived } = useCare()
  return useMemo(() => {
    if (!data) return []
    const list = [...data.openGaps]
    const imb = derived?.imbalance
    if (imb) {
      const person = data.peopleById.get(imb.overloaded.person_id)
      const o = imb.overloaded
      list.push({
        id: 'workload',
        gap_kind: 'workload',
        severity: o.score >= 60 ? 'high' : 'medium',
        description: `${firstName(person)} carries ${Math.round(o.share * 100)}% of the family's care tasks (${Number(o.load.toFixed(1))} of ${Number(o.totalFamilyLoad.toFixed(1))} weekly task occurrences). Strain index ${o.score}/100.`,
        task_id: null,
        suggested_assignee_id: imb.plan.moves[0]?.toId ?? null,
        overloaded_person_id: o.person_id,
        status: 'open',
        is_redacted: false,
        computed_client_side: true,
      })
    }
    return list.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
  }, [data, derived])
}
