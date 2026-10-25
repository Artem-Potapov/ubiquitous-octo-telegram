import { useMemo } from 'react'
import type { Gap, GapSeverity } from '../api/contract'
import { useCare } from './careContext'
import { firstName } from '../domain/roles'

const SEVERITY_RANK: Record<GapSeverity, number> = { high: 0, medium: 1, low: 2 }

/** The workload-imbalance insight. Not a contract GapKind yet, so it lives only in the UI. */
export interface WorkloadGap {
  id: 'workload'
  gap_kind: 'workload'
  severity: GapSeverity
  description: string
  task_id: null
  suggested_assignee_id: number | null
  related_care_plan_ids: number[]
  overloaded_person_id: number
  status: 'open'
  is_redacted: false
  computed_client_side: true
}

/** Anything shown as a gap card: a stored gap, or the client-side workload insight. */
export type DisplayGap = Gap | WorkloadGap

export const isWorkloadGap = (gap: DisplayGap): gap is WorkloadGap => gap.gap_kind === 'workload'

/** Open gaps from the backend plus the workload insight, as one list sorted by severity. */
export function useOpenGaps(): DisplayGap[] {
  const { data, derived } = useCare()
  return useMemo(() => {
    const list: DisplayGap[] = [...data.openGaps]
    const imb = derived.imbalance
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
        related_care_plan_ids: [],
        overloaded_person_id: o.person_id,
        status: 'open',
        is_redacted: false,
        computed_client_side: true,
      })
    }
    return list.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
  }, [data, derived])
}
