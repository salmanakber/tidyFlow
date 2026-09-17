"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import {
  OpsPageHeader,
  OpsCard,
  OpsRefreshButton,
  OpsFlash,
  OpsPrimaryButton,
} from "@/components/ops/OpsChrome"
import { useCompanyWorkspace } from "@/contexts/CompanyWorkspaceContext"
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  Sheet,
  ArrowRight,
  Loader2,
} from "lucide-react"

export default function IntegrationsPage() {
  const { href: wsHref } = useCompanyWorkspace()
  const [qb, setQb] = useState<any>(null)
  const [sheets, setSheets] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [qbWorking, setQbWorking] = useState(false)

  const headers = () => ({
    Authorization: `Bearer ${localStorage.getItem("authToken") || sessionStorage.getItem("authToken")}`,
  })

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const [qbRes, sheetRes] = await Promise.all([
        axios.get("/api/integrations/quickbooks", { headers: headers() }).catch(() => null),
        axios.get("/api/company/google-sheet", { headers: headers() }).catch(() => null),
      ])
      if (qbRes?.data?.success) setQb(qbRes.data.data)
      else if (qbRes?.data) setQb(qbRes.data.data || qbRes.data)
      else setQb(null)

      if (sheetRes?.data?.success) setSheets(sheetRes.data.data)
      else setSheets(null)
    } catch (e: any) {
      setError(e.response?.data?.message || "Could not load integrations")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const connectQb = async () => {
    try {
      setQbWorking(true)
      const redirect =
        typeof window !== "undefined"
          ? `${window.location.origin}${window.location.pathname}`
          : ""
      const res = await axios.get("/api/integrations/quickbooks/connect", {
        headers: headers(),
        params: redirect ? { redirect } : {},
      })
      const url =
        res.data?.data?.url ||
        res.data?.url ||
        res.data?.data?.authorizeUrl ||
        res.data?.data?.authUrl
      if (url) window.location.href = url
      else setError("Connect URL not available")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to start QuickBooks connect")
    } finally {
      setQbWorking(false)
    }
  }

  const disconnectQb = async () => {
    if (!confirm("Disconnect QuickBooks?")) return
    try {
      await axios.delete("/api/integrations/quickbooks", { headers: headers() })
      setToast("QuickBooks disconnected")
      await load()
    } catch (e: any) {
      setError(e.response?.data?.message || "Disconnect failed")
    }
  }

  const qbConnected = !!(qb?.connected || qb?.isConnected || qb?.realmId || qb?.companyName)
  const sheetsConnected = !!(sheets?.connected || sheets?.connection)

  return (
    <AdminLayout>
      <div className="space-y-5">
        <OpsPageHeader
          eyebrow="Finance"
          title="Integrations"
          subtitle="Connect accounting and spreadsheet tools for your company"
          actions={<OpsRefreshButton onClick={load} loading={loading} />}
        />
        {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
        {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

        <OpsCard>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2CA01C]/10 font-black text-[#2CA01C]">
                QB
              </div>
              <div>
                <h2 className="text-base font-bold text-navy-900 dark:text-white">
                  QuickBooks Online
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Sync payroll vendors and client invoices with QuickBooks.
                </p>
                {qb?.companyName && (
                  <p className="mt-1 text-xs font-medium text-slate-400">{qb.companyName}</p>
                )}
                <div className="mt-2 flex items-center gap-1.5 text-xs font-bold">
                  {qbConnected ? (
                    <>
                      <CheckCircle2 size={14} className="text-emerald-600" />
                      <span className="text-emerald-700">Connected</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={14} className="text-slate-400" />
                      <span className="text-slate-500">Not connected</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {qbConnected ? (
                <button
                  onClick={disconnectQb}
                  className="h-9 rounded-lg border border-red-200 px-3 text-xs font-bold text-red-600 hover:bg-red-50"
                >
                  Disconnect
                </button>
              ) : (
                <OpsPrimaryButton onClick={connectQb} disabled={loading || qbWorking}>
                  {qbWorking ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                  Connect QuickBooks
                </OpsPrimaryButton>
              )}
            </div>
          </div>
        </OpsCard>

        <OpsCard>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <Sheet size={22} />
              </div>
              <div>
                <h2 className="text-base font-bold text-navy-900 dark:text-white">Google Sheets</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Connect your master Properties + Tasks workbook. Verify tabs, sync on demand, and
                  manage the service account from the control center.
                </p>
                {sheets?.connection?.propertiesTab && (
                  <p className="mt-1 font-mono text-[11px] text-slate-400">
                    {sheets.connection.propertiesTab} · {sheets.connection.tasksTab}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-1.5 text-xs font-bold">
                  {sheetsConnected ? (
                    <>
                      <CheckCircle2 size={14} className="text-emerald-600" />
                      <span className="text-emerald-700">Connected</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={14} className="text-slate-400" />
                      <span className="text-slate-500">Not connected</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <Link
              href={wsHref("sheets")}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 text-xs font-bold text-white shadow-amber-glow hover:bg-amber-700"
            >
              {sheetsConnected ? "Manage sheets" : "Connect sheet"} <ArrowRight size={14} />
            </Link>
          </div>
        </OpsCard>
      </div>
    </AdminLayout>
  )
}
