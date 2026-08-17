"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import Link from "next/link"

const TOKEN_KEY = "partnerAuthToken"

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0)
}

export default function PartnerDashboardPage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      window.location.href = "/partner/login"
      return
    }
    axios
      .get("/api/partner/dashboard", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.data.success) throw new Error(res.data.message || "Failed")
        setData(res.data.data)
      })
      .catch((err) => {
        setError(err?.response?.data?.message || err.message || "Failed to load")
        if (err?.response?.status === 401) {
          localStorage.removeItem(TOKEN_KEY)
          window.location.href = "/partner/login"
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const logout = async () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem("partnerUserData")
    await axios.post("/api/partner/logout").catch(() => null)
    window.location.href = "/partner/login"
  }

  if (loading) {
    return <Shell><p className="text-gray-500">Loading dashboard…</p></Shell>
  }

  if (error || !data?.partner) {
    return (
      <Shell>
        <p className="text-red-700 mb-4">{error || "Unable to load"}</p>
        <Link href="/partner/login" className="text-indigo-600 font-medium">
          Back to login
        </Link>
      </Shell>
    )
  }

  const p = data.partner
  const isInvestor = p.type === "INVESTOR"

  return (
    <Shell
      title={isInvestor ? "Investor portal" : "Marketer portal"}
      subtitle={[p.firstName, p.lastName].filter(Boolean).join(" ") || p.email}
      onLogout={logout}
    >
      {isInvestor ? <InvestorView data={data} /> : <MarketerView data={data} />}
    </Shell>
  )
}

function MarketerView({ data }: { data: any }) {
  const s = data.summary || {}
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const refLink = data.partner?.referralCode
    ? `${origin}/account/login?ref=${data.partner.referralCode}`
    : ""
  const [claims, setClaims] = useState<any[]>(data.claims || [])
  const [email, setEmail] = useState("")
  const [note, setNote] = useState("")
  const [claimMsg, setClaimMsg] = useState<string | null>(null)
  const [claimBusy, setClaimBusy] = useState(false)
  const [preview, setPreview] = useState<any>(null)

  useEffect(() => {
    setClaims(data.claims || [])
  }, [data.claims])

  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null

  const verifyEmail = async () => {
    setClaimMsg(null)
    setPreview(null)
    setClaimBusy(true)
    try {
      const res = await axios.post(
        "/api/partner/claims",
        { customerEmail: email, validateOnly: true },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setClaimMsg(res.data.message || (res.data.success ? "Verified" : "Could not verify"))
      if (res.data.success) setPreview(res.data.data)
    } catch (err: any) {
      setClaimMsg(err?.response?.data?.message || err.message || "Verification failed")
    } finally {
      setClaimBusy(false)
    }
  }

  const submitClaim = async () => {
    setClaimMsg(null)
    setClaimBusy(true)
    try {
      const res = await axios.post(
        "/api/partner/claims",
        { customerEmail: email, note },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.data.success) throw new Error(res.data.message)
      setClaimMsg(res.data.message || "Submitted for admin review")
      setEmail("")
      setNote("")
      setPreview(null)
      const list = await axios.get("/api/partner/claims", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (list.data.success) setClaims(list.data.data || [])
    } catch (err: any) {
      setClaimMsg(err?.response?.data?.message || err.message || "Submit failed")
    } finally {
      setClaimBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Customers brought" value={String(s.customersBrought || 0)} />
        <Card label="Revenue collected" value={money(s.totalRevenueCollected || 0)} />
        <Card label="Your commission" value={money(s.totalCommissionEarned || 0)} />
        <Card label="Pending / unpaid" value={money(s.pendingCommission || 0)} />
      </div>

      {refLink && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs font-semibold uppercase text-gray-500">Your referral link</div>
          <p className="mt-1 text-sm break-all text-indigo-700 font-medium">{refLink}</p>
          <p className="mt-2 text-xs text-gray-500">
            Commission rate: {s.commissionPercent}% of collected subscription revenue from customers you refer.
          </p>
        </div>
      )}

      <Section title="Add existing client">
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-600">
            Claim a customer who already registered and has an active subscription. We verify their
            email, then an admin reviews before they are linked to you. Customers already linked to
            another marketer cannot be claimed.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              placeholder="Customer email"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              type="button"
              disabled={claimBusy || !email.trim()}
              onClick={verifyEmail}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50"
            >
              Verify
            </button>
            <button
              type="button"
              disabled={claimBusy || !email.trim()}
              onClick={submitClaim}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"
            >
              Submit for review
            </button>
          </div>
          <textarea
            placeholder="Optional note for admin"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {preview && (
            <div className="text-sm bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-emerald-900">
              Verified: {preview.user?.email}
              {preview.company?.name ? ` · ${preview.company.name}` : ""}
              {preview.company?.planTier ? ` · ${preview.company.planTier}` : ""}
              {preview.company?.subscriptionStatus
                ? ` · ${preview.company.subscriptionStatus}`
                : ""}
            </div>
          )}
          {claimMsg && <p className="text-sm text-slate-700">{claimMsg}</p>}
        </div>
      </Section>

      <Section title="Your client claims">
        <SimpleTable
          headers={["Email", "Company", "Status", "Submitted"]}
          rows={(claims || []).map((c: any) => [
            c.customerEmail,
            c.companyName || c.company?.name || "—",
            c.status,
            c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—",
          ])}
        />
      </Section>

      <Section title="Your customers">
        <SimpleTable
          headers={["Company", "Plan", "Status"]}
          rows={(data.companies || []).map((c: any) => [c.name, c.planTier, c.subscriptionStatus])}
        />
      </Section>

      <Section title="Commission ledger">
        <SimpleTable
          headers={["Company", "Revenue", "Commission", "Status"]}
          rows={(data.commissions || []).map((c: any) => [
            c.company?.name || "—",
            money(Number(c.revenueAmount)),
            money(Number(c.commissionAmount)),
            c.status,
          ])}
        />
      </Section>

      <Section title="Payouts to you">
        <SimpleTable
          headers={["Amount", "Status", "Date"]}
          rows={(data.payouts || []).map((p: any) => [
            money(Number(p.amount)),
            p.status,
            p.paidAt ? new Date(p.paidAt).toLocaleDateString() : new Date(p.createdAt).toLocaleDateString(),
          ])}
        />
      </Section>
    </div>
  )
}

function InvestorView({ data }: { data: any }) {
  const inv = data.investment || {}
  const m = data.platformMetrics || {}

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Your investment" value={money(Number(inv.amount || 0))} />
        <Card label="Equity" value={`${Number(inv.equityPercent || 0)}%`} />
        <Card label="Platform MRR (approx)" value={money(Number(m.mrrApprox || 0))} />
        <Card label="Active subscriptions" value={String(m.activeSubscriptions || 0)} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900">Investment snapshot</h3>
        <dl className="mt-3 grid sm:grid-cols-2 gap-2 text-sm">
          <div><dt className="text-gray-500">Currency</dt><dd className="font-medium">{inv.currency || "USD"}</dd></div>
          <div><dt className="text-gray-500">Investment date</dt><dd className="font-medium">{inv.date ? new Date(inv.date).toLocaleDateString() : "—"}</dd></div>
          <div><dt className="text-gray-500">Board observer</dt><dd className="font-medium">{inv.boardObserver ? "Yes" : "No"}</dd></div>
          <div><dt className="text-gray-500">Lifetime revenue</dt><dd className="font-medium">{money(Number(m.lifetimeRevenue || 0))}</dd></div>
        </dl>
        {inv.termSheetUrl && (
          <a href={inv.termSheetUrl} target="_blank" rel="noreferrer" className="inline-block mt-3 text-sm text-indigo-600 font-medium">
            View term sheet
          </a>
        )}
        {inv.dataRoomNotes && (
          <p className="mt-3 text-sm text-gray-600 whitespace-pre-wrap">{inv.dataRoomNotes}</p>
        )}
      </div>

      <Section title="Platform metrics">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-2">
          <Card label="Total companies" value={String(m.totalCompanies || 0)} />
          <Card label="Owner accounts" value={String(m.ownerAccounts || 0)} />
          <Card label="ARR (approx)" value={money(Number(m.arrApprox || 0))} />
        </div>
      </Section>

      <Section title="Founder updates">
        {(data.updates || []).length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No updates published yet.</p>
        ) : (
          <ul className="divide-y">
            {(data.updates || []).map((u: any) => (
              <li key={u.id} className="p-4">
                <div className="font-semibold text-gray-900">{u.title}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {u.publishedAt ? new Date(u.publishedAt).toLocaleDateString() : ""}
                </div>
                <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{u.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Data room">
        {(data.documents || []).length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No documents yet.</p>
        ) : (
          <ul className="p-4 space-y-2">
            {(data.documents || []).map((d: any) => (
              <li key={d.id}>
                <a href={d.url} target="_blank" rel="noreferrer" className="text-indigo-600 text-sm font-medium">
                  {d.title}
                </a>
                <span className="text-xs text-gray-400 ml-2">{d.category}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function Shell({
  children,
  title = "Partner portal",
  subtitle,
  onLogout,
}: {
  children: React.ReactNode
  title?: string
  subtitle?: string
  onLogout?: () => void
}) {
  return (
    <main className="min-h-screen bg-[#F7F4EE]">
      <header className="border-b border-[#E6E0D6] bg-white">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold tracking-widest text-amber-700">TIDYFLOW</div>
            <h1 className="text-xl font-bold text-slate-900">{title}</h1>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
          {onLogout && (
            <button type="button" onClick={onLogout} className="text-sm font-medium text-slate-600">
              Sign out
            </button>
          )}
        </div>
      </header>
      <div className="max-w-5xl mx-auto px-4 py-8">{children}</div>
    </main>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b font-semibold text-slate-900">{title}</div>
      {children}
    </section>
  )
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  if (!rows.length) return <p className="p-4 text-sm text-gray-500">Nothing here yet.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            {headers.map((h) => (
              <th key={h} className="px-4 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-gray-100">
              {r.map((c, j) => (
                <td key={j} className="px-4 py-2">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
