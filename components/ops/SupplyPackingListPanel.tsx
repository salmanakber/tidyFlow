"use client"

/**
 * Job packing list — predicted supplies for a task (mobile parity).
 */
import { useCallback, useEffect, useState } from "react"
import axios from "axios"
import { ChevronDown, ChevronUp, Loader2, PackageCheck, AlertTriangle, ShoppingBag } from "lucide-react"

type PackingItem = {
  supplyItemId: number
  name: string
  unit: string
  bringQuantity: number
  currentStock: number
  reason?: string
  inStock: boolean
}

type PackingList = {
  taskId: number
  taskTitle?: string
  propertyAddress?: string | null
  propertyType?: string | null
  unitCount?: number
  items: PackingItem[]
  totalItems: number
  missingFromStock: number
}

function authHeaders() {
  const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
  return { Authorization: `Bearer ${token}` }
}

export default function SupplyPackingListPanel({
  taskId,
  onLogged,
}: {
  taskId: number
  onLogged?: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [logging, setLogging] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [data, setData] = useState<PackingList | null>(null)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")

  const load = useCallback(async () => {
    if (!taskId) return
    setLoading(true)
    setError("")
    try {
      const res = await axios.get("/api/supplies/packing-list", {
        headers: authHeaders(),
        params: { taskId },
      })
      if (res.data?.success) setData(res.data.data)
      else {
        setData(null)
        setError(res.data?.message || "Could not build packing list")
      }
    } catch (e: any) {
      setData(null)
      setError(e.response?.data?.message || "Could not build packing list")
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    load()
  }, [load])

  const logAll = async () => {
    if (!data?.items?.length) return
    setLogging(true)
    setError("")
    try {
      for (const item of data.items) {
        if (item.bringQuantity > 0 && item.inStock) {
          await axios.post(
            "/api/supplies/usage",
            {
              supplyItemId: item.supplyItemId,
              quantity: item.bringQuantity,
              taskId: data.taskId,
            },
            { headers: authHeaders() }
          )
        }
      }
      setToast("Packing list logged to inventory")
      onLogged?.()
      await load()
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to log packing list")
    } finally {
      setLogging(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-control-border bg-white px-4 py-5 dark:border-amber-900/40 dark:bg-control-darkCard">
        <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
        <p className="text-sm text-slate-500">Building packing list…</p>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
        {error}
      </div>
    )
  }

  if (!data || !data.items?.length) return null

  return (
    <section className="overflow-hidden rounded-2xl border border-control-border bg-white shadow-sm dark:border-amber-900/40 dark:bg-control-darkCard">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50/80 dark:hover:bg-navy-950/40"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-900 text-amber-300">
          <ShoppingBag size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-navy-900 dark:text-white">What to bring</p>
          <p className="truncate text-xs text-slate-500">
            {data.totalItems} predicted item{data.totalItems === 1 ? "" : "s"}
            {data.taskTitle ? ` · ${data.taskTitle}` : ""}
            {data.propertyAddress ? ` · ${data.propertyAddress}` : ""}
          </p>
        </div>
        {expanded ? (
          <ChevronUp size={16} className="text-slate-400" />
        ) : (
          <ChevronDown size={16} className="text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-2 dark:border-navy-800">
          {data.missingFromStock > 0 && (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                {data.missingFromStock} item{data.missingFromStock === 1 ? "" : "s"} below needed stock —
                restock before the job.
              </span>
            </div>
          )}

          {toast && (
            <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              {toast}
            </p>
          )}
          {error && (
            <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              {error}
            </p>
          )}

          <ul className="space-y-2">
            {data.items.map((item) => (
              <li
                key={item.supplyItemId}
                className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 dark:border-navy-800 dark:bg-navy-950/40"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-navy-900 dark:text-white">{item.name}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Bring <span className="font-semibold text-navy-800 dark:text-slate-200">{item.bringQuantity}</span>{" "}
                    {item.unit}
                    {" · "}
                    Stock {item.currentStock}
                    {!item.inStock ? (
                      <span className="ml-1 font-bold uppercase text-rose-600"> · short</span>
                    ) : null}
                  </p>
                  {item.reason ? (
                    <p className="mt-1 text-[11px] italic text-slate-400">{item.reason}</p>
                  ) : null}
                </div>
                <PackageCheck
                  size={16}
                  className={item.inStock ? "text-emerald-600" : "text-rose-500"}
                />
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={logAll}
            disabled={logging}
            className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-navy-900 text-xs font-bold text-amber-300 hover:bg-navy-800 disabled:opacity-50"
          >
            {logging ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />}
            Log packing list to inventory
          </button>
        </div>
      )}
    </section>
  )
}
