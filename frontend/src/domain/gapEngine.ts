// Deterministic care-gap detection. Produces GapCreate objects exactly as the
// contract defines them, so the backend engine can port these rules 1:1.
//
//   unowned   - task with zero assignments
//   redundant - exclusive (single-owner) task with 2+ assignments
//   missed    - an assignment marked missed
//
// Shared (non-exclusive) tasks with several assignees are intentional backup
// coverage and are NOT flagged. plan_conflict gaps come from the optional AI
// care-plan review and are not produced here.

import type { AvailabilityMap, GapCreate, GapSeverity, Person, Task } from '../api/contract'
import {
  computeWeeklyLoads,
  computeStrain,
  detectImbalance,
  applyMoves,
  IMBALANCE_SHARE,
  type SentimentMap,
  type StrainRow,
  type TaskMove,
} from './workload'
import { rankCandidates, suggestedAssignee, type Reason } from './suggestions'
import { daysUntil, relativeDueLabel } from './dates'
import { firstName } from './roles'

export interface RebalanceMove extends TaskMove {
  reasons: Reason[]
}

export interface RebalancePlan {
  moves: RebalanceMove[]
  before: StrainRow[]
  after: StrainRow[]
}

export interface WorkloadImbalance {
  overloaded: StrainRow
  rows: StrainRow[]
  plan: RebalancePlan
}

interface EngineInput {
  tasks: Task[]
  people: Person[]
  availability: AvailabilityMap
}

function unownedSeverity(task: Task): GapSeverity {
  const n = daysUntil(task.due_date)
  if (n === null) return 'low'
  if (n <= 2) return 'high'
  if (n <= 7) return 'medium'
  return 'low'
}

const lowerFirst = (s: string) => s[0].toLowerCase() + s.slice(1)

function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ')
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`
}

export function detectGaps({ tasks, people, availability }: EngineInput): GapCreate[] {
  const byId = new Map(people.map((p) => [p.id, p]))
  const loads = computeWeeklyLoads(tasks, people)
  const loadOf = (id: number) => loads.get(id)?.load ?? 0
  const ctx = { people, tasks, availability }
  const gaps: GapCreate[] = []

  for (const task of tasks) {
    if (task.assignments.length === 0) {
      const suggestion = suggestedAssignee({ ...ctx, task })
      gaps.push({
        gap_kind: 'unowned',
        severity: unownedSeverity(task),
        description: `"${task.title}" has no owner (${lowerFirst(relativeDueLabel(task.due_date))}). Everyone may be assuming someone else is handling it.`,
        task_id: task.id,
        suggested_assignee_id: suggestion?.id ?? null,
        related_care_plan_ids: [],
      })
    }

    if (task.is_exclusive && task.assignments.length >= 2) {
      const owners = task.assignments.map((a) => byId.get(a.person_id)).filter((p): p is Person => !!p)
      // Suggest keeping the owner with the lightest load.
      const keep = [...owners].sort((a, b) => loadOf(a.id) - loadOf(b.id))[0]
      gaps.push({
        gap_kind: 'redundant',
        severity: 'medium',
        description: `"${task.title}" should have one owner, but ${listNames(owners.map(firstName))} are all assigned. They may duplicate work or give conflicting information.`,
        task_id: task.id,
        suggested_assignee_id: keep?.id ?? null,
        related_care_plan_ids: [],
      })
    }

    for (const a of task.assignments.filter((x) => x.status === 'missed')) {
      const owner = byId.get(a.person_id)
      const alternative = rankCandidates({ ...ctx, task }).eligible[0]?.person
      gaps.push({
        gap_kind: 'missed',
        severity: 'high',
        description: `${firstName(owner)} was responsible for "${task.title}" (${lowerFirst(relativeDueLabel(task.due_date))}) and it was marked missed. Nobody has followed up yet.`,
        task_id: task.id,
        suggested_assignee_id: alternative?.id ?? null,
        related_care_plan_ids: [],
      })
    }
  }

  return gaps
}

/**
 * Workload-imbalance insight. Not a contract GapKind yet, so it is computed on
 * the client from tasks + latest burnout sentiment. Returns null when balanced.
 */
export function detectWorkloadImbalance({
  tasks,
  people,
  availability,
  sentimentByPerson,
}: EngineInput & { sentimentByPerson: SentimentMap }): WorkloadImbalance | null {
  const rows = computeStrain(tasks, people, sentimentByPerson)
  const overloaded = detectImbalance(rows)
  if (!overloaded) return null
  const plan = planRebalance({ tasks, people, availability, sentimentByPerson, overloadedId: overloaded.person_id })
  return { overloaded, rows, plan }
}

/**
 * Greedy rebalancing plan: hand the overloaded caregiver's heaviest tasks to
 * the best-ranked other family caregiver until their share drops below the
 * imbalance threshold (max 3 moves).
 */
export function planRebalance({
  tasks,
  people,
  availability,
  sentimentByPerson,
  overloadedId,
}: EngineInput & { sentimentByPerson: SentimentMap; overloadedId: number }): RebalancePlan {
  const familyPool = people.filter((p) => p.person_type === 'family' && p.id !== overloadedId)
  const moves: RebalanceMove[] = []
  let projected = tasks

  const weight = (t: Task) => computeWeeklyLoads([t], people).get(overloadedId)?.load ?? 0
  const candidateTasks = tasks
    .filter((t) => t.assignments.some((a) => a.person_id === overloadedId && a.status === 'pending'))
    .sort((a, b) => weight(b) - weight(a) || a.id - b.id)

  for (const task of candidateTasks) {
    if (moves.length >= 3) break
    const share = computeStrain(projected, people, sentimentByPerson).find((r) => r.person_id === overloadedId)?.share ?? 0
    if (share < IMBALANCE_SHARE) break

    // Rank against the projected state so consecutive moves spread the load.
    const best = rankCandidates({ task, people, tasks: projected, availability, pool: familyPool }).eligible[0]
    if (!best) continue

    const move: RebalanceMove = { taskId: task.id, fromId: overloadedId, toId: best.person.id, reasons: best.reasons }
    moves.push(move)
    projected = applyMoves(projected, [move])
  }

  const before = computeStrain(tasks, people, sentimentByPerson)
  const after = computeStrain(projected, people, sentimentByPerson)
  return { moves, before, after }
}
