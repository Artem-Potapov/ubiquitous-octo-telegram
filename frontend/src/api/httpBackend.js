// REAL BACKEND CLIENT - not used until VITE_USE_MOCK_API=false.
//
// Same function names and return shapes as mockBackend.js. The endpoints below
// are a PROPOSAL for the FastAPI team (see frontend/INTEGRATION.md); none of
// them exist yet. The viewer id travels in an X-Viewer-Id header for the demo -
// production would derive it from an authenticated session instead.

import { AccessDeniedError, ConflictError, DatabaseError, NotFoundError } from './contract'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

async function request(method, path, { viewerId, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (viewerId !== undefined) headers['X-Viewer-Id'] = String(viewerId)
  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  if (res.ok) return res.status === 204 ? null : res.json()
  const detail = (await res.json().catch(() => ({}))).detail ?? res.statusText
  if (res.status === 404) throw new NotFoundError(detail)
  if (res.status === 403) throw new AccessDeniedError(detail)
  if (res.status === 409) throw new ConflictError(detail)
  throw new DatabaseError(detail)
}

const get = (path, viewerId) => request('GET', path, { viewerId })

export const httpBackend = {
  isMock: false,

  resetDemo: () => request('POST', '/demo/reset'),
  detectGaps: (networkId) => request('POST', `/networks/${networkId}/gaps/detect`),

  getPerson: (personId) => get(`/people/${personId}`),
  listPeopleInNetwork: (networkId, viewerId) => get(`/networks/${networkId}/people`, viewerId),
  listNetworksForPerson: (personId) => get(`/people/${personId}/networks`),
  getCareNetwork: (networkId, viewerId) => get(`/networks/${networkId}`, viewerId),
  getPatientProfile: (networkId, viewerId) => get(`/networks/${networkId}/patient-profile`, viewerId),

  getNetworkGraph: (networkId, viewerId) => get(`/networks/${networkId}/graph`, viewerId),

  listTasks: (networkId, viewerId) => get(`/networks/${networkId}/tasks`, viewerId),
  updateTask: (taskId, changes) => request('PATCH', `/tasks/${taskId}`, { body: changes }),
  assignTask: (taskId, personId) => request('PUT', `/tasks/${taskId}/assignments/${personId}`),
  unassignTask: (taskId, personId) => request('DELETE', `/tasks/${taskId}/assignments/${personId}`),
  setAssignmentStatus: (taskId, personId, status) =>
    request('PATCH', `/tasks/${taskId}/assignments/${personId}`, { body: { status } }),

  listAvailabilityInNetwork: (networkId, viewerId) => get(`/networks/${networkId}/availability`, viewerId),

  listCarePlans: (networkId, viewerId) => get(`/networks/${networkId}/care-plans`, viewerId),

  listGaps: (networkId, viewerId, status = 'open') =>
    get(`/networks/${networkId}/gaps${status ? `?status=${status}` : ''}`, viewerId),
  resolveGap: (gapId, resolvedByPersonId) =>
    request('POST', `/gaps/${gapId}/resolve`, { body: { resolved_by_person_id: resolvedByPersonId } }),

  createCheckin: (newCheckin) => request('POST', '/checkins', { body: newCheckin }),
  listCheckins: (networkId, personId, viewerId, limit = 50) =>
    get(`/networks/${networkId}/people/${personId}/checkins?limit=${limit}`, viewerId),
  listLatestBurnoutScores: (networkId, viewerId) => get(`/networks/${networkId}/burnout/latest`, viewerId),
  getBurnoutHistory: (networkId, personId, viewerId, limit = 30) =>
    get(`/networks/${networkId}/people/${personId}/burnout?limit=${limit}`, viewerId),

  grantRestrictedAccess: (networkId, granteeId, grantedById) =>
    request('PUT', `/networks/${networkId}/grants/${granteeId}`, { viewerId: grantedById }),
  revokeRestrictedAccess: (networkId, granteeId, revokedById) =>
    request('DELETE', `/networks/${networkId}/grants/${granteeId}`, { viewerId: revokedById }),
  listAccessGrants: (networkId, viewerId) => get(`/networks/${networkId}/grants`, viewerId),
  canViewRestricted: (networkId, viewerId) => get(`/networks/${networkId}/can-view-restricted`, viewerId),
}
