"use client"

import { useEffect, useRef, useState } from "react"
import { Sparkles, Loader2, Clock, ListChecks, Package, CreditCard } from "lucide-react"
import { getTaskSuggestions, type TaskSuggestions } from "@/lib/ops-ai"
import { useCompanyWorkspace } from "@/contexts/CompanyWorkspaceContext"

/**
 * AI job setup assist — uses /api/ai/task-suggestions (company AI config).
 */
export default function TaskSuggestionsPanel({
  taskId,
  propertyId,
  title,
  description,
  scheduledDate,
  onApplyChecklist,
  billingHref = "billing",
}: {
  taskId?: number
  propertyId?: number
  title?: string
  description?: string
  scheduledDate?: string
  onApplyChecklist?: (items: string[]) => void
  billingHref?: string
}) {
  const { href: wsHref } = useCompanyWorkspace()
  const [loading, setLoading] = useState(false)
  const [upsell, setUpsell] = useState(false)
  const [error, setError] = useState("")
  const [data, setData] = useState<TaskSuggestions | null>(null)
  const lastKey = useRef("")

  const billingLink = billingHref.startsWith("/") ? billingHref : wsHref(billingHref)

  const run = async () => {
    if (!propertyId && !taskId) {
      setError("Select a property first")
      return
    }
    try {
      setLoading(true)
      setError("")
      setUpsell(false)
      const res = await getTaskSuggestions({
        taskId,
        propertyId,
        title,
        description,
        scheduledDate,
      })
      if (!res) {
        setUpsell(true)
        setData(null)
        return
      }
      setData(res)
    } catch (e: any) {
      if (e?.response?.status === 403) {
        setUpsell(true)
        setData(null)
      } else {
        setError("AI suggestions failed — try again")
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!propertyId && !taskId) return
    const key = `${taskId || 0}:${propertyId || 0}`
    if (key === lastKey.current) return
    lastKey.current = key
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, propertyId])

  return (
    <div className="rounded-xl border border-navy-200 bg-gradient-to-br from-slate-50 to-white p-4 dark:border-navy-800 dark:from-navy-950 dark:to-navy-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-navy-700 dark:text-amber-400">
            <Sparkles size={12} /> AI job setup
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Checklist, time estimate & supplies from your AI config
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-navy-950 px-3 text-[10px] font-bold uppercase text-amber-300 hover:bg-navy-900 disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {data ? "Refresh" : "Suggest"}
        </button>
      </div>

      {upsell && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-100/80 p-3 dark:border-amber-700 dark:bg-amber-950/40">
          <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
            Task suggestions need a plan upgrade
          </p>
          <a
            href={billingLink}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-700"
          >
            <CreditCard size={12} /> View billing
          </a>
        </div>
      )}

      {error && !upsell && <p className="mt-3 text-xs font-semibold text-red-600">{error}</p>}

      {loading && !data && (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
          <Loader2 size={14} className="animate-spin text-amber-600" /> Building suggestions…
        </div>
      )}

      {data && (
        <div className="mt-3 space-y-3">
          {data.propertySummary && (
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {data.propertySummary}
            </p>
          )}
          {data.estimatedMinutes != null && (
            <p className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 font-mono text-[10px] font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <Clock size={11} /> ~{data.estimatedMinutes} min
            </p>
          )}
          {data.checklist?.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1 font-mono text-[9px] font-bold uppercase text-slate-400">
                <ListChecks size={10} /> Checklist
              </p>
              <ul className="space-y-1">
                {data.checklist.slice(0, 8).map((item, i) => (
                  <li
                    key={`${i}-${item.slice(0, 20)}`}
                    className="rounded-md border border-slate-100 bg-white px-2.5 py-1.5 text-[11px] text-slate-700 dark:border-navy-800 dark:bg-navy-900 dark:text-slate-200"
                  >
                    {item}
                  </li>
                ))}
              </ul>
              {onApplyChecklist && (
                <button
                  type="button"
                  onClick={() => onApplyChecklist(data.checklist)}
                  className="mt-2 text-[11px] font-bold text-amber-700 hover:text-amber-800"
                >
                  Apply checklist to notes
                </button>
              )}
            </div>
          )}
          {data.supplies?.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1 font-mono text-[9px] font-bold uppercase text-slate-400">
                <Package size={10} /> Supplies
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {data.supplies.slice(0, 6).map((s) => (
                  <li
                    key={s.supplyItemId}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-navy-700 dark:bg-navy-900 dark:text-slate-300"
                    title={s.reason}
                  >
                    {s.name} · {s.quantity}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!data.aiGenerated && (
            <p className="font-mono text-[9px] uppercase text-slate-400">
              Rules fallback · AI assist offline
            </p>
          )}
        </div>
      )}
    </div>
  )
}
