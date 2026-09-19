"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import axios from "axios"
import { AlertTriangle, MapPin, ShieldAlert, X } from "lucide-react"
import { useCompanyWorkspace } from "@/contexts/CompanyWorkspaceContext"
import { fetchLiveCleaners } from "@/lib/ops-tracking"
import { useInterval } from "@/hooks/useOpsRealtime"

function authHeaders() {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function OpsCriticalBanner() {
  const { href } = useCompanyWorkspace()
  const [sosCount, setSosCount] = useState(0)
  const [offSiteCount, setOffSiteCount] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  const load = useCallback(async () => {
    try {
      const [sosRes, cleaners] = await Promise.all([
        axios
          .get("/api/safety/sos", {
            headers: authHeaders(),
            params: { status: "active" },
          })
          .catch(() => null),
        fetchLiveCleaners().catch(() => []),
      ])
      const sosList =
        sosRes?.data?.data?.alerts ||
        sosRes?.data?.data ||
        sosRes?.data?.alerts ||
        []
      setSosCount(Array.isArray(sosList) ? sosList.length : 0)
      const off = (cleaners || []).filter((c: any) => c.withinGeofence === false).length
      setOffSiteCount(off)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useInterval(() => {
    void load()
  }, 30000, true)

  useEffect(() => {
    if (sosCount > 0 || offSiteCount > 0) setDismissed(false)
  }, [sosCount, offSiteCount])

  if (dismissed) return null
  if (sosCount <= 0 && offSiteCount <= 0) return null

  const critical = sosCount > 0

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
        critical
          ? "border-navy-800 bg-navy-950 text-white"
          : "border-amber-300 bg-amber-50 text-navy-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-50"
      }`}
      role="alert"
    >
      <div className="flex min-w-0 items-start gap-3">
        {critical ? (
          <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
        ) : (
          <MapPin className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700 dark:text-amber-400" />
        )}
        <div className="min-w-0">
          <p className={`text-sm font-bold ${critical ? "text-amber-400" : ""}`}>
            {critical ? "SOS ACTIVE" : "Geofence alert"}
          </p>
          <p className={`mt-0.5 text-xs ${critical ? "text-slate-300" : "text-amber-900/80 dark:text-amber-100/80"}`}>
            {sosCount > 0 && (
              <span>
                {sosCount} SOS alert{sosCount === 1 ? "" : "s"} need attention
                {offSiteCount > 0 ? " · " : ""}
              </span>
            )}
            {offSiteCount > 0 && (
              <span>
                {offSiteCount} cleaner{offSiteCount === 1 ? "" : "s"} flagged off-site
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {sosCount > 0 && (
          <Link
            href={`${href("safety")}?tab=sos`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-navy-950 hover:bg-amber-400"
          >
            <AlertTriangle size={12} /> Open Safety
          </Link>
        )}
        {offSiteCount > 0 && (
          <Link
            href={href("monitor")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${
              critical
                ? "border border-white/20 bg-white/10 text-white hover:bg-white/15"
                : "bg-navy-900 text-white hover:bg-navy-800 dark:bg-amber-600 dark:text-navy-950"
            }`}
          >
            Live monitor
          </Link>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className={`rounded-lg p-1.5 ${critical ? "text-slate-400 hover:bg-white/10" : "text-amber-800/60 hover:bg-amber-100 dark:text-amber-200/60"}`}
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
