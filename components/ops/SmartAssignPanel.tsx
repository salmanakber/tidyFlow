"use client"

import { useEffect, useRef, useState } from "react"
import { Sparkles, Loader2, Star, MapPin, Check, CreditCard, Zap } from "lucide-react"
import {
  getCleanerRecommendations,
  type AssignmentRecommendations,
  type CleanerRecommendation,
} from "@/lib/ops-ai"
import { useCompanyWorkspace } from "@/contexts/CompanyWorkspaceContext"

function formatMetersLabel(meters: number) {
  if (meters < 1000) return `${Math.round(meters)}m`
  return `${(meters / 1000).toFixed(1)}km`
}

export default function SmartAssignPanel({
  taskId,
  propertyId,
  scheduledDate,
  selectedUserId,
  onSelect,
  billingHref = "billing",
  /** Auto-fetch suggestions when property/task is ready */
  autoSuggest = true,
}: {
  taskId?: number
  propertyId?: number
  scheduledDate?: string
  selectedUserId?: string
  onSelect: (userId: number, name: string) => void
  billingHref?: string
  autoSuggest?: boolean
}) {
  const { href: wsHref } = useCompanyWorkspace()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [upsell, setUpsell] = useState(false)
  const [data, setData] = useState<AssignmentRecommendations | null>(null)
  const lastKey = useRef("")

  const billingLink = billingHref.startsWith("/")
    ? billingHref
    : wsHref(billingHref)

  const run = async () => {
    if (!propertyId && !taskId) {
      setError("Select a property first")
      return
    }
    try {
      setLoading(true)
      setError("")
      setUpsell(false)
      const res = await getCleanerRecommendations({
        taskId,
        propertyId,
        scheduledDate,
      })
      if (!res) {
        setUpsell(true)
        setData(null)
        return
      }
      if (!res.recommended && !(res.alternatives?.length > 0)) {
        setError(
          "No recommendations available — check AI assignment is enabled on your plan, or try again."
        )
        setData(null)
        return
      }
      setData(res)
      // Prefer best match into the form immediately (manager can still change)
      if (res.recommended && !selectedUserId) {
        onSelect(res.recommended.userId, res.recommended.name)
      }
    } catch (e: any) {
      if (e?.response?.status === 403) {
        setUpsell(true)
        setData(null)
      } else {
        setError("AI recommend failed — try again")
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!autoSuggest) return
    if (!propertyId && !taskId) return
    const key = `${taskId || 0}:${propertyId || 0}:${scheduledDate || ""}`
    if (key === lastKey.current) return
    lastKey.current = key
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSuggest, taskId, propertyId, scheduledDate])

  const rows: CleanerRecommendation[] = []
  if (data?.recommended) rows.push(data.recommended)
  for (const a of data?.alternatives || []) {
    if (!rows.some((r) => r.userId === a.userId)) rows.push(a)
  }

  const best = data?.recommended

  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 dark:border-amber-900/50 dark:from-amber-950/20 dark:to-navy-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700">
            <Sparkles size={12} /> Smart assign
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Best fit by distance, quality & availability — confirm or pick another.
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
            Smart assign needs a plan upgrade
          </p>
          <p className="mt-1 text-[11px] text-amber-800/90 dark:text-amber-300/80">
            AI cleaner recommendations aren’t available on your current plan. Upgrade billing to unlock
            smart scheduling.
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
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-amber-200 bg-white/60 px-3 py-4 dark:border-amber-900/40 dark:bg-navy-950/40">
          <Loader2 size={14} className="animate-spin text-amber-600" />
          <p className="text-xs font-medium text-slate-500">Ranking cleaners…</p>
        </div>
      )}

      {best && (
        <div className="mt-3 overflow-hidden rounded-lg border-2 border-amber-500 bg-white shadow-sm dark:bg-navy-950">
          <div className="flex items-center justify-between gap-2 bg-amber-600 px-3 py-1.5">
            <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase text-white">
              <Star size={11} /> Best match
            </span>
            <span className="font-mono text-[10px] font-bold text-amber-100">
              Score {Math.round(best.score)}
            </span>
          </div>
          <div className="p-3">
            <p className="text-sm font-bold text-navy-900 dark:text-white">{best.name}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
              {best.reason || "Top ranked for this slot"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 font-mono text-[10px] text-slate-400">
              {best.distance != null && (
                <span className="inline-flex items-center gap-0.5">
                  <MapPin size={9} /> {formatMetersLabel(Number(best.distance))}
                </span>
              )}
              {best.qualityScore != null && (
                <span>QA {Number(best.qualityScore).toFixed(0)}</span>
              )}
              {best.tasksCompleted != null && <span>{best.tasksCompleted} jobs</span>}
            </div>
            <button
              type="button"
              onClick={() => onSelect(best.userId, best.name)}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-600 py-2 text-[11px] font-bold uppercase tracking-wide text-white hover:bg-amber-700"
            >
              <Zap size={13} />
              {selectedUserId === String(best.userId) ? "Best match selected" : "Use best match"}
            </button>
          </div>
        </div>
      )}

      {rows.length > 1 && (
        <ul className="mt-3 space-y-2">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-400">
            Alternatives
          </p>
          {rows.slice(1).map((r) => {
            const selected = selectedUserId === String(r.userId)
            return (
              <li key={r.userId}>
                <button
                  type="button"
                  onClick={() => onSelect(r.userId, r.name)}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    selected
                      ? "border-amber-600 bg-amber-100/80 ring-1 ring-amber-600/30"
                      : "border-slate-200 bg-white hover:border-amber-400 dark:border-navy-800 dark:bg-navy-950"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-navy-900 dark:text-white">
                          {r.name}
                        </span>
                        {selected && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600">
                            <Check size={10} /> Selected
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">{r.reason}</p>
                      <div className="mt-1.5 flex flex-wrap gap-2 font-mono text-[10px] text-slate-400">
                        <span>Score {Math.round(r.score)}</span>
                        {r.distance != null && (
                          <span className="inline-flex items-center gap-0.5">
                            <MapPin size={9} /> {formatMetersLabel(Number(r.distance))}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {data && !data.aiGenerated && rows.length > 0 && (
        <p className="mt-2 font-mono text-[9px] uppercase text-slate-400">
          Ranked by rules · AI assist offline
        </p>
      )}
    </div>
  )
}
