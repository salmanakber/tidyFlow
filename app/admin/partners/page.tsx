"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import Link from "next/link"
import {
  Users,
  Briefcase,
  Plus,
  RefreshCw,
  Handshake,
  PiggyBank,
  ExternalLink,
  Copy,
} from "lucide-react"

type PartnerType = "MARKETER" | "INVESTOR"
type Tab = PartnerType | "CLAIMS"

interface PartnerRow {
  id: number
  type: PartnerType
  status: string
  email: string
  firstName?: string
  lastName?: string
  companyName?: string
  referralCode?: string
  commissionPercent: number
  investmentAmount?: number | null
  equityPercent?: number | null
  counts?: {
    referredCompanies: number
    commissions: number
    payouts: number
    referrals: number
  }
}

function authHeaders() {
  const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
  return { Authorization: `Bearer ${token}` }
}

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0)
}

function partnerDisplayName(p: {
  firstName?: string | null
  lastName?: string | null
  companyName?: string | null
  email?: string
}) {
  return [p.firstName, p.lastName].filter(Boolean).join(" ") || p.companyName || p.email || "—"
}

export default function AdminPartnersPage() {
  const [tab, setTab] = useState<Tab>("MARKETER")
  const [rows, setRows] = useState<PartnerRow[]>([])
  const [claims, setClaims] = useState<any[]>([])
  const [pendingClaimCount, setPendingClaimCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [claimNote, setClaimNote] = useState("")
  const [reviewingId, setReviewingId] = useState<number | null>(null)
  const [form, setForm] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    companyName: "",
    phone: "",
    commissionPercent: 10,
    referralCode: "",
    investmentAmount: "",
    equityPercent: "",
    investmentDate: "",
    notes: "",
  })

  const origin = useMemo(() => {
    if (typeof window === "undefined") return ""
    return window.location.origin
  }, [])

  const loadPendingCount = useCallback(async () => {
    try {
      const res = await axios.get("/api/admin/partners/claims", {
        headers: authHeaders(),
        params: { status: "PENDING" },
      })
      if (res.data.success) {
        const list = res.data.data || []
        setPendingClaimCount(list.length)
        if (tab === "CLAIMS") setClaims(list)
      }
    } catch {
      /* ignore badge errors */
    }
  }, [tab])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (tab === "CLAIMS") {
        const res = await axios.get("/api/admin/partners/claims", {
          headers: authHeaders(),
          params: { status: "PENDING" },
        })
        if (res.data.success) {
          setClaims(res.data.data || [])
          setPendingClaimCount((res.data.data || []).length)
        }
      } else {
        const [partnersRes] = await Promise.all([
          axios.get("/api/admin/partners", {
            headers: authHeaders(),
            params: { type: tab },
          }),
          loadPendingCount(),
        ])
        if (partnersRes.data.success) setRows(partnersRes.data.data || [])
      }
    } catch (err: any) {
      setMessage(err?.response?.data?.message || "Failed to load partners")
    } finally {
      setLoading(false)
    }
  }, [tab, loadPendingCount])

  useEffect(() => {
    void load()
  }, [load])

  const reviewClaim = async (claimId: number, approve: boolean) => {
    setReviewingId(claimId)
    setMessage(null)
    try {
      const res = await axios.post(
        "/api/admin/partners/claims",
        { claimId, approve, adminNote: claimNote || undefined },
        { headers: authHeaders() }
      )
      if (!res.data.success) throw new Error(res.data.message)
      setMessage(res.data.message || (approve ? "Claim approved" : "Claim rejected"))
      setClaimNote("")
      await load()
      await loadPendingCount()
    } catch (err: any) {
      setMessage(err?.response?.data?.message || err.message || "Review failed")
    } finally {
      setReviewingId(null)
    }
  }

  const createPartner = async (e: React.FormEvent) => {
    e.preventDefault()
    if (tab === "CLAIMS") return
    setSaving(true)
    setMessage(null)
    try {
      const payload: any = {
        type: tab as PartnerType,
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        companyName: form.companyName,
        phone: form.phone,
        notes: form.notes,
      }
      if (tab === "MARKETER") {
        payload.commissionPercent = Number(form.commissionPercent)
        if (form.referralCode) payload.referralCode = form.referralCode
      } else {
        payload.investmentAmount = Number(form.investmentAmount || 0)
        payload.equityPercent = Number(form.equityPercent || 0)
        if (form.investmentDate) payload.investmentDate = form.investmentDate
      }
      const res = await axios.post("/api/admin/partners", payload, { headers: authHeaders() })
      if (!res.data.success) throw new Error(res.data.message)
      setMessage(
        tab === "MARKETER"
          ? `Marketer created. Referral: ${res.data.data?.referralLink || res.data.data?.partner?.referralCode}`
          : "Investor account created."
      )
      setShowForm(false)
      setForm({
        email: "",
        password: "",
        firstName: "",
        lastName: "",
        companyName: "",
        phone: "",
        commissionPercent: 10,
        referralCode: "",
        investmentAmount: "",
        equityPercent: "",
        investmentDate: "",
        notes: "",
      })
      await load()
    } catch (err: any) {
      setMessage(err?.response?.data?.message || err.message || "Create failed")
    } finally {
      setSaving(false)
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setMessage("Copied to clipboard")
    } catch {
      setMessage(text)
    }
  }

  const createPartnerForm = (
    <form
      onSubmit={createPartner}
      className="space-y-4 rounded-xl border border-indigo-100 bg-white p-5 shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <h2 className="text-sm font-semibold text-gray-900">
          Add {tab === "MARKETER" ? "marketer" : "investor"}
        </h2>
        <button
          type="button"
          onClick={() => setShowForm(false)}
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          Cancel
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-600">Email</span>
          <input
            required
            type="email"
            className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-600">Temporary password</span>
          <input
            required
            type="text"
            className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-600">First name</span>
          <input
            className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-600">Last name</span>
          <input
            className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-600">Company / agency</span>
          <input
            className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-600">Phone</span>
          <input
            className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </label>
        {tab === "MARKETER" ? (
          <>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-600">Commission %</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={form.commissionPercent}
                onChange={(e) => setForm({ ...form, commissionPercent: Number(e.target.value) })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-600">Referral code (optional)</span>
              <input
                className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={form.referralCode}
                onChange={(e) => setForm({ ...form, referralCode: e.target.value })}
              />
            </label>
          </>
        ) : (
          <>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-600">Investment amount</span>
              <input
                type="number"
                min={0}
                step={1000}
                className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={form.investmentAmount}
                onChange={(e) => setForm({ ...form, investmentAmount: e.target.value })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-600">Equity %</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={form.equityPercent}
                onChange={(e) => setForm({ ...form, equityPercent: e.target.value })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-600">Investment date</span>
              <input
                type="date"
                className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={form.investmentDate}
                onChange={(e) => setForm({ ...form, investmentDate: e.target.value })}
              />
            </label>
          </>
        )}
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-gray-600">Internal notes</span>
        <textarea
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          rows={2}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </label>
      <button
        disabled={saving}
        type="submit"
        className="inline-flex h-10 items-center rounded-full bg-indigo-600 px-5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : `Create ${tab === "MARKETER" ? "marketer" : "investor"}`}
      </button>
    </form>
  )

  const tabBtn = (id: Tab, label: string, icon: React.ReactNode, badge?: number) => {
    const active = tab === id
    return (
      <button
        key={id}
        type="button"
        onClick={() => {
          setTab(id)
          setShowForm(false)
        }}
        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
          active
            ? "bg-indigo-600 text-white shadow-sm"
            : "bg-white text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-indigo-50 hover:text-indigo-700"
        }`}
      >
        {icon}
        {label}
        {typeof badge === "number" && badge > 0 && (
          <span
            className={`ml-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
              active ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800"
            }`}
          >
            {badge}
          </span>
        )}
      </button>
    )
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-gray-900">
              <Handshake className="text-indigo-600" size={26} />
              Partners & Investors
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage marketers and investors. Partner portal:{" "}
              <Link href="/partner/login" className="font-medium text-indigo-600 hover:underline">
                /partner/login
              </Link>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => load()}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw size={16} /> Refresh
            </button>
            {tab !== "CLAIMS" && (
              <button
                type="button"
                onClick={() => setShowForm((v) => !v)}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-indigo-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
              >
                <Plus size={16} /> Add {tab === "MARKETER" ? "marketer" : "investor"}
              </button>
            )}
          </div>
        </div>

        {message && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-900">
            {message}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {tabBtn("MARKETER", "Marketers", <Users size={16} />)}
          {tabBtn("INVESTOR", "Investors", <PiggyBank size={16} />)}
          {tabBtn("CLAIMS", "Client claims", <Briefcase size={16} />, pendingClaimCount)}
        </div>

        {showForm && tab !== "CLAIMS" && createPartnerForm}

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {tab === "CLAIMS" && (
            <div className="border-b border-gray-100 bg-indigo-50/40 px-4 py-3">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-indigo-700">
                Admin note (applied on approve / reject)
              </label>
              <input
                placeholder="Optional note stored on the claim record"
                className="h-10 w-full max-w-xl rounded-lg border border-indigo-200 bg-white px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={claimNote}
                onChange={(e) => setClaimNote(e.target.value)}
              />
            </div>
          )}

          {loading ? (
            <div className="px-4 py-16 text-center text-sm text-gray-500">Loading…</div>
          ) : tab === "CLAIMS" ? (
            claims.length === 0 ? (
              <div className="px-4 py-16 text-center">
                <Briefcase className="mx-auto mb-2 text-gray-300" size={32} />
                <div className="text-sm font-medium text-gray-800">No pending claims</div>
                <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
                  When marketers submit a client by email, rows appear here for review.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                      <th className="px-4 py-3">Customer email</th>
                      <th className="px-4 py-3">Company</th>
                      <th className="px-4 py-3">Subscription</th>
                      <th className="px-4 py-3">Claimed by</th>
                      <th className="px-4 py-3">Submitted</th>
                      <th className="px-4 py-3 text-right">Decision</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {claims.map((c) => (
                      <tr key={c.id} className="hover:bg-indigo-50/40">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{c.customerEmail}</div>
                          {c.note && (
                            <div className="mt-0.5 line-clamp-2 text-xs text-gray-500">{c.note}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-800">
                          {c.companyName || c.company?.name || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-gray-800">{c.company?.planTier || "—"}</div>
                          <div className="text-xs capitalize text-gray-500">
                            {c.company?.subscriptionStatus || "—"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">
                            {partnerDisplayName(c.partner || {})}
                          </div>
                          <div className="text-xs text-gray-500">{c.partner?.email}</div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-600">
                          {c.createdAt
                            ? new Date(c.createdAt).toLocaleString(undefined, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={reviewingId === c.id}
                              onClick={() => reviewClaim(c.id, true)}
                              className="inline-flex h-8 items-center rounded-full bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={reviewingId === c.id}
                              onClick={() => reviewClaim(c.id, false)}
                              className="inline-flex h-8 items-center rounded-full border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              Reject
                            </button>
                            <Link
                              href={`/admin/partners/${c.partnerId}`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
                            >
                              Open <ExternalLink size={12} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : rows.length === 0 ? (
            <div className="px-4 py-16 text-center">
              {tab === "MARKETER" ? (
                <Users className="mx-auto mb-2 text-gray-300" size={32} />
              ) : (
                <PiggyBank className="mx-auto mb-2 text-gray-300" size={32} />
              )}
              <div className="text-sm font-medium text-gray-800">
                No {tab === "MARKETER" ? "marketers" : "investors"} yet
              </div>
              <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
                Create a {tab === "MARKETER" ? "marketer" : "investor"} to get started.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-3">Name / email</th>
                    <th className="px-4 py-3">Status</th>
                    {tab === "MARKETER" ? (
                      <>
                        <th className="px-4 py-3 text-right">Rate</th>
                        <th className="px-4 py-3 text-right">Customers</th>
                        <th className="px-4 py-3">Referral code</th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-3 text-right">Investment</th>
                        <th className="px-4 py-3 text-right">Equity</th>
                      </>
                    )}
                    <th className="px-4 py-3 text-right"> </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((p) => {
                    const refLink = p.referralCode
                      ? `${origin}/account/login?ref=${p.referralCode}`
                      : ""
                    const status = String(p.status || "").toUpperCase()
                    const statusClass =
                      status === "ACTIVE" || status === "APPROVED"
                        ? "bg-emerald-50 text-emerald-800 ring-emerald-600/20"
                        : status === "PENDING"
                          ? "bg-amber-50 text-amber-800 ring-amber-600/20"
                          : status === "REJECTED" || status === "SUSPENDED" || status === "INACTIVE"
                            ? "bg-red-50 text-red-800 ring-red-600/20"
                            : "bg-gray-50 text-gray-700 ring-gray-500/20"
                    return (
                      <tr key={p.id} className="hover:bg-indigo-50/40">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{partnerDisplayName(p)}</div>
                          <div className="text-xs text-gray-500">{p.email}</div>
                          {p.companyName && (
                            <div className="mt-0.5 text-xs text-gray-400">{p.companyName}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusClass}`}
                          >
                            {status.toLowerCase()}
                          </span>
                        </td>
                        {tab === "MARKETER" ? (
                          <>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                              {p.commissionPercent}%
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
                              {p.counts?.referredCompanies ?? 0}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <code className="rounded border border-indigo-100 bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-800">
                                  {p.referralCode || "—"}
                                </code>
                                {refLink && (
                                  <button
                                    type="button"
                                    className="text-gray-500 hover:text-indigo-600"
                                    onClick={() => copy(refLink)}
                                    title="Copy referral link"
                                  >
                                    <Copy size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                              {money(Number(p.investmentAmount || 0))}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                              {Number(p.equityPercent || 0)}%
                            </td>
                          </>
                        )}
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/admin/partners/${p.id}`}
                            className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline"
                          >
                            Open <ExternalLink size={14} />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
