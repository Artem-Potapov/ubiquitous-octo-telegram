import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useConstellation } from '../../store/useConstellation'

// Presenter controls for the four-step demo story. Each step puts the dashboard in the
// right state; the presenter still performs the action (resolve, upload) themselves.
export function DemoStepper() {
  const [active, setActive] = useState<number | null>(null)
  const setRole = useConstellation((s) => s.setRole)
  const resetDemo = useConstellation((s) => s.resetDemo)
  const setDrawerTab = useConstellation((s) => s.setDrawerTab)
  const highlightGap = useConstellation((s) => s.highlightGap)

  const steps = [
    {
      title: 'Broken network',
      hint: 'Resets the data and views it as the spouse: ghost task, burnout badge, red edges',
      run: async () => {
        setRole('Family')
        setDrawerTab('gaps')
        await resetDemo()
      },
    },
    {
      title: 'Resolve a gap',
      hint: 'Highlights the top gap. Press Accept reassignment and watch the red edge disappear',
      run: () => {
        setDrawerTab('gaps')
        highlightGap(useConstellation.getState().gaps[0]?.id ?? null)
      },
    },
    {
      title: 'Upload care plans',
      hint: 'Opens Care Plans. Use sample plans, then Review for conflicts',
      run: () => setDrawerTab('plans'),
    },
    {
      title: 'Pharmacist view',
      hint: 'Switches to the pharmacist: restricted items appear locked',
      run: () => {
        setRole('Pharmacist')
        setDrawerTab('gaps')
      },
    },
  ]

  return (
    <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-1 text-xs">
      <span className="px-2 font-semibold uppercase tracking-wide text-slate-500">Demo</span>
      {steps.map((step, i) => (
        <button
          key={step.title}
          type="button"
          title={step.hint}
          aria-current={active === i ? 'step' : undefined}
          onClick={async () => {
            setActive(i)
            await step.run()
          }}
          className={`flex items-center gap-1.5 rounded px-2 py-1 font-medium ${
            active === i ? 'bg-navy-900 text-white' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <span
            className={`flex size-4 items-center justify-center rounded-full text-[10px] ${
              active === i ? 'bg-white text-navy-900' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {i + 1}
          </span>
          {step.title}
        </button>
      ))}
      <button
        type="button"
        title="Restore the starting data"
        onClick={async () => {
          setActive(null)
          await resetDemo()
        }}
        className="ml-1 flex items-center gap-1 rounded px-2 py-1 font-medium text-slate-600 hover:bg-slate-100"
      >
        <RotateCcw className="size-3" aria-hidden /> Reset
      </button>
    </div>
  )
}
