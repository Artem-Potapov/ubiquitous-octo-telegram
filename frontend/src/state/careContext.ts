import { createContext, useContext } from 'react'
import type {
  AccessGrant,
  AvailabilityWindow,
  BurnoutScore,
  CareApi,
  CareNetwork,
  CarePlan,
  Checkin,
  Gap,
  PatientProfile,
  Person,
  Relationship,
  Task,
  TaskUpdate,
} from '../api/contract'
import type { WorkloadImbalance } from '../domain/gapEngine'
import type { SentimentMap, StrainRow, TaskMove } from '../domain/workload'

export type PageKey = 'overview' | 'network' | 'tasks' | 'gaps' | 'workload' | 'privacy'

/** Something clicked in the constellation graph. */
export interface GraphSelection {
  type: 'person' | 'task' | 'gap'
  id: number
}

export interface NavParams {
  openGapId?: number
  select?: GraphSelection
}

/** Everything one viewer is allowed to see, already redacted by the data layer. */
export interface Snapshot {
  networkId: number
  network: CareNetwork
  profile: PatientProfile
  viewer: Person
  patient: Person
  people: Person[]
  peopleById: Map<number, Person>
  edges: Relationship[]
  tasks: Task[]
  tasksById: Map<number, Task>
  gaps: Gap[]
  openGaps: Gap[]
  resolvedGaps: Gap[]
  availability: Record<number, AvailabilityWindow[]>
  carePlans: CarePlan[]
  grants: AccessGrant[]
  burnout: BurnoutScore[]
  burnoutHistory: Record<number, BurnoutScore[]>
  canViewRestricted: boolean
  myCheckins: Checkin[]
}

/** Client-side analytics computed from the snapshot. */
export interface Derived {
  sentimentByPerson: SentimentMap
  strainRows: StrainRow[]
  imbalance: WorkloadImbalance | null
}

export interface Toast {
  id: number
  message: string
  tone: 'success' | 'error'
}

export interface PrivacyLogEntry {
  personId: number
  allow: boolean
  at: string
}

export interface CareActions {
  assign(taskId: number, personId: number): Promise<boolean>
  unassign(taskId: number, personId: number): Promise<boolean>
  setStatus(taskId: number, personId: number, status: 'pending' | 'done' | 'missed'): Promise<boolean>
  updateTask(taskId: number, changes: TaskUpdate, message?: string): Promise<boolean>
  /** Mark a gap resolved by the viewer, then run `work` to fix the underlying task. */
  resolveGap(gapId: number, work?: (api: CareApi) => Promise<unknown>, message?: string): Promise<boolean>
  applyMoves(moves: TaskMove[], message?: string): Promise<boolean>
  setRestrictedAccess(personId: number, allow: boolean): Promise<boolean>
  submitCheckin(sentimentScore: number, message: string): Promise<boolean>
  resetDemo(): Promise<void>
}

export interface CareContextValue {
  viewerId: number
  setViewerId(id: number): void
  data: Snapshot | null
  derived: Derived | null
  error: string | null
  busy: boolean
  page: PageKey
  navParams: NavParams
  navigate(page: PageKey, params?: NavParams): void
  toasts: Toast[]
  toast(message: string, tone?: Toast['tone']): void
  actions: CareActions
  privacyLog: PrivacyLogEntry[]
  name(id: number | null | undefined): string
}

/** The context value once data has loaded (pages only render then). */
export type LoadedCareContext = CareContextValue & { data: Snapshot; derived: Derived }

export const CareContext = createContext<CareContextValue | null>(null)

/** Access the shared care-network data and actions from any component. */
export function useCareContext(): CareContextValue {
  const ctx = useContext(CareContext)
  if (!ctx) throw new Error('useCare must be used inside <CareProvider>')
  return ctx
}

/**
 * Same as useCareContext, for components that only render after data has
 * loaded (every page and everything inside them - see AppShell).
 */
export function useCare(): LoadedCareContext {
  const ctx = useCareContext()
  if (!ctx.data || !ctx.derived) throw new Error('useCare called before the care network loaded')
  return ctx as LoadedCareContext
}
