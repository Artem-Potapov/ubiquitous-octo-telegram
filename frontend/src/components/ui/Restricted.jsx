import { Lock } from 'lucide-react'

/** Shown wherever the data layer returned a redacted row. */
export function RestrictedNotice({ patientName = 'the patient', compact = false }) {
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
        <Lock className="size-3.5" aria-hidden /> Restricted by {patientName}
      </span>
    )
  }
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
      <Lock className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
      <p>
        <span className="font-medium text-slate-700">Details hidden.</span> {patientName} has restricted this information. Only
        people they authorize, and their physicians, can see it.
      </p>
    </div>
  )
}

export function LockedTitle({ children }) {
  return (
    <span className="inline-flex items-center gap-1.5 italic text-slate-500">
      <Lock className="size-3.5 shrink-0" aria-hidden />
      {children}
    </span>
  )
}
