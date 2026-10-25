import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { useCare } from '../../state/careContext'

export function Toasts() {
  const { toasts } = useCare()
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-3 rounded-xl bg-ink-900 px-4 py-3 text-sm text-white shadow-xl shadow-ink-950/20 animate-fade-in"
        >
          {t.tone === 'error' ? (
            <AlertCircle className="size-5 shrink-0 text-rose-400" aria-hidden />
          ) : (
            <CheckCircle2 className="size-5 shrink-0 text-emerald-400" aria-hidden />
          )}
          {t.message}
        </div>
      ))}
    </div>
  )
}
