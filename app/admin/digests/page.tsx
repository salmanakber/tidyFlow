"use client"

import { useCallback, useEffect, useState } from "react"
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
  OpsBadge,
  OpsSkeleton,
  OpsTableShell,
  opsTh,
  opsTd,
} from "@/components/ops/OpsChrome"
import { Mail, MessageCircle, Eye } from "lucide-react"

type DigestJob = {
  id: number
  title: string
  status: string
  scheduledDate: string | null
  propertyAddress: string | null
  cleaner: string
  unassigned?: boolean
  late?: boolean
}

type DigestData = {
  companyName: string
  dateLabel: string
  summary: { total: number; completed: number; inProgress: number; planned: number }
  lateCount: number
  unassignedCount: number
  jobs: DigestJob[]
  late: DigestJob[]
  unassigned: Array<{ id: number; title: string; status: string; propertyAddress: string | null }>
  plainText: string
  whatsappUrl: string
  recipientEmail?: string
}

export default function DigestsPage() {
  return (
    <AdminLayout>
      <Content />
    </AdminLayout>
  )
}

function Content() {
  const [data, setData] = useState<DigestData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")

  const headers = () => {
    const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
    return { Authorization: `Bearer ${token}` }
  }

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError("")
      const companyId = localStorage.getItem("selectedCompanyId")
      const res = await axios.get("/api/company/digest", {
        headers: headers(),
        params: companyId ? { companyId } : {},
      })
      if (res.data?.success) setData(res.data.data)
      else {
        setData(null)
        setError(res.data?.message || "Failed to load digest")
      }
    } catch (e: any) {
      setData(null)
      setError(e.response?.data?.message || "Failed to load digest preview")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const sendEmail = async () => {
    try {
      setSending(true)
      setError("")
      const companyId = localStorage.getItem("selectedCompanyId")
      const res = await axios.post(
        "/api/company/digest",
        {},
        {
          headers: headers(),
          params: companyId ? { companyId } : {},
        }
      )
      if (res.data?.success) {
        setToast(res.data.message || "Digest email sent")
        if (res.data.data) setData(res.data.data)
      } else {
        setError(res.data?.message || "Send failed")
      }
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to send digest email")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <OpsPageHeader
        eyebrow="Owner ops"
        title="Daily digests"
        subtitle="Preview today's jobs, email yourself a summary, or open WhatsApp with prefilled text."
        actions={
          <>
            <OpsRefreshButton onClick={load} loading={loading} />
            <button
              type="button"
              onClick={load}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-control-border bg-white px-3 text-xs font-bold text-slate-700 hover:border-amber-600 hover:text-amber-700 dark:border-amber-800/50 dark:bg-control-darkCard dark:text-slate-200"
            >
              <Eye size={14} />
              Preview
            </button>
            <OpsPrimaryButton onClick={sendEmail} disabled={sending || loading}>
              <Mail size={14} className="mr-1" />
              {sending ? "Sending…" : "Send email"}
            </OpsPrimaryButton>
            {data?.whatsappUrl && (
              <a
                href={data.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-600/40 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
              >
                <MessageCircle size={14} />
                Open WhatsApp
              </a>
            )}
          </>
        }
      />

      {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
      {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

      {loading && !data ? (
        <OpsSkeleton rows={4} />
      ) : !data ? (
        <OpsEmpty message="No digest preview available." ctaLabel="Retry" onCta={load} />
      ) : (
        <>
          <p className="text-sm text-slate-500">
            <span className="font-semibold text-navy-900 dark:text-white">{data.companyName}</span>
            {" · "}
            {data.dateLabel}
            {data.recipientEmail ? (
              <>
                {" · "}
                Email to <span className="font-medium">{data.recipientEmail}</span>
              </>
            ) : null}
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <OpsKpi label="Jobs today" value={data.summary.total} />
            <OpsKpi label="Completed" value={data.summary.completed} />
            <OpsKpi label="Late" value={data.lateCount} hint="Past schedule, not done" />
            <OpsKpi label="Unassigned" value={data.unassignedCount} />
          </div>

          <OpsCard padding={false}>
            <div className="border-b border-slate-100 px-5 py-3 dark:border-navy-800">
              <h2 className="text-sm font-bold text-navy-900 dark:text-white">Today&apos;s jobs</h2>
            </div>
            {data.jobs.length === 0 ? (
              <div className="px-5 py-10">
                <OpsEmpty message="No jobs scheduled for today." />
              </div>
            ) : (
              <OpsTableShell>
                <thead>
                  <tr>
                    <th className={opsTh}>Job</th>
                    <th className={opsTh}>Property</th>
                    <th className={opsTh}>Cleaner</th>
                    <th className={opsTh}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.jobs.map((j) => (
                    <tr key={j.id} className="border-t border-slate-100 dark:border-navy-800">
                      <td className={opsTd}>
                        <span className="font-semibold text-navy-900 dark:text-white">{j.title}</span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {j.late && <OpsBadge status="late" />}
                          {j.unassigned && <OpsBadge status="unassigned" />}
                        </div>
                      </td>
                      <td className={opsTd}>{j.propertyAddress || "—"}</td>
                      <td className={opsTd}>{j.cleaner}</td>
                      <td className={opsTd}>
                        <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          {j.status.replace(/_/g, " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </OpsTableShell>
            )}
          </OpsCard>
        </>
      )}
    </div>
  )
}
