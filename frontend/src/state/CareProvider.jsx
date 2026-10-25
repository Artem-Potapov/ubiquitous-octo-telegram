// Holds everything the UI needs: who is viewing (demo role switcher), the data
// that viewer is allowed to see, and the actions that change it.
//
// Pattern for every action: call the API -> re-run gap detection -> reload the
// viewer's data. Components never touch the API directly.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { CareContext } from './careContext'
import { computeStrain } from '../domain/workload'
import { detectWorkloadImbalance } from '../domain/gapEngine'
import { firstName } from '../domain/roles'

const PAGES = ['overview', 'network', 'tasks', 'gaps', 'workload', 'privacy']
const DEFAULT_VIEWER_ID = 2 // Margaret, the overloaded family caregiver, opens the demo

function pageFromHash() {
  const page = window.location.hash.replace('#/', '').split('?')[0]
  return PAGES.includes(page) ? page : 'overview'
}

async function loadSnapshot(viewerId) {
  const [network] = await api.listNetworksForPerson(viewerId)
  if (!network) throw new Error('This person is not part of a care network')
  const id = network.id

  const [graph, tasks, gaps, availability, carePlans, grants, burnout, canViewRestricted, profile] = await Promise.all([
    api.getNetworkGraph(id, viewerId),
    api.listTasks(id, viewerId),
    api.listGaps(id, viewerId, null),
    api.listAvailabilityInNetwork(id, viewerId),
    api.listCarePlans(id, viewerId),
    api.listAccessGrants(id, viewerId),
    api.listLatestBurnoutScores(id, viewerId),
    api.canViewRestricted(id, viewerId),
    api.getPatientProfile(id, viewerId),
  ])

  const people = graph.nodes
  const viewer = people.find((p) => p.id === viewerId)
  const family = people.filter((p) => p.person_type === 'family')
  const [histories, myCheckins] = await Promise.all([
    Promise.all(family.map((p) => api.getBurnoutHistory(id, p.id, viewerId, 8))),
    viewer.person_type === 'family' ? api.listCheckins(id, viewerId, viewerId, 5) : Promise.resolve([]),
  ])

  return {
    networkId: id,
    network,
    profile,
    viewer,
    patient: people.find((p) => p.id === network.patient_id),
    people,
    peopleById: new Map(people.map((p) => [p.id, p])),
    edges: graph.edges,
    tasks,
    tasksById: new Map(tasks.map((t) => [t.id, t])),
    gaps,
    openGaps: gaps.filter((g) => g.status === 'open'),
    resolvedGaps: gaps.filter((g) => g.status === 'resolved'),
    availability,
    carePlans,
    grants,
    burnout,
    burnoutHistory: Object.fromEntries(family.map((p, i) => [p.id, histories[i]])),
    canViewRestricted,
    myCheckins,
  }
}

export function CareProvider({ children }) {
  const [viewerId, setViewerId] = useState(DEFAULT_VIEWER_ID)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(pageFromHash)
  const [navParams, setNavParams] = useState({})
  const [toasts, setToasts] = useState([])
  const [privacyLog, setPrivacyLog] = useState([])
  const toastId = useRef(0)

  const refresh = useCallback(async () => {
    try {
      setData(await loadSnapshot(viewerId))
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }, [viewerId])

  // Load the viewer's data whenever the viewer changes. The `cancelled` flag
  // drops responses for a viewer we've already switched away from.
  useEffect(() => {
    let cancelled = false
    loadSnapshot(viewerId)
      .then((snapshot) => {
        if (cancelled) return
        setData(snapshot)
        setError(null)
      })
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [viewerId])

  useEffect(() => {
    const onHash = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = useCallback((nextPage, params = {}) => {
    setNavParams(params)
    setPage(nextPage)
    if (window.location.hash !== `#/${nextPage}`) window.location.hash = `#/${nextPage}`
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const toast = useCallback((message, tone = 'success') => {
    const id = ++toastId.current
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])

  /** Run API writes, re-run gap detection, reload. Returns true on success. */
  const mutate = useCallback(
    async (work, successMessage) => {
      if (!data) return false
      setBusy(true)
      try {
        await work(data.networkId)
        await api.detectGaps(data.networkId)
        await refresh()
        if (successMessage) toast(successMessage)
        return true
      } catch (e) {
        toast(e.message || 'Something went wrong', 'error')
        return false
      } finally {
        setBusy(false)
      }
    },
    [data, refresh, toast],
  )

  const name = useCallback((id) => firstName(data?.peopleById.get(id)), [data])

  const actions = useMemo(
    () => ({
      assign: (taskId, personId) => mutate(() => api.assignTask(taskId, personId), `Assigned to ${name(personId)}`),
      unassign: (taskId, personId) => mutate(() => api.unassignTask(taskId, personId), `${name(personId)} removed from task`),
      setStatus: (taskId, personId, status) =>
        mutate(() => api.setAssignmentStatus(taskId, personId, status), `Marked ${status === 'done' ? 'complete' : status}`),
      updateTask: (taskId, changes, message) => mutate(() => api.updateTask(taskId, changes), message),

      /** Apply a resolution: run `work`, then mark the gap resolved by the viewer. */
      resolveGap: (gapId, work, message) =>
        mutate(async () => {
          await api.resolveGap(gapId, viewerId)
          if (work) await work(api)
        }, message),

      /** Hand tasks from one caregiver to another (workload rebalancing). */
      applyMoves: (moves, message) =>
        mutate(async () => {
          for (const m of moves) {
            await api.unassignTask(m.taskId, m.fromId)
            await api.assignTask(m.taskId, m.toId)
          }
        }, message),

      setRestrictedAccess: (personId, allow) =>
        mutate(async (networkId) => {
          if (allow) await api.grantRestrictedAccess(networkId, personId, viewerId)
          else await api.revokeRestrictedAccess(networkId, personId, viewerId)
          setPrivacyLog((log) => [{ personId, allow, at: new Date().toISOString() }, ...log].slice(0, 6))
        }, allow ? `${name(personId)} can now see restricted information` : `Restricted information hidden from ${name(personId)}`),

      submitCheckin: (sentimentScore, message) =>
        mutate(
          (networkId) =>
            api.createCheckin({ person_id: viewerId, network_id: networkId, message, sentiment_score: sentimentScore }),
          'Check-in saved — thank you',
        ),

      resetDemo: async () => {
        setBusy(true)
        await api.resetDemo()
        setPrivacyLog([])
        await refresh()
        setBusy(false)
        toast('Demo data reset')
      },
    }),
    [mutate, name, viewerId, refresh, toast],
  )

  // Derived, client-side workload analytics (illustrative formula in domain/workload.js).
  const derived = useMemo(() => {
    if (!data) return null
    const sentimentByPerson = Object.fromEntries(data.burnout.map((s) => [s.person_id, s.sentiment_average]))
    const args = { tasks: data.tasks, people: data.people, availability: data.availability, sentimentByPerson }
    return {
      sentimentByPerson,
      strainRows: computeStrain(data.tasks, data.people, sentimentByPerson),
      imbalance: detectWorkloadImbalance(args),
    }
  }, [data])

  const value = {
    viewerId,
    setViewerId,
    data,
    derived,
    error,
    busy,
    page,
    navParams,
    navigate,
    toasts,
    toast,
    actions,
    privacyLog,
    name,
  }

  return <CareContext.Provider value={value}>{children}</CareContext.Provider>
}
