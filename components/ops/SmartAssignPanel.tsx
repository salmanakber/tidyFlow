"use client"

import { useState } from "react"
import { Sparkles, Loader2, Star, MapPin, Check, CreditCard } from "lucide-react"
import {
  getCleanerRecommendations,
  type AssignmentRecommendations,
  type CleanerRecommendation,
} from "@/lib/ops-ai"
import { useCompanyWorkspace } from "@/contexts/CompanyWorkspaceContext"

export default function SmartAssignPanel({
  taskId,
  propertyId,
  scheduledDate,
  selectedUserId,
  onSelect,
  billingHref = "billing",
}: {
  taskId?: number
  propertyId?: number
  scheduledDate?: string
  selectedUserId?: string
  onSelect: (userId: number, name: string) => void
  /** Relative page key or absolute path; defaults to company/admin billing */
  billingHref?: string
}) {
  const { href: wsHref } = useCompanyWorkspace()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [upsell, setUpsell] = useState(false)
  const [data, setData] = useState<AssignmentRecommendations | null>(null)

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

  const rows: CleanerRecommendation[] = []
  if (data?.recommended) rows.push(data.recommended)
  for (const a of data?.alternatives || []) {
    if (!rows.some((r) => r.userId === a.userId)) rows.push(a)
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 dark:border-amber-900/50 dark:from-amber-950/20 dark:to-navy-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700">
            <Sparkles size={12} /> Smart scheduling
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            AI ranks cleaners by distance, quality, and availability — same engine as mobile.
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

      {rows.length > 0 && (
        <ul className="mt-3 space-y-2">
          {rows.map((r, idx) => {
            const selected = selectedUserId === String(r.userId)
            const isTop = idx === 0 && data?.recommended?.userId === r.userId
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
                        {isTop && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-amber-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                            <Star size={9} /> Best match
                          </span>
                        )}
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
                            <MapPin size={9} /> {Number(r.distance).toFixed(1)} km
                          </span>
                        )}
                        {r.qualityScore != null && <span>QA {Number(r.qualityScore).toFixed(0)}</span>}
                        {r.tasksCompleted != null && <span>{r.tasksCompleted} jobs</span>}
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
