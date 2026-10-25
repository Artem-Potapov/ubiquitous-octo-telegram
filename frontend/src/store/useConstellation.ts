import { create } from 'zustand'
import { api } from '../api'
import { reassign } from '../api/reassign'
import type {
  AccessGrant,
  BurnoutScore,
  CarePlan,
  Gap,
  NewCarePlan,
  PatientProfile,
  Person,
  Relationship,
  Task,
} from '../types/api'
import { DEMO_NETWORK_ID, VIEWER_BY_ROLE, type Role } from './roles'

// Server data, the active role, and the few UI selections the graph and drawer share
// (selected person, highlighted gap, open tab) live here. Hover-only and form state
// stay in components.

export type DrawerTab = 'gaps' | 'tasks' | 'plans' | 'privacy'

export interface ActivityEntry {
  id: number
  at: string
  text: string
  tone: 'info' | 'success' | 'error'
}

interface ConstellationState {
  role: Role
  networkId: number
  patient: Person | null
  profile: PatientProfile | null
  people: Person[]
  relationships: Relationship[]
  tasks: Task[]
  carePlans: CarePlan[]
  gaps: Gap[]
  burnout: BurnoutScore[]
  grants: AccessGrant[]
  canViewRestricted: boolean
  loading: boolean
  error: string | null

  actionError: string | null
  analyzing: boolean
  conflicts: Gap[]
  activity: ActivityEntry[]

  selectedPersonId: number | null
  highlightedGapId: number | null
  drawerTab: DrawerTab

  setRole: (role: Role) => void
  loadNetwork: () => Promise<void>
  /** The cheap, frequently-changing slice, polled every few seconds. */
  refresh: () => Promise<void>
  acceptReassignment: (gap: Gap) => Promise<void>
  addPlans: (plans: NewCarePlan[]) => Promise<number[]>
  analyzePlans: (planIds: number[]) => Promise<void>
  toggleGrant: (personId: number, grant: boolean) => Promise<void>
  resetDemo: () => Promise<void>

  selectPerson: (id: number | null) => void
  highlightGap: (id: number | null) => void
  setDrawerTab: (tab: DrawerTab) => void
  dismissActionError: () => void
}

// Bumped whenever the viewer changes so a slow response for the previous viewer is
// never shown under the new one.
let epoch = 0
// Bumped around every write. A poll that started before a write finished is discarded,
// otherwise it could bring back a gap the user just resolved.
let writes = 0
let writesInFlight = 0
let activityId = 1

const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')

const EMPTY_DATA = {
  patient: null,
  profile: null,
  people: [],
  relationships: [],
  tasks: [],
  carePlans: [],
  gaps: [],
  burnout: [],
  grants: [],
  canViewRestricted: false,
  selectedPersonId: null,
  highlightedGapId: null,
  conflicts: [],
  actionError: null,
}

export const useConstellation = create<ConstellationState>((set, get) => {
  const viewerId = () => VIEWER_BY_ROLE[get().role]
  const log = (text: string, tone: ActivityEntry['tone'] = 'info') =>
    set((s) => ({ activity: [{ id: activityId++, at: new Date().toISOString(), text, tone }, ...s.activity].slice(0, 50) }))
  const nameOf = (id: number | null) => get().people.find((p) => p.id === id)?.full_name ?? 'someone'

  return {
    role: 'Patient',
    networkId: DEMO_NETWORK_ID,
    ...EMPTY_DATA,
    loading: true,
    error: null,
    analyzing: false,
    activity: [],
    drawerTab: 'gaps',

    setRole: (role) => {
      if (role === get().role) return
      epoch++
      set((s) => ({
        ...EMPTY_DATA,
        role,
        loading: true,
        error: null,
        drawerTab: s.drawerTab === 'privacy' && role !== 'Patient' ? 'gaps' : s.drawerTab,
      }))
      void get().loadNetwork()
    },

    loadNetwork: async () => {
      const { networkId } = get()
      const viewer = viewerId()
      const mine = epoch
      try {
        const [network, graph, tasks, carePlans, gaps, burnout, grants, canView, profile] = await Promise.all([
          api.getCareNetwork(networkId, viewer),
          api.getNetworkGraph(networkId, viewer),
          api.listTasks(networkId, viewer),
          api.listCarePlans(networkId, viewer),
          api.listGaps(networkId, viewer, 'open'),
          api.listLatestBurnoutScores(networkId, viewer),
          api.listAccessGrants(networkId, viewer),
          api.canViewRestricted(networkId, viewer),
          // Not in the backend contract yet, so tolerate its absence.
          api.getPatientProfile(networkId, viewer).catch(() => null),
        ])
        if (mine !== epoch) return
        set({
          patient: graph.nodes.find((p) => p.id === network.patient_id) ?? null,
          profile,
          people: graph.nodes,
          relationships: graph.edges,
          tasks,
          carePlans,
          gaps,
          burnout,
          grants,
          canViewRestricted: canView,
          loading: false,
          error: null,
        })
      } catch (e) {
        if (mine !== epoch) return
        set({ loading: false, error: message(e) })
      }
    },

    refresh: async () => {
      if (writesInFlight > 0) return
      const { networkId } = get()
      const viewer = viewerId()
      const mine = epoch
      const writesAtStart = writes
      try {
        const [gaps, tasks, burnout] = await Promise.all([
          api.listGaps(networkId, viewer, 'open'),
          api.listTasks(networkId, viewer),
          api.listLatestBurnoutScores(networkId, viewer),
        ])
        if (mine !== epoch || writesAtStart !== writes) return
        set({ gaps, tasks, burnout, error: null })
      } catch (e) {
        if (mine !== epoch) return
        set({ error: message(e) })
      }
    },

    acceptReassignment: async (gap) => {
      const previous = get().gaps
      const mine = epoch
      const assignee = gap.suggested_assignee_id
      writes++
      writesInFlight++
      // Optimistic: the red edge and card go away immediately.
      set({ gaps: previous.filter((g) => g.id !== gap.id), actionError: null })
      try {
        const task = get().tasks.find((t) => t.id === gap.task_id)
        await reassign(api, gap, task, viewerId(), assignee)
        if (mine !== epoch) return
        log(assignee !== null ? `Reassigned to ${nameOf(assignee)}` : 'Marked resolved', 'success')
      } catch (e) {
        if (mine !== epoch) return
        // Roll back to what was on screen before the click.
        set({ gaps: previous, actionError: `Couldn't resolve that gap: ${message(e)}` })
        log(`Couldn't resolve gap: ${message(e)}`, 'error')
      } finally {
        writes++
        writesInFlight--
      }
      if (mine === epoch) await get().refresh()
    },

    addPlans: async (plans) => {
      const mine = epoch
      writes++
      writesInFlight++
      const ids: number[] = []
      try {
        for (const plan of plans) {
          if (!api.createCarePlan) throw new Error('This backend does not support care-plan upload yet')
          const created = await api.createCarePlan(get().networkId, viewerId(), plan)
          ids.push(created.id)
          if (mine === epoch) log(`Uploaded care plan: ${created.title}`)
        }
        if (mine === epoch) set({ carePlans: await api.listCarePlans(get().networkId, viewerId()), actionError: null })
      } catch (e) {
        if (mine === epoch) {
          set({ actionError: `Couldn't upload: ${message(e)}` })
          log(`Couldn't upload care plan: ${message(e)}`, 'error')
        }
      } finally {
        writes++
        writesInFlight--
      }
      return ids
    },

    analyzePlans: async (planIds) => {
      const mine = epoch
      writes++
      writesInFlight++
      set({ analyzing: true, conflicts: [], actionError: null })
      try {
        if (!api.analyzeCarePlans) throw new Error('This backend does not support care-plan review yet')
        const conflicts = await api.analyzeCarePlans(get().networkId, viewerId(), planIds)
        if (mine !== epoch) return
        const gaps = await api.listGaps(get().networkId, viewerId(), 'open')
        if (mine !== epoch) return
        set({ conflicts, gaps })
        log(
          conflicts.length > 0
            ? `Care plan review found ${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'}`
            : 'Care plan review found no conflicts',
          conflicts.length > 0 ? 'info' : 'success',
        )
      } catch (e) {
        if (mine !== epoch) return
        set({ actionError: `Care plan review failed: ${message(e)}` })
        log(`Care plan review failed: ${message(e)}`, 'error')
      } finally {
        writes++
        writesInFlight--
        if (mine === epoch) set({ analyzing: false })
      }
    },

    toggleGrant: async (personId, grant) => {
      const mine = epoch
      const { networkId } = get()
      writes++
      writesInFlight++
      try {
        if (grant) await api.grantRestrictedAccess(networkId, personId, viewerId())
        else await api.revokeRestrictedAccess(networkId, personId, viewerId())
        if (mine !== epoch) return
        set({ grants: await api.listAccessGrants(networkId, viewerId()), actionError: null })
        log(`${grant ? 'Shared' : 'Stopped sharing'} restricted information with ${nameOf(personId)}`, 'success')
      } catch (e) {
        if (mine !== epoch) return
        set({ actionError: `Couldn't update sharing: ${message(e)}` })
      } finally {
        writes++
        writesInFlight--
      }
    },

    resetDemo: async () => {
      epoch++
      writes++
      set({ ...EMPTY_DATA, loading: true, error: null, activity: [], conflicts: [], analyzing: false, drawerTab: 'gaps' })
      try {
        await api.resetDemo()
      } catch (e) {
        set({ loading: false, error: message(e) })
        return
      }
      await get().loadNetwork()
    },

    selectPerson: (id) => set({ selectedPersonId: id }),
    highlightGap: (id) => set({ highlightedGapId: id }),
    setDrawerTab: (drawerTab) => set({ drawerTab }),
    dismissActionError: () => set({ actionError: null }),
  }
})
