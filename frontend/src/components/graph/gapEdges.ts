import type { CarePlan, Gap, GapSeverity, Task } from '../../types/api'

export interface GapLink {
  id: string
  source: number
  target: number
  gapId: number
  severity: GapSeverity
}

const rank = (s: GapSeverity) => (s === 'high' ? 2 : s === 'medium' ? 1 : 0)

/**
 * The people a gap touches, as pairs.
 *
 * Temporary: the contract has no node pair on a gap, so this is derived from the task
 * owners and care-plan authors. The backend should send node ids instead. Unowned gaps
 * have no pair; they are drawn as a ghost node on the patient.
 */
function pairsFor(gap: Gap, tasks: Task[], carePlans: CarePlan[], patientId: number | null): [number, number][] {
  const task = tasks.find((t) => t.id === gap.task_id)
  const pairs: [number, number][] = []

  if (gap.gap_kind === 'redundant' && task) {
    const owners = task.assignments.map((a) => a.person_id)
    for (let i = 0; i < owners.length; i++) for (let j = i + 1; j < owners.length; j++) pairs.push([owners[i], owners[j]])
  } else if (gap.gap_kind === 'missed' && task && patientId !== null) {
    for (const a of task.assignments) if (a.status === 'missed') pairs.push([a.person_id, patientId])
  } else if (gap.gap_kind === 'plan_conflict') {
    const authors = [...new Set(carePlans.filter((p) => gap.related_care_plan_ids.includes(p.id)).map((p) => p.author_person_id))]
    if (authors.length >= 2) pairs.push([authors[0], authors[1]])
    else if (authors.length === 1 && patientId !== null) pairs.push([authors[0], patientId])
  }
  return pairs.filter(([a, b]) => a !== b)
}

export interface GapGeometry {
  links: GapLink[]
  /** gap id -> ids of the people it touches (empty for unowned gaps) */
  peopleByGap: Map<number, number[]>
}

export function gapGeometry(gaps: Gap[], tasks: Task[], carePlans: CarePlan[], patientId: number | null): GapGeometry {
  const links = new Map<string, GapLink>()
  const peopleByGap = new Map<number, number[]>()

  for (const gap of gaps) {
    const people = new Set<number>()
    for (const [a, b] of pairsFor(gap, tasks, carePlans, patientId)) {
      people.add(a)
      people.add(b)
      const [source, target] = a < b ? [a, b] : [b, a]
      const id = `gap-${source}-${target}`
      const existing = links.get(id)
      // Several gaps can touch the same pair; keep the most severe one.
      if (!existing || rank(gap.severity) > rank(existing.severity)) {
        links.set(id, { id, source, target, gapId: gap.id, severity: gap.severity })
      }
    }
    peopleByGap.set(gap.id, [...people])
  }
  return { links: [...links.values()], peopleByGap }
}
