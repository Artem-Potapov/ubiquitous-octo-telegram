// The single switch between simulated and real data, and the one typed surface
// components use. Set VITE_USE_MOCK_API=false (e.g. in frontend/.env.local) once
// FastAPI is running. Components never call fetch directly.

import type {
  AccessGrant,
  AssignmentStatus,
  AvailabilityWindow,
  BurnoutScore,
  CareNetwork,
  CarePlan,
  Checkin,
  Gap,
  GapStatus,
  NetworkGraph,
  NewCarePlan,
  NewCheckin,
  PatientProfile,
  Person,
  Task,
  TaskAssignment,
  TaskChanges,
} from '../types/api'
import { mockBackend } from './mockBackend'
import { httpBackend } from './httpBackend'

/** Same shape for the mock and the real client. viewerId is the person making the request. */
export interface Backend {
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
  updateTask(taskId: number, changes: TaskChanges): Promise<Task>
  assignTask(taskId: number, personId: number): Promise<TaskAssignment>
  unassignTask(taskId: number, personId: number): Promise<null>
  setAssignmentStatus(taskId: number, personId: number, status: AssignmentStatus): Promise<TaskAssignment>

  listAvailabilityInNetwork(networkId: number, viewerId: number): Promise<Record<number, AvailabilityWindow[]>>
  listCarePlans(networkId: number, viewerId: number): Promise<CarePlan[]>

  listGaps(networkId: number, viewerId: number, status?: GapStatus | null): Promise<Gap[]>
  resolveGap(gapId: number, resolvedByPersonId: number): Promise<Gap>

  // Only the mock has these. The UI hides care-plan upload and review without them.
  createCarePlan?(networkId: number, viewerId: number, plan: NewCarePlan): Promise<CarePlan>
  /** Returns the plan_conflict gaps found (also visible through listGaps). */
  analyzeCarePlans?(networkId: number, viewerId: number, planIds: number[]): Promise<Gap[]>

  createCheckin(checkin: NewCheckin): Promise<Checkin>
  listCheckins(networkId: number, personId: number, viewerId: number, limit?: number): Promise<Checkin[]>
  listLatestBurnoutScores(networkId: number, viewerId: number): Promise<BurnoutScore[]>
  getBurnoutHistory(networkId: number, personId: number, viewerId: number, limit?: number): Promise<BurnoutScore[]>

  grantRestrictedAccess(networkId: number, granteeId: number, grantedById: number): Promise<AccessGrant>
  revokeRestrictedAccess(networkId: number, granteeId: number, revokedById: number): Promise<null>
  listAccessGrants(networkId: number, viewerId: number): Promise<AccessGrant[]>
  canViewRestricted(networkId: number, viewerId: number): Promise<boolean>
}

export const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API !== 'false'

/** Care-plan upload and conflict review exist only in the mock for now. */
export const CAN_UPLOAD_CARE_PLANS = USE_MOCK_API

// The two backends are still plain JS; this cast is the one place their shape is asserted.
export const api = (USE_MOCK_API ? mockBackend : httpBackend) as unknown as Backend
