import { useState, type ReactNode } from 'react'
import { FlaskConical, Loader2, Menu, X } from 'lucide-react'
import { useCareContext } from '../../state/careContext'
import { USE_MOCK_API } from '../../api'
import { RoleSwitcher } from './RoleSwitcher'
import { Toasts } from '../ui/Toasts'
import { NAV } from './nav'


function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" className="size-9 shrink-0" aria-hidden>
        <rect width="64" height="64" rx="16" fill="#1f2a50" />
        <g stroke="#7c93ff" strokeWidth="2" strokeLinecap="round" opacity="0.8">
          <line x1="32" y1="32" x2="15" y2="18" />
          <line x1="32" y1="32" x2="50" y2="20" />
          <line x1="32" y1="32" x2="18" y2="48" />
        </g>
        <circle cx="32" cy="32" r="8" fill="#eda100" />
        <circle cx="15" cy="18" r="5" fill="#1baf7a" />
        <circle cx="50" cy="20" r="5" fill="#2a78d6" />
        <circle cx="18" cy="48" r="5" fill="#6250d6" />
        <circle cx="48" cy="47" r="5" fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeDasharray="3 3" />
      </svg>
      <div className="leading-tight">
        <p className="font-display text-[15px] font-bold text-white">Caregiver</p>
        <p className="font-display text-[15px] font-bold text-indigo-300">Constellation</p>
      </div>
    </div>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { page, navigate, data, derived } = useCareContext()
  const gapCount = (data?.openGaps.length ?? 0) + (derived?.imbalance ? 1 : 0)

  return (
    <div className="flex h-full flex-col bg-ink-900 px-4 py-5">
      <div className="px-2">
        <Logo />
      </div>

      <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
        {NAV.map(({ page: p, label, icon: Icon }) => {
          const active = page === p
          return (
            <button
              key={p}
              type="button"
              onClick={() => {
                navigate(p)
                onNavigate?.()
              }}
              aria-current={active ? 'page' : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
              }`}
            >
              <Icon className={`size-[18px] ${active ? 'text-indigo-300' : 'text-slate-500 group-hover:text-slate-300'}`} />
              <span className="flex-1 text-left">{label}</span>
              {p === 'gaps' && gapCount > 0 && (
                <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">{gapCount}</span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto space-y-3 px-1 pt-6">
        <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
            <FlaskConical className="size-3.5" /> Hackathon prototype
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            Fictional, synthetic data only. Not HIPAA-compliant and not for clinical use.
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-black/20 px-2 py-1 text-[11px] font-medium text-slate-300">
            <span className={`size-1.5 rounded-full ${USE_MOCK_API ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            {USE_MOCK_API ? 'Simulated backend (mock API)' : 'Connected to live API'}
          </p>
        </div>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { page, data, viewerId, error } = useCareContext()
  const [mobileOpen, setMobileOpen] = useState(false)
  const current = NAV.find((n) => n.page === page) ?? NAV[0]
  // Never render one viewer's data under another viewer's name while switching.
  const ready = data && data.viewer.id === viewerId

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/60" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-72 animate-fade-in">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-5 rounded-lg p-1.5 text-slate-400 hover:bg-white/10"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-slate-50/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-200/60 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-lg font-bold text-slate-900 sm:text-xl">{current.title}</h1>
              <p className="hidden truncate text-sm text-slate-500 sm:block">{current.blurb}</p>
            </div>
            {data && (
              <div className="hidden items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200 md:flex">
                <span className="size-2 rounded-full bg-amber-400" />
                <span className="text-slate-500">Patient</span>
                <span className="font-semibold text-slate-900">{data.patient.full_name}</span>
              </div>
            )}
            <RoleSwitcher />
          </div>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
              <p className="font-semibold">Couldn't load the care network</p>
              <p className="mt-1 text-sm">{error}</p>
            </div>
          ) : ready ? (
            <div key={`${page}-${viewerId}`} className="animate-fade-in">
              {children}
            </div>
          ) : (
            <div className="flex min-h-[50vh] items-center justify-center text-slate-500">
              <Loader2 className="mr-2 size-5 animate-spin" /> Loading this person's view…
            </div>
          )}
        </main>
      </div>
      <Toasts />
    </div>
  )
}
