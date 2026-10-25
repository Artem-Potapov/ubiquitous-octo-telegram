import { ChevronRight } from 'lucide-react'

const swatch = 'inline-block h-3 w-3 shrink-0 rounded-sm'

/** Foldable so it can get out of the way of the graph. */
export function Legend() {
  return (
    <details open className="group rounded-md border border-slate-200 bg-white text-xs text-slate-700">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-1.5 font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
        Legend
      </summary>
      <ul className="space-y-1.5 px-3 pb-2.5">
        <li className="flex items-center gap-2">
          <span className={`${swatch} rounded-full bg-navy-900`} /> Patient
        </li>
        <li className="flex items-center gap-2">
          <span className={`${swatch} border-2 border-navy-600 bg-navy-50`} /> Professional
        </li>
        <li className="flex items-center gap-2">
          <span className={`${swatch} border-2 border-teal-600 bg-teal-50`} /> Family
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-3 shrink-0 bg-slate-400" /> Care relationship
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-3 shrink-0 bg-danger-600" /> Coordination gap
        </li>
        <li className="flex items-center gap-2">
          <span className={`${swatch} border border-dashed border-danger-600 bg-danger-50`} /> Task with no owner
        </li>
        <li className="flex items-center gap-2">
          <span className={`${swatch} ring-2 ring-warn-600`} /> Burnout warning
        </li>
        <li className="flex items-center gap-2">
          <span className={`${swatch} outline outline-2 outline-offset-2 outline-slate-900`} /> Selected
        </li>
      </ul>
    </details>
  )
}
