// Demo role switcher: each role views the dashboard as one person in the seeded network.
// The backend authorizes by viewer person id, so a role is just a way to pick that person.

export const ROLES = ['Patient', 'Family', 'Clinician', 'Pharmacist'] as const
export type Role = (typeof ROLES)[number]

export const DEMO_NETWORK_ID = 1

export const VIEWER_BY_ROLE: Record<Role, number> = {
  Patient: 1,
  Family: 2,
  Clinician: 6,
  Pharmacist: 9,
}
