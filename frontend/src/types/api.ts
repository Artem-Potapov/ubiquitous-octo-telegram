// Mirrors db_contract.py (owned by the backend team). snake_case fields, same values.
// Dates are YYYY-MM-DD, datetimes ISO 8601, times HH:MM[:SS].
// Anything under "PROPOSED" is not in the backend yet; see docs in the plan.

export type PersonType = 'patient' | 'professional' | 'family'
export type Sensitivity = 'normal' | 'restricted'
export type TaskCategory =
  | 'medication'
  | 'appointment'
  | 'monitoring'
  | 'transport'
  | 'household'
  | 'communication'
  | 'other'
export type TaskFrequency = 'once' | 'daily' | 'weekly' | 'monthly' | 'as_needed'
export type AssignmentStatus = 'pending' | 'done' | 'missed'
export type GapKind = 'unowned' | 'redundant' | 'plan_conflict' | 'missed'
export type GapSeverity = 'low' | 'medium' | 'high'
export type GapStatus = 'open' | 'resolved'

export interface Person {
  id: number
  person_type: PersonType
  subrole: string
  full_name: string
  phone_number: string | null
  is_physician: boolean
  created_at: string
}

export interface CareNetwork {
  id: number
  patient_id: number
  network_name: string
  created_at: string
}

export interface Relationship {
  id: number
  network_id: number
  source_person_id: number
  target_person_id: number
  label: string
  sensitivity: Sensitivity
  created_at: string
  is_redacted: boolean
}

export interface NetworkGraph {
  network_id: number
  nodes: Person[]
  edges: Relationship[]
}

export interface TaskAssignment {
  id: number
  task_id: number
  person_id: number
  status: AssignmentStatus
  assigned_at: string
  updated_at: string
}

export interface Task {
  id: number
  network_id: number
  title: string
  category: TaskCategory
  required_role: string | null
  frequency: TaskFrequency
  due_date: string | null
  is_exclusive: boolean
  sensitivity: Sensitivity
  created_by_person_id: number | null
  created_at: string
  assignments: TaskAssignment[]
  is_redacted: boolean
}

export interface AvailabilityWindow {
  id: number
  person_id: number
  weekday: number // 0 = Monday
  start_time: string
  end_time: string
}

export interface CarePlan {
  id: number
  network_id: number
  author_person_id: number
  title: string
  raw_text: string
  sensitivity: Sensitivity
  created_at: string
  is_redacted: boolean
}

export interface Gap {
  id: number
  network_id: number
  gap_kind: GapKind
  severity: GapSeverity
  description: string
  task_id: number | null
  suggested_assignee_id: number | null
  related_care_plan_ids: number[]
  status: GapStatus
  created_at: string
  resolved_at: string | null
  resolved_by_person_id: number | null
  is_redacted: boolean
}

export interface Checkin {
  id: number
  person_id: number
  network_id: number
  message: string
  sentiment_score: number
  created_at: string
}

export type NewCheckin = Omit<Checkin, 'id' | 'created_at'>

export interface BurnoutScore {
  id: number
  person_id: number
  network_id: number
  score: number // 0-100
  task_share: number // 0-1
  missed_count: number
  sentiment_average: number | null
  computed_at: string
}

export interface AccessGrant {
  network_id: number
  grantee_person_id: number
  granted_by_person_id: number
  granted_at: string
}

export interface TaskChanges {
  title?: string
  category?: TaskCategory
  required_role?: string | null
  frequency?: TaskFrequency
  due_date?: string | null
  is_exclusive?: boolean
  sensitivity?: Sensitivity
}

// NOT in the contract yet: header card on the dashboard.
export interface PatientProfile {
  person_id: number
  age: number
  location: string
  headline: string
  discharged_on: string
}

export interface ApiErrorBody {
  detail: string
}

/** Mock-only for now: the real API has no care-plan write endpoints yet. */
export interface NewCarePlan {
  title: string
  raw_text: string
  author_person_id?: number
}
