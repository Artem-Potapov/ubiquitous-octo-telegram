import { CareProvider } from './state/CareProvider'
import { useCare } from './state/careContext'
import { AppShell } from './components/layout/AppShell'
import { OverviewPage } from './pages/OverviewPage'
import { NetworkPage } from './pages/NetworkPage'
import { TasksPage } from './pages/TasksPage'
import { GapsPage } from './pages/GapsPage'
import { WorkloadPage } from './pages/WorkloadPage'
import { PrivacyPage } from './pages/PrivacyPage'

const PAGES = {
  overview: OverviewPage,
  network: NetworkPage,
  tasks: TasksPage,
  gaps: GapsPage,
  workload: WorkloadPage,
  privacy: PrivacyPage,
}

function CurrentPage() {
  const { page } = useCare()
  const Page = PAGES[page] ?? OverviewPage
  return <Page />
}

function App() {
  return (
    <CareProvider>
      <AppShell>
        <CurrentPage />
      </AppShell>
    </CareProvider>
  )
}

export default App
