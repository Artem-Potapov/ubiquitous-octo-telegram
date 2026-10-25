// SIMULATED BACKEND - an in-memory stand-in for the FastAPI + SQLite service.
//
// Each function mirrors a DBManager method from db_manager.py (camelCase name,
// same arguments, same JSON shapes) and follows its documented rules:
// membership checks, redaction of restricted rows, and patient-only grants.
// Redaction happens HERE, before data reaches React, the same way the real
// backend must do it. Hiding things in components would not be real privacy.
//
// Data lives in memory: refreshing the page resets the demo.

import { buildDemoScenario, type DemoScenario } from '../data/demoScenario'
import { detectGaps as runDeterministicEngine } from '../domain/gapEngine'
import { computeStrain, type SentimentMap } from '../domain/workload'
import {
  SYSTEM_VIEWER_ID,
  REDACTED_TASK_TITLE,
  REDACTED_RELATIONSHIP_LABEL,
  REDACTED_CARE_PLAN_TITLE,
  REDACTED_GAP_DESCRIPTION,
  AccessDeniedError,
  ConflictError,
  NotFoundError,
  type CareApi,
  type CarePlan,
  type CareNetwork,
  type Gap,
  type GapCreate,
  type GapSeverity,
  type Relationship,
  type Task,
  type TaskAssignment,
} from './contract'

const LATENCY_MS = 120
const SEVERITY_RANK: Record<GapSeverity, number> = { high: 0, medium: 1, low: 2 }

/** Stored gaps remember which AI conflict produced them (never sent to the UI). */
type StoredGap = Gap & { _key?: string }

interface MockDb extends DemoScenario {
  gaps: StoredGap[]
  resolvedPlanConflictKeys: Set<string>
}

let db: MockDb
let nextId = { assignment: 1000, gap: 1, checkin: 1000, burnout: 1000 }

const clone = <T>(v: T): T => structuredClone(v)
const delay = () => new Promise<void>((r) => setTimeout(r, LATENCY_MS))
const now = () => new Date().toISOString()

async function respond<T>(fn: () => T): Promise<T> {
  await delay()
  return clone(fn())
}

// ----- access helpers ------------------------------------------------------

function getNetwork(networkId: number): CareNetwork {
  if (db.network.id !== networkId) throw new NotFoundError(`Network ${networkId} not found`)
  return db.network
}

function findPerson(personId: number) {
  const p = db.people.find((x) => x.id === personId)
  if (!p) throw new NotFoundError(`Person ${personId} not found`)
  return p
}

function findTask(taskId: number): Task {
  const task = db.tasks.find((t) => t.id === taskId)
  if (!task) throw new NotFoundError(`Task ${taskId} not found`)
  return task
}

function isMember(personId: number): boolean {
  return db.members.includes(personId)
}

function assertMember(networkId: number, viewerId: number): void {
  getNetwork(networkId)
  if (viewerId === SYSTEM_VIEWER_ID) return
  if (!isMember(viewerId)) throw new AccessDeniedError('Viewer is not a member of this network')
}

function viewerCanSeeRestricted(networkId: number, viewerId: number): boolean {
  if (viewerId === SYSTEM_VIEWER_ID) return true
  if (!isMember(viewerId) || db.network.id !== networkId) return false
  if (viewerId === db.network.patient_id) return true
  if (db.people.find((p) => p.id === viewerId)?.is_physician) return true
  return db.accessGrants.some((g) => g.grantee_person_id === viewerId)
}

const redactTask = (t: Task, ok: boolean): Task =>
  ok || t.sensitivity !== 'restricted' ? { ...t, is_redacted: false } : { ...t, title: REDACTED_TASK_TITLE, is_redacted: true }
const redactRel = (r: Relationship, ok: boolean): Relationship =>
  ok || r.sensitivity !== 'restricted' ? { ...r, is_redacted: false } : { ...r, label: REDACTED_RELATIONSHIP_LABEL, is_redacted: true }
const redactPlan = (p: CarePlan, ok: boolean): CarePlan =>
  ok || p.sensitivity !== 'restricted'
    ? { ...p, is_redacted: false }
    : { ...p, title: REDACTED_CARE_PLAN_TITLE, raw_text: '', is_redacted: true }

function redactGap(g: Gap, ok: boolean): Gap {
  if (ok) return { ...g, is_redacted: false }
  const task = db.tasks.find((t) => t.id === g.task_id)
  const plans = db.carePlans.filter((p) => g.related_care_plan_ids.includes(p.id))
  const restricted = task?.sensitivity === 'restricted' || plans.some((p) => p.sensitivity === 'restricted')
  return restricted ? { ...g, description: REDACTED_GAP_DESCRIPTION, is_redacted: true } : { ...g, is_redacted: false }
}

/** Strip the internal _key before a gap leaves the "server". */
function publicGap({ _key, ...gap }: StoredGap): Gap {
  void _key
  return gap
}

const sortTasks = (tasks: Task[]): Task[] =>
  [...tasks].sort((a, b) => {
    if (a.due_date === b.due_date) return a.id - b.id
    if (a.due_date === null) return 1
    if (b.due_date === null) return -1
    return a.due_date < b.due_date ? -1 : 1
  })

// ----- engine (stands in for the backend's gap + burnout jobs) ------------

function sentimentAverages(): SentimentMap {
  const out: SentimentMap = {}
  for (const p of db.people) {
    const scores = db.checkins
      .filter((c) => c.person_id === p.id)
      .slice(-5)
      .map((c) => c.sentiment_score)
    out[p.id] = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
  }
  return out
}

function runEngine(networkId: number): void {
  const people = db.people.filter((p) => isMember(p.id))
  const detected: (GapCreate & { _key?: string })[] = runDeterministicEngine({
    tasks: db.tasks,
    people,
    availability: db.availability,
  })
  const aiConflicts = db.aiPlanConflicts
    .filter((c) => !db.resolvedPlanConflictKeys.has(c.key))
    .map(({ key, ...gap }) => ({ ...gap, _key: key }))
  replaceOpenGaps(networkId, [...detected, ...aiConflicts])

  // Burnout scores. Mock shortcut: today's score is replaced instead of
  // appended so the weekly history chart stays readable during a demo.
  const strain = computeStrain(db.tasks, people, sentimentAverages())
  const today = now().slice(0, 10)
  db.burnoutScores = db.burnoutScores.filter((s) => s.computed_at.slice(0, 10) !== today)
  for (const row of strain) {
    db.burnoutScores.push({
      id: nextId.burnout++,
      person_id: row.person_id,
      network_id: networkId,
      score: row.score,
      task_share: Number(row.share.toFixed(3)),
      missed_count: row.missed_count,
      sentiment_average: row.sentiment_average === null ? null : Number(row.sentiment_average.toFixed(2)),
      computed_at: now(),
    })
  }
}

function replaceOpenGaps(networkId: number, newGaps: (GapCreate & { _key?: string })[]): void {
  db.gaps = db.gaps.filter((g) => g.status !== 'open')
  for (const g of newGaps) {
    db.gaps.push({
      ...g,
      id: nextId.gap++,
      network_id: networkId,
      status: 'open',
      created_at: now(),
      resolved_at: null,
      resolved_by_person_id: null,
      is_redacted: false,
    })
  }
}

function seed(): void {
  const s = buildDemoScenario()
  db = { ...s, gaps: [], resolvedPlanConflictKeys: new Set() }
  nextId = { assignment: 1000, gap: 1, checkin: 1000, burnout: 1000 }
  runEngine(s.network.id)
}

// Seed once all helpers above are initialized.
seed()

// ----- public API (mirrors DBManager) -------------------------------------

export const mockBackend: CareApi = {
  isMock: true,

  /** Mock-only: restore the original demo scenario. */
  async resetDemo() {
    await delay()
    seed()
  },

  /**
   * Proposed endpoint: re-run gap detection + burnout scoring.
   * (The contract has replace_open_gaps; who triggers the engine is undecided.)
   */
  async detectGaps(networkId) {
    await delay()
    getNetwork(networkId)
    runEngine(networkId)
  },

  // people & networks
  getPerson: (personId) => respond(() => findPerson(personId)),

  listPeopleInNetwork: (networkId, viewerId) =>
    respond(() => {
      assertMember(networkId, viewerId)
      return db.people.filter((p) => isMember(p.id))
    }),

  listNetworksForPerson: (personId) => respond(() => (isMember(personId) ? [db.network] : [])),

  getCareNetwork: (networkId, viewerId) =>
    respond(() => {
      assertMember(networkId, viewerId)
      return db.network
    }),

  /** NOT in the contract - small patient profile for the overview header. */
  getPatientProfile: (networkId, viewerId) =>
    respond(() => {
      assertMember(networkId, viewerId)
      return db.patientProfile
    }),

  // graph
  getNetworkGraph: (networkId, viewerId) =>
    respond(() => {
      assertMember(networkId, viewerId)
      const ok = viewerCanSeeRestricted(networkId, viewerId)
      return {
        network_id: networkId,
        nodes: db.people.filter((p) => isMember(p.id)),
        edges: db.relationships.map((r) => redactRel(r, ok)),
      }
    }),

  // tasks & assignments
  listTasks: (networkId, viewerId) =>
    respond(() => {
      assertMember(networkId, viewerId)
      const ok = viewerCanSeeRestricted(networkId, viewerId)
      return sortTasks(db.tasks.filter((t) => t.network_id === networkId)).map((t) => redactTask(t, ok))
    }),

  updateTask: (taskId, changes) =>
    respond(() => {
      const task = findTask(taskId)
      Object.assign(task, changes)
      return { ...task, is_redacted: false }
    }),

  assignTask: (taskId, personId) =>
    respond(() => {
      const task = findTask(taskId)
      findPerson(personId)
      if (!isMember(personId)) throw new ConflictError('Assignee is not a network member')
      const existing = task.assignments.find((a) => a.person_id === personId)
      if (existing) return existing
      const a: TaskAssignment = {
        id: nextId.assignment++,
        task_id: taskId,
        person_id: personId,
        status: 'pending',
        assigned_at: now(),
        updated_at: now(),
      }
      task.assignments.push(a)
      return a
    }),

  unassignTask: (taskId, personId) =>
    respond(() => {
      const task = db.tasks.find((t) => t.id === taskId)
      if (!task || !task.assignments.some((a) => a.person_id === personId)) throw new NotFoundError('Not assigned')
      task.assignments = task.assignments.filter((a) => a.person_id !== personId)
      return null
    }),

  setAssignmentStatus: (taskId, personId, status) =>
    respond(() => {
      const a = db.tasks.find((t) => t.id === taskId)?.assignments.find((x) => x.person_id === personId)
      if (!a) throw new NotFoundError('Not assigned')
      a.status = status
      a.updated_at = now()
      return a
    }),

  // availability
  listAvailabilityInNetwork: (networkId, viewerId) =>
    respond(() => {
      assertMember(networkId, viewerId)
      return Object.fromEntries(
        db.members.map((id) => [id, (db.availability[id] ?? []).map((w, i) => ({ ...w, id: id * 100 + i, person_id: id }))]),
      )
    }),

  // care plans
  listCarePlans: (networkId, viewerId) =>
    respond(() => {
      assertMember(networkId, viewerId)
      const ok = viewerCanSeeRestricted(networkId, viewerId)
      return db.carePlans.map((p) => redactPlan(p, ok))
    }),

  // gaps
  listGaps: (networkId, viewerId, status = 'open') =>
    respond(() => {
      assertMember(networkId, viewerId)
      const ok = viewerCanSeeRestricted(networkId, viewerId)
      return db.gaps
        .filter((g) => status === null || g.status === status)
        .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.id - b.id)
        .map((g) => redactGap(publicGap(g), ok))
    }),

  resolveGap: (gapId, resolvedByPersonId) =>
    respond(() => {
      const gap = db.gaps.find((g) => g.id === gapId)
      if (!gap) throw new NotFoundError(`Gap ${gapId} not found`)
      if (gap.status !== 'resolved') {
        gap.status = 'resolved'
        gap.resolved_at = now()
        gap.resolved_by_person_id = resolvedByPersonId
        if (gap._key) db.resolvedPlanConflictKeys.add(gap._key)
      }
      return publicGap(gap)
    }),

  // check-ins & burnout
  createCheckin: (newCheckin) =>
    respond(() => {
      const c = { ...newCheckin, id: nextId.checkin++, created_at: now() }
      db.checkins.push(c)
      return c
    }),

  listCheckins: (networkId, personId, viewerId, limit = 50) =>
    respond(() => {
      assertMember(networkId, viewerId)
      if (viewerId !== personId && viewerId !== SYSTEM_VIEWER_ID) throw new AccessDeniedError('Check-ins are private')
      return db.checkins
        .filter((c) => c.person_id === personId)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, limit)
    }),

  listLatestBurnoutScores: (networkId, viewerId) =>
    respond(() => {
      assertMember(networkId, viewerId)
      const latest = new Map<number, (typeof db.burnoutScores)[number]>()
      for (const s of db.burnoutScores) {
        const prev = latest.get(s.person_id)
        if (!prev || s.computed_at >= prev.computed_at) latest.set(s.person_id, s)
      }
      return [...latest.values()].sort((a, b) => b.score - a.score)
    }),

  getBurnoutHistory: (networkId, personId, viewerId, limit = 30) =>
    respond(() => {
      assertMember(networkId, viewerId)
      return db.burnoutScores
        .filter((s) => s.person_id === personId)
        .sort((a, b) => (a.computed_at < b.computed_at ? -1 : 1))
        .slice(-limit)
    }),

  // access control
  grantRestrictedAccess: (networkId, granteeId, grantedById) =>
    respond(() => {
      getNetwork(networkId)
      if (grantedById !== db.network.patient_id && grantedById !== SYSTEM_VIEWER_ID) {
        throw new AccessDeniedError('Only the patient can grant access')
      }
      if (!isMember(granteeId)) throw new ConflictError('Grantee is not a network member')
      const existing = db.accessGrants.find((g) => g.grantee_person_id === granteeId)
      if (existing) return existing
      const grant = { network_id: networkId, grantee_person_id: granteeId, granted_by_person_id: grantedById, granted_at: now() }
      db.accessGrants.push(grant)
      return grant
    }),

  revokeRestrictedAccess: (networkId, granteeId, revokedById) =>
    respond(() => {
      getNetwork(networkId)
      if (revokedById !== db.network.patient_id && revokedById !== SYSTEM_VIEWER_ID) {
        throw new AccessDeniedError('Only the patient can revoke access')
      }
      db.accessGrants = db.accessGrants.filter((g) => g.grantee_person_id !== granteeId)
      return null
    }),

  listAccessGrants: (networkId, viewerId) =>
    respond(() => {
      assertMember(networkId, viewerId)
      return db.accessGrants
    }),

  canViewRestricted: (networkId, viewerId) => respond(() => viewerCanSeeRestricted(networkId, viewerId)),
}
