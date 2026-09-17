"use client"

/**
 * Owner/Manager Google Sheets control center — desktop-grade
 * Connect · verify · map tabs · sync · disconnect (mobile parity + more control)
 */
import { useEffect, useMemo, useState } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import {
  OpsPageHeader,
  OpsCard,
  OpsKpi,
  OpsRefreshButton,
  OpsPrimaryButton,
  OpsFlash,
  OpsEmpty,
  OpsTableShell,
  opsTh,
  opsTd,
} from "@/components/ops/OpsChrome"
import {
  CheckCircle2,
  XCircle,
  Copy,
  RefreshCw,
  Unplug,
  Link2,
  Sheet,
  Loader2,
  ExternalLink,
  ShieldAlert,
} from "lucide-react"
import { formatDate } from "@/lib/admin-session"

function authHeaders() {
  const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
  return { Authorization: `Bearer ${token}` }
}

function companyId() {
  const id = localStorage.getItem("selectedCompanyId")
  return id ? parseInt(id, 10) : null
}

export default function SheetsSyncPage() {
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [connected, setConnected] = useState(false)
  const [connection, setConnection] = useState<any>(null)
  const [serviceAccountEmail, setServiceAccountEmail] = useState("")
  const [configured, setConfigured] = useState(true)
  const [template, setTemplate] = useState<any>(null)
  const [planBlocked, setPlanBlocked] = useState(false)

  // Connect wizard
  const [sheetUrl, setSheetUrl] = useState("")
  const [verifyData, setVerifyData] = useState<any>(null)
  const [propertiesTab, setPropertiesTab] = useState("")
  const [tasksTab, setTasksTab] = useState("")
  const [lastSyncResult, setLastSyncResult] = useState<any>(null)
  const [step, setStep] = useState<"status" | "connect">("status")

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      // Plan gate (optional — don't block UI hard if endpoint missing)
      try {
        const plan = await axios.get("/api/subscription/status", { headers: authHeaders() })
        const features =
          plan.data?.data?.features ||
          plan.data?.data?.plan?.features ||
          plan.data?.data?.subscription?.features
        if (features && features.googleSheets === false) setPlanBlocked(true)
        else setPlanBlocked(false)
      } catch {
        /* ignore */
      }

      const res = await axios.get("/api/company/google-sheet", { headers: authHeaders() })
      if (res.data?.success) {
        const d = res.data.data
        setConnected(!!d.connected)
        setConnection(d.connection || null)
        setServiceAccountEmail(d.serviceAccountEmail || "")
        setConfigured(d.configured !== false)
        setTemplate(d.template || null)
        if (d.connected) setStep("status")
      } else {
        setError(res.data?.message || "Failed to load sheet status")
      }
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load Google Sheets status")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const tabs = useMemo(() => {
    const sheets = verifyData?.sheets || verifyData?.tabs || []
    return Array.isArray(sheets) ? sheets.map((s: any) => (typeof s === "string" ? s : s.title || s.name)) : []
  }, [verifyData])

  const copyEmail = async () => {
    if (!serviceAccountEmail) return
    try {
      await navigator.clipboard.writeText(serviceAccountEmail)
      setToast("Service account email copied")
    } catch {
      setError("Could not copy to clipboard")
    }
  }

  const verify = async () => {
    if (!sheetUrl.trim()) {
      setError("Paste your Google Sheet URL first")
      return
    }
    try {
      setWorking(true)
      setError("")
      const res = await axios.post(
        "/api/company/google-sheet/verify",
        { sheetUrl: sheetUrl.trim() },
        { headers: authHeaders() }
      )
      if (res.data?.success) {
        const d = res.data.data
        setVerifyData(d)
        setPropertiesTab(d.propertiesTab || template?.propertiesTab || "Properties")
        setTasksTab(d.tasksTab || template?.tasksTab || "Tasks")
        setToast("Sheet verified — pick Properties & Tasks tabs")
      } else {
        setError(res.data?.message || "Verification failed")
      }
    } catch (e: any) {
      setError(e.response?.data?.message || "Verification failed — share the sheet with the service account")
    } finally {
      setWorking(false)
    }
  }

  const connect = async () => {
    const cid = companyId()
    if (!cid) {
      setError("No company selected")
      return
    }
    if (!sheetUrl.trim() || !propertiesTab || !tasksTab) {
      setError("Sheet URL, Properties tab, and Tasks tab are required")
      return
    }
    try {
      setWorking(true)
      setError("")
      const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
      const spreadsheetId = match?.[1] || verifyData?.spreadsheetId
      const res = await axios.post(
        `/api/companies/${cid}/task-sheet/sync`,
        {
          templateMode: true,
          spreadsheetId,
          sheetUrl: sheetUrl.trim(),
          propertiesTab,
          tasksTab,
        },
        { headers: authHeaders() }
      )
      if (res.data?.success) {
        setLastSyncResult(res.data.data?.importResult || res.data.data)
        setToast(res.data.message || "Master sheet connected and synced")
        setStep("status")
        setVerifyData(null)
        await load()
      } else {
        setError(res.data?.message || "Connect failed")
      }
    } catch (e: any) {
      setError(e.response?.data?.message || "Connect failed")
    } finally {
      setWorking(false)
    }
  }

  const syncNow = async () => {
    try {
      setWorking(true)
      setError("")
      const cid = companyId()
      let res
      if (cid) {
        res = await axios.post(
          `/api/companies/${cid}/task-sheet/sync`,
          { syncOnly: true },
          { headers: authHeaders() }
        )
      } else {
        res = await axios.post("/api/company/google-sheet/sync", {}, { headers: authHeaders() })
      }
      if (res.data?.success) {
        setLastSyncResult(res.data.data?.importResult || res.data.data)
        setToast("Sync completed")
        await load()
      } else {
        setError(res.data?.message || "Sync failed")
      }
    } catch (e: any) {
      setError(e.response?.data?.message || "Sync failed")
    } finally {
      setWorking(false)
    }
  }

  const disconnect = async () => {
    if (!confirm("Disconnect this Google Sheet from your company?")) return
    try {
      setWorking(true)
      await axios.delete("/api/company/google-sheet", { headers: authHeaders() })
      setToast("Google Sheet disconnected")
      setLastSyncResult(null)
      setConnection(null)
      setConnected(false)
      setStep("connect")
      await load()
    } catch (e: any) {
      setError(e.response?.data?.message || "Disconnect failed")
    } finally {
      setWorking(false)
    }
  }

  const openSheet = () => {
    const url = connection?.sheetUrl || connection?.googleSheetUrl || sheetUrl
    if (url) window.open(url, "_blank")
  }

  return (
    <AdminLayout>
      <div className="space-y-5">
        <OpsPageHeader
          eyebrow="Integrations"
          title="Google Sheets sync"
          subtitle="Connect your master workbook — properties & tasks sync both ways"
          actions={
            <>
              <OpsRefreshButton onClick={load} loading={loading || working} />
              {connected && (
                <OpsPrimaryButton onClick={syncNow} disabled={working || planBlocked}>
                  {working ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Sync now
                </OpsPrimaryButton>
              )}
            </>
          }
        />

        {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
        {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

        {planBlocked && (
          <section className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <ShieldAlert className="mt-0.5 shrink-0 text-amber-600" size={18} />
            <div>
              <p className="text-sm font-bold">Google Sheets is not on your current plan</p>
              <p className="mt-1 text-xs text-amber-800/80">
                Upgrade billing to unlock spreadsheet sync for properties and tasks.
              </p>
            </div>
          </section>
        )}

        {!configured && (
          <OpsFlash
            ok={false}
            text="Google Sheets service is not configured on the server. Contact TidyFlow support."
            onClose={() => {}}
          />
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <OpsKpi
            label="Connection"
            value={connected ? "Live" : "Off"}
            hint={connected ? "Master sheet linked" : "Not connected"}
          />
          <OpsKpi
            label="Properties tab"
            value={connection?.propertiesTab || "—"}
          />
          <OpsKpi label="Tasks tab" value={connection?.tasksTab || "—"} />
          <OpsKpi
            label="Last sync"
            value={
              connection?.lastSyncedAt
                ? formatDate(connection.lastSyncedAt)
                : "Never"
            }
          />
        </div>

        {/* Status card */}
        <OpsCard>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <Sheet size={22} />
              </div>
              <div>
                <h2 className="text-base font-bold text-navy-900 dark:text-white">
                  Company master spreadsheet
                </h2>
                <p className="mt-1 max-w-xl text-sm text-slate-500">
                  Share your workbook with the TidyFlow service account, then connect. Use the
                  official Properties + Tasks tab layout for best results.
                </p>
                <div className="mt-2 flex items-center gap-1.5 text-xs font-bold">
                  {connected ? (
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
            <div className="flex flex-wrap gap-2">
              {connected ? (
                <>
                  <button
                    type="button"
                    onClick={openSheet}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-control-border px-3 text-xs font-bold hover:border-amber-600"
                  >
                    <ExternalLink size={14} /> Open sheet
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("connect")
                      setSheetUrl(connection?.sheetUrl || "")
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-control-border px-3 text-xs font-bold hover:border-amber-600"
                  >
                    <Link2 size={14} /> Reconfigure
                  </button>
                  <button
                    type="button"
                    onClick={disconnect}
                    disabled={working}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-bold text-red-600 hover:bg-red-50"
                  >
                    <Unplug size={14} /> Disconnect
                  </button>
                </>
              ) : (
                <OpsPrimaryButton
                  onClick={() => setStep("connect")}
                  disabled={planBlocked || !configured}
                >
                  <Link2 size={14} /> Connect Google Sheet
                </OpsPrimaryButton>
              )}
            </div>
          </div>

          {serviceAccountEmail && (
            <div className="mt-4 rounded-lg border border-control-border bg-slate-50 p-3 dark:border-navy-800 dark:bg-navy-950">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Share sheet with this service account (Editor)
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <code className="flex-1 truncate font-mono text-xs text-navy-900 dark:text-amber-300">
                  {serviceAccountEmail}
                </code>
                <button
                  type="button"
                  onClick={copyEmail}
                  className="rounded-lg border border-slate-200 p-1.5 hover:bg-white dark:border-navy-700"
                  title="Copy"
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>
          )}
        </OpsCard>

        {/* Connect wizard */}
        {step === "connect" && !planBlocked && (
          <OpsCard>
            <h3 className="text-sm font-bold text-navy-900 dark:text-white">Connect wizard</h3>
            <p className="mt-1 text-xs text-slate-500">
              1) Share the sheet with the service account → 2) Paste URL → 3) Verify → 4) Confirm tabs
            </p>

            <div className="mt-4 space-y-4">
              <label className="block space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Google Sheet URL
                </span>
                <input
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-amber-600 focus:outline-none dark:border-navy-800 dark:bg-navy-950"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <OpsPrimaryButton onClick={verify} disabled={working}>
                  {working ? <Loader2 size={14} className="animate-spin" /> : null}
                  Verify sheet
                </OpsPrimaryButton>
                {connected && (
                  <button
                    type="button"
                    onClick={() => setStep("status")}
                    className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {verifyData && (
                <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50/40 p-4 md:grid-cols-2">
                  <label className="space-y-1.5 text-xs font-semibold">
                    Properties tab
                    <select
                      value={propertiesTab}
                      onChange={(e) => setPropertiesTab(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                    >
                      {(tabs.length ? tabs : [propertiesTab || "Properties"]).map((t: string) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1.5 text-xs font-semibold">
                    Tasks tab
                    <select
                      value={tasksTab}
                      onChange={(e) => setTasksTab(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                    >
                      {(tabs.length ? tabs : [tasksTab || "Tasks"]).map((t: string) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="md:col-span-2">
                    <OpsPrimaryButton onClick={connect} disabled={working}>
                      {working ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                      Save & sync now
                    </OpsPrimaryButton>
                  </div>
                </div>
              )}
            </div>
          </OpsCard>
        )}

        {/* Sync result */}
        {lastSyncResult && (
          <OpsTableShell
            title="Last sync result"
            badge={
              <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                LIVE
              </span>
            }
            footer={<span>GOOGLE SHEETS · IMPORT LEDGER</span>}
          >
            <table className="w-full text-left">
              <thead className="border-b border-control-border bg-slate-50 dark:bg-navy-950">
                <tr>
                  <th className={opsTh}>Metric</th>
                  <th className={opsTh}>Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                {Object.entries(
                  typeof lastSyncResult === "object" ? lastSyncResult : { result: lastSyncResult }
                )
                  .filter(([, v]) => v == null || typeof v !== "object")
                  .map(([k, v]) => (
                    <tr key={k}>
                      <td className={`${opsTd} font-mono text-xs uppercase text-slate-500`}>{k}</td>
                      <td className={`${opsTd} font-bold text-navy-900 dark:text-white`}>
                        {String(v)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!Object.keys(lastSyncResult || {}).length && (
              <OpsEmpty message="Sync finished with no detail payload" />
            )}
          </OpsTableShell>
        )}

        {template && (
          <OpsCard>
            <h3 className="text-sm font-bold text-navy-900 dark:text-white">Expected template</h3>
            <p className="mt-1 text-xs text-slate-500">
              Default tabs: <strong>{template.propertiesTab || "Properties"}</strong> ·{" "}
              <strong>{template.tasksTab || "Tasks"}</strong>
            </p>
            {(template.propertyColumns || template.taskColumns) && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {template.propertyColumns && (
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Property columns</p>
                    <p className="mt-1 font-mono text-[11px] text-slate-600">
                      {(template.propertyColumns || []).slice(0, 12).join(" · ")}
                    </p>
                  </div>
                )}
                {template.taskColumns && (
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Task columns</p>
                    <p className="mt-1 font-mono text-[11px] text-slate-600">
                      {(template.taskColumns || []).slice(0, 12).join(" · ")}
                    </p>
                  </div>
                )}
              </div>
            )}
          </OpsCard>
        )}
      </div>
    </AdminLayout>
  )
}
