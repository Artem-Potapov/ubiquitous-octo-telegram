import { useEffect } from 'react'
import { ConstellationGraph } from './components/graph/ConstellationGraph'
import { DemoStepper } from './components/graph/DemoStepper'
import { AccessBanner } from './components/shell/AccessBanner'
import { ActionDrawer } from './components/shell/ActionDrawer'
import { HealthStrip } from './components/shell/HealthStrip'
import { TopBar } from './components/shell/TopBar'
import { usePolling } from './hooks/usePolling'
import { useConstellation } from './store/useConstellation'

const POLL_MS = 3000

function App() {
  const loadNetwork = useConstellation((s) => s.loadNetwork)
  const refresh = useConstellation((s) => s.refresh)
  const loading = useConstellation((s) => s.loading)
  const error = useConstellation((s) => s.error)

  useEffect(() => {
    void loadNetwork()
  }, [loadNetwork])

  // Skip polling while the first load or a role switch is in flight.
  usePolling(() => {
    if (!loading) return refresh()
  }, POLL_MS)

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col gap-3 p-4" aria-label="Care network">
          {error && (
            <div role="alert" className="flex items-center gap-3 rounded-md border border-danger-600/30 bg-danger-50 px-3 py-2 text-sm text-danger-700">
              <span className="flex-1">Couldn't reach the care network: {error}</span>
              <button
                type="button"
                onClick={() => void loadNetwork()}
                className="rounded border border-danger-600/40 bg-white px-2.5 py-1 text-xs font-medium hover:bg-danger-50"
              >
                Retry
              </button>
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <AccessBanner />
            </div>
            <DemoStepper />
          </div>
          <HealthStrip />
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <ConstellationGraph />
          </div>
        </main>
        <ActionDrawer />
      </div>
    </div>
  )
}

export default App
