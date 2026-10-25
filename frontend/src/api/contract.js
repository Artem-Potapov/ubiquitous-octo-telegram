// Mirrors db_contract.py (owned by the backend team). Keep these values in sync
// with that file - the frontend speaks the same JSON shapes (snake_case fields).

export const SYSTEM_VIEWER_ID = 0

export const REDACTED_TASK_TITLE = 'Restricted task'
export const REDACTED_RELATIONSHIP_LABEL = 'Restricted'
export const REDACTED_CARE_PLAN_TITLE = 'Restricted care plan'
export const REDACTED_GAP_DESCRIPTION = 'Gap on a restricted item'

export const PersonType = { patient: 'patient', professional: 'professional', family: 'family' }

export const Sensitivity = { normal: 'normal', restricted: 'restricted' }

export const TaskCategory = {
  medication: 'medication',
  appointment: 'appointment',
  monitoring: 'monitoring',
  transport: 'transport',
  household: 'household',
  communication: 'communication',
  other: 'other',
}

export const TaskFrequency = {
  once: 'once',
  daily: 'daily',
  weekly: 'weekly',
  monthly: 'monthly',
  as_needed: 'as_needed',
}

export const AssignmentStatus = { pending: 'pending', done: 'done', missed: 'missed' }

export const GapKind = {
  unowned: 'unowned',
  redundant: 'redundant',
  plan_conflict: 'plan_conflict',
  missed: 'missed',
}

export const GapSeverity = { low: 'low', medium: 'medium', high: 'high' }

export const GapStatus = { open: 'open', resolved: 'resolved' }

// Error classes map to HTTP codes: NotFound -> 404, AccessDenied -> 403, Conflict -> 409.
export class DatabaseError extends Error {}
export class NotFoundError extends DatabaseError {}
export class AccessDeniedError extends DatabaseError {}
export class ConflictError extends DatabaseError {}
