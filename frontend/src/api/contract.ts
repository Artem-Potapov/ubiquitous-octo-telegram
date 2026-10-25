// Mirrors db_contract.py (owned by the backend team). Keep these values and
// types in sync with that file - the frontend speaks the same JSON shapes
// (snake_case fields). Dates are "YYYY-MM-DD", datetimes are ISO 8601 strings.

export const SYSTEM_VIEWER_ID = 0

export const REDACTED_TASK_TITLE = 'Restricted task'
export const REDACTED_RELATIONSHIP_LABEL = 'Restricted'
export const REDACTED_CARE_PLAN_TITLE = 'Restricted care plan'
export const REDACTED_GAP_DESCRIPTION = 'Gap on a restricted item'

// ----- enums ---------------------------------------------------------------

export type PersonType = 'patient' | 'professional' | 'family'
export type Sensitivity = 'normal' | 'restricted'
export type TaskCategory = 'medication' | 'appointment' | 'monitoring' | 'transport' | 'household' | 'communication' | 'other'
export type TaskFrequency = 'once' | 'daily' | 'weekly' | 'monthly' | 'as_needed'
export type AssignmentStatus = 'pending' | 'done' | 'missed'
export type GapKind = 'unowned' | 'redundant' | 'plan_conflict' | 'missed'
export type GapSeverity = 'low' | 'medium' | 'high'
export type GapStatus = 'open' | 'resolved'

/** ISO date "YYYY-MM-DD". */
export type ISODate = string
/** ISO 8601 datetime. */
export type ISODateTime = string

// ----- errors (NotFound -> 404, AccessDenied -> 403, Conflict -> 409) ------

export class DatabaseError extends Error {}
export class NotFoundError extends DatabaseError {}
export class AccessDeniedError extends DatabaseError {}
export class ConflictError extends DatabaseError {}

// ----- people & networks ---------------------------------------------------

export interface PersonCreate {
  person_type: PersonType
  subrole: string
  full_name: string
  phone_number: string | null
  is_physician: boolean
}

export interface Person extends PersonCreate {
  id: number
  created_at: ISODateTime
}

export interface CareNetwork {
  id: number
  patient_id: number
  network_name: string
  created_at: ISODateTime
}

// ----- graph ---------------------------------------------------------------

export interface Relationship {
  id: number
  network_id: number
  source_person_id: number
  target_person_id: number
  label: string
  sensitivity: Sensitivity
  created_at: ISODateTime
  is_redacted: boolean
}

export interface NetworkGraph {
  network_id: number
  nodes: Person[]
  edges: Relationship[]
}

// ----- tasks & assignments -------------------------------------------------

export interface TaskAssignment {
  id: number
  task_id: number
  person_id: number
  status: AssignmentStatus
  assigned_at: ISODateTime
  updated_at: ISODateTime
}

export interface Task {
  id: number
  network_id: number
  title: string
  category: TaskCategory
  required_role: string | null
  frequency: TaskFrequency
  due_date: ISODate | null
  is_exclusive: boolean
  sensitivity: Sensitivity
  created_by_person_id: number | null
  created_at: ISODateTime
  assignments: TaskAssignment[]
  is_redacted: boolean
}

/** Only fields that are set are written. */
export type TaskUpdate = Partial<
  Pick<Task, 'title' | 'category' | 'required_role' | 'frequency' | 'due_date' | 'is_exclusive' | 'sensitivity'>
>

// ----- availability --------------------------------------------------------

export interface AvailabilityWindowCreate {
  weekday: number // 0 = Monday ... 6 = Sunday
  start_time: string // "HH:MM"
  end_time: string
}

export interface AvailabilityWindow extends AvailabilityWindowCreate {
  id: number
  person_id: number
}

/** Keyed by person id; every member present. */
export type AvailabilityMap = Record<number, AvailabilityWindowCreate[]>

// ----- care plans & gaps ---------------------------------------------------

export interface CarePlan {
  id: number
  network_id: number
  author_person_id: number
  title: string
  raw_text: string
  sensitivity: Sensitivity
  created_at: ISODateTime
  is_redacted: boolean
}

export interface GapCreate {
  gap_kind: GapKind
  severity: GapSeverity
  description: string
  task_id: number | null
  suggested_assignee_id: number | null
  related_care_plan_ids: number[]
}

export interface Gap extends GapCreate {
  id: number
  network_id: number
  status: GapStatus
  created_at: ISODateTime
  resolved_at: ISODateTime | null
  resolved_by_person_id: number | null
  is_redacted: boolean
}

// ----- check-ins & burnout -------------------------------------------------

export interface CheckinCreate {
  person_id: number
  network_id: number
  message: string
  sentiment_score: number // -1..1, computed before insert
}

export interface Checkin extends CheckinCreate {
  id: number
  created_at: ISODateTime
}

export interface BurnoutScore {
  id: number
  person_id: number
  network_id: number
  score: number // 0..100
  task_share: number // 0..1
  missed_count: number
  sentiment_average: number | null
  computed_at: ISODateTime
}

// ----- access control ------------------------------------------------------

export interface AccessGrant {
  network_id: number
  grantee_person_id: number
  granted_by_person_id: number
  granted_at: ISODateTime
}

// ----- frontend-only extensions (not in db_contract.py yet) ----------------

/** Overview header data. No contract model holds these fields yet. */
export interface PatientProfile {
  person_id: number
  age: number
  location: string
  headline: string
  discharged_on: ISODate
}

// ----- the API surface both backends implement ------------------------------

/** Mirrors DBManager (camelCase names, same arguments) plus a few proposed extras. */
export interface CareApi {
  isMock: boolean
  resetDemo(): Promise<void>
  detectGaps(networkId: number): Promise<void>

  getPerson(personId: number): Promise<Person>
  listPeopleInNetwork(networkId: number, viewerId: number): Promise<Person[]>
  listNetworksForPerson(personId: number): Promise<CareNetwork[]>
  getCareNetwork(networkId: number, viewerId: number): Promise<CareNetwork>
  getPatientProfile(networkId: number, viewerId: number): Promise<PatientProfile>

  getNetworkGraph(networkId: number, viewerId: number): Promise<NetworkGraph>

  listTasks(networkId: number, viewerId: number): Promise<Task[]>
  updateTask(taskId: number, changes: TaskUpdate): Promise<Task>
  assignTask(taskId: number, personId: number): Promise<TaskAssignment>
  unassignTask(taskId: number, personId: number): Promise<null>
  setAssignmentStatus(taskId: number, personId: number, status: AssignmentStatus): Promise<TaskAssignment>

  listAvailabilityInNetwork(networkId: number, viewerId: number): Promise<Record<number, AvailabilityWindow[]>>

  listCarePlans(networkId: number, viewerId: number): Promise<CarePlan[]>

  listGaps(networkId: number, viewerId: number, status?: GapStatus | null): Promise<Gap[]>
  resolveGap(gapId: number, resolvedByPersonId: number): Promise<Gap>

  createCheckin(newCheckin: CheckinCreate): Promise<Checkin>
  listCheckins(networkId: number, personId: number, viewerId: number, limit?: number): Promise<Checkin[]>
  listLatestBurnoutScores(networkId: number, viewerId: number): Promise<BurnoutScore[]>
  getBurnoutHistory(networkId: number, personId: number, viewerId: number, limit?: number): Promise<BurnoutScore[]>

  grantRestrictedAccess(networkId: number, granteeId: number, grantedById: number): Promise<AccessGrant>
  revokeRestrictedAccess(networkId: number, granteeId: number, revokedById: number): Promise<null>
  listAccessGrants(networkId: number, viewerId: number): Promise<AccessGrant[]>
  canViewRestricted(networkId: number, viewerId: number): Promise<boolean>
}
