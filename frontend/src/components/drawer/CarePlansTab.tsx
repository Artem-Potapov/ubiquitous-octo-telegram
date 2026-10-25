import { useRef, useState, type DragEvent } from 'react'
import { CircleCheck, FileText, Lock, Upload } from 'lucide-react'
import { CAN_UPLOAD_CARE_PLANS } from '../../api'
import { SAMPLE_PLANS } from '../../api/samplePlans'
import { useConstellation } from '../../store/useConstellation'
import type { NewCarePlan } from '../../types/api'
import { CardSkeletons, Skeleton } from '../common/Skeleton'
import { ConflictCard } from './ConflictCard'

async function readPlan(file: File): Promise<NewCarePlan> {
  return { title: file.name.replace(/\.[^.]+$/, ''), raw_text: await file.text() }
}

export function CarePlansTab() {
  const plans = useConstellation((s) => s.carePlans)
  const people = useConstellation((s) => s.people)
  const loading = useConstellation((s) => s.loading)
  const analyzing = useConstellation((s) => s.analyzing)
  const conflicts = useConstellation((s) => s.conflicts)
  const actionError = useConstellation((s) => s.actionError)
  const addPlans = useConstellation((s) => s.addPlans)
  const analyzePlans = useConstellation((s) => s.analyzePlans)

  // Form state stays local; only server data lives in the store.
  const [selected, setSelected] = useState<number[]>([])
  const [dragging, setDragging] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  if (loading) return <CardSkeletons count={2} />

  const upload = async (list: NewCarePlan[]) => {
    const ids = await addPlans(list)
    if (ids.length > 0) setSelected(ids.slice(-2))
    setReviewed(false)
  }

  const onFiles = async (files: FileList | File[]) => {
    const texts = [...files].filter((f) => /\.(txt|md)$/i.test(f.name))
    if (texts.length > 0) await upload(await Promise.all(texts.map(readPlan)))
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void onFiles(e.dataTransfer.files)
  }

  const toggle = (id: number) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-2)))

  const review = async () => {
    setReviewed(true)
    await analyzePlans(selected)
  }

  return (
    <div className="space-y-4">
      {!CAN_UPLOAD_CARE_PLANS && (
        <p className="rounded-md bg-slate-100 p-2.5 text-xs text-slate-600">
          Care-plan upload and conflict review aren't available on this backend yet. Plans below are read-only.
        </p>
      )}
      {CAN_UPLOAD_CARE_PLANS && (
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-lg border border-dashed p-4 text-center ${
          dragging ? 'border-navy-600 bg-navy-50' : 'border-slate-300 bg-slate-50'
        }`}
      >
        <Upload className="mx-auto size-5 text-slate-400" aria-hidden />
        <p className="mt-1 text-sm text-slate-700">Drop two care plans here (.txt or .md)</p>
        <div className="mt-2 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
          >
            Choose files
          </button>
          <button
            type="button"
            onClick={() => void upload(SAMPLE_PLANS)}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
          >
            Use sample plans
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".txt,.md"
          multiple
          className="sr-only"
          aria-label="Choose care plan files"
          onChange={(e) => {
            if (e.target.files) void onFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      )}

      {actionError && (
        <p role="alert" className="rounded-md border border-danger-600/30 bg-danger-50 p-2.5 text-xs text-danger-700">
          {actionError}
        </p>
      )}

      <section aria-label="Care plans">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Care plans ({plans.length}){CAN_UPLOAD_CARE_PLANS && ' · select two to compare'}
        </p>
        <ul className="space-y-1.5">
          {plans.map((plan) => {
            const author = people.find((p) => p.id === plan.author_person_id)
            return (
              <li key={plan.id}>
                <label
                  className={`flex items-start gap-2 rounded-md border p-2 text-sm ${
                    selected.includes(plan.id) ? 'border-navy-600 bg-navy-50' : 'border-slate-200 bg-white'
                  } ${plan.is_redacted ? 'opacity-70' : 'cursor-pointer'}`}
                >
                  {CAN_UPLOAD_CARE_PLANS && (
                    <input
                      type="checkbox"
                      className="mt-1"
                      disabled={plan.is_redacted}
                      checked={selected.includes(plan.id)}
                      onChange={() => toggle(plan.id)}
                    />
                  )}
                  {plan.is_redacted ? (
                    <Lock className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
                  ) : (
                    <FileText className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
                  )}
                  <span className="min-w-0">
                    <span className={`block ${plan.is_redacted ? 'italic text-slate-500' : 'font-medium text-slate-900'}`}>
                      {plan.title}
                    </span>
                    {!plan.is_redacted && author && (
                      <span className="block text-xs text-slate-500">{author.full_name}</span>
                    )}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </section>

      {CAN_UPLOAD_CARE_PLANS && (
        <button
          type="button"
          disabled={selected.length !== 2 || analyzing}
          onClick={() => void review()}
          className="w-full rounded-md bg-navy-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
        >
          Review for conflicts
        </button>
      )}

      {analyzing && (
        <div role="status" className="space-y-2 rounded-lg border border-slate-200 p-3">
          <p className="text-sm text-slate-700">AI intersecting care plans…</p>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      )}

      {!analyzing && reviewed && conflicts.length === 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-ok-600/30 bg-ok-50 p-3 text-sm text-ok-700">
          <CircleCheck className="size-4 shrink-0" aria-hidden /> No conflicts found between these plans.
        </p>
      )}
      {conflicts.length > 0 && (
        <ul className="space-y-3">
          {conflicts.map((gap) => (
            <ConflictCard key={gap.id} gap={gap} />
          ))}
        </ul>
      )}
    </div>
  )
}
