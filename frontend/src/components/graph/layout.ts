import type { Person } from '../../types/api'

export const NODE_WIDTH = 176
export const NODE_HEIGHT = 60
export const PATIENT_SIZE = 112
export const GHOST_WIDTH = 196
export const GHOST_HEIGHT = 52

const RADIUS = 300
const TYPE_ORDER: Record<Person['person_type'], number> = { family: 0, professional: 1, patient: 2 }

type Point = { x: number; y: number }

/**
 * Radial layout: the patient sits at the origin and everyone else orbits on a circle,
 * family first and then professionals so each group stays together. The backend sends
 * no positions. Returned positions are the node's top-left corner, as React Flow expects.
 */
export function radialLayout(people: Person[], patientId: number | null): Map<number, Point> {
  const positions = new Map<number, Point>()
  const others = people
    .filter((p) => p.id !== patientId)
    .sort((a, b) => TYPE_ORDER[a.person_type] - TYPE_ORDER[b.person_type] || a.id - b.id)

  if (patientId !== null) {
    positions.set(patientId, { x: -PATIENT_SIZE / 2, y: -PATIENT_SIZE / 2 })
  }
  others.forEach((p, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / others.length
    positions.set(p.id, {
      x: Math.cos(angle) * RADIUS * 1.35 - NODE_WIDTH / 2,
      y: Math.sin(angle) * RADIUS - NODE_HEIGHT / 2,
    })
  })
  return positions
}

/** Ghost "unowned task" nodes sit on a tight ellipse inside the caregiver ring. */
export function ghostLayout(count: number): Point[] {
  const slots = Math.max(count, 3)
  return Array.from({ length: count }, (_, i) => {
    const angle = Math.PI / 6 + (2 * Math.PI * i) / slots
    return {
      x: Math.cos(angle) * 235 - GHOST_WIDTH / 2,
      y: Math.sin(angle) * 165 - GHOST_HEIGHT / 2,
    }
  })
}
