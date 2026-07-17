"use client"

import axios from "axios"

export function getToken() {
  if (typeof window === "undefined") return null
  return localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
}

export function saHeaders() {
  return { Authorization: `Bearer ${getToken()}` }
}

export async function saGet<T = any>(path: string, params?: Record<string, any>): Promise<T> {
  const res = await axios.get(`/api/admin/sales-agent${path}`, {
    headers: saHeaders(),
    params,
  })
  if (!res.data.success) throw new Error(res.data.message || "Request failed")
  return res.data.data
}

export async function saPost<T = any>(path: string, body?: any, opts?: { timeout?: number }): Promise<T> {
  const res = await axios.post(`/api/admin/sales-agent${path}`, body, {
    headers: saHeaders(),
    timeout: opts?.timeout ?? 120000,
  })
  if (!res.data.success) throw new Error(res.data.message || "Request failed")
  return res.data.data
}

export async function saPut<T = any>(path: string, body?: any): Promise<T> {
  const res = await axios.put(`/api/admin/sales-agent${path}`, body, {
    headers: saHeaders(),
  })
  if (!res.data.success) throw new Error(res.data.message || "Request failed")
  return res.data.data
}

export async function saPatch<T = any>(path: string, body?: any): Promise<T> {
  const res = await axios.patch(`/api/admin/sales-agent${path}`, body, {
    headers: saHeaders(),
  })
  if (!res.data.success) throw new Error(res.data.message || "Request failed")
  return res.data.data
}

export async function saDelete<T = any>(path: string, params?: Record<string, any>): Promise<T> {
  const res = await axios.delete(`/api/admin/sales-agent${path}`, {
    headers: saHeaders(),
    params,
  })
  if (!res.data.success) throw new Error(res.data.message || "Request failed")
  return res.data.data
}

/** Metric card. Amber top-edge appears on hover — a quiet "this number moves" cue, not decoration on every card at once. */
export function StatCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="group relative overflow-hidden bg-white rounded-xl border border-[#E3E7F0] shadow-[0_1px_2px_rgba(11,27,59,0.04)] p-4 transition-shadow hover:shadow-[0_4px_16px_rgba(11,27,59,0.08)]">
      <span className="absolute top-0 left-0 right-0 h-[2px] bg-[#D98E04] scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-300" />
      <p className="text-[11px] font-semibold text-[#8890A0] uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[#0B1B3B] tabular-nums tracking-tight">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-[#A6ADBD]">{sub}</p> : null}
    </div>
  )
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="text-center py-12 px-4">
      <p className="text-sm font-medium text-[#0B1B3B]">{title}</p>
      {description ? <p className="mt-1 text-sm text-[#8890A0]">{description}</p> : null}
    </div>
  )
}

export function LoadingBlock() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#E3E7F0] border-t-[#D98E04]" />
    </div>
  )
}

export function MessageBanner({
  message,
}: {
  message: { type: "success" | "error"; text: string } | null
}) {
  if (!message) return null
  return (
    <div
      className={`rounded-lg px-4 py-3 text-sm mb-4 border ${
        message.type === "success"
          ? "bg-[#EFFAF3] text-[#166534] border-[#CDEBD8]"
          : "bg-[#FDF0EE] text-[#9A2A1E] border-[#F4D4CE]"
      }`}
    >
      {message.text}
    </div>
  )
}

export const inputCls =
  "w-full rounded-lg border border-[#D8DCE6] px-3 py-2 text-sm text-[#0B1B3B] placeholder:text-[#A6ADBD] focus:outline-none focus:ring-2 focus:ring-[#D98E04]/40 focus:border-[#D98E04] transition-colors"

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-[#0B1B3B] px-4 py-2 text-sm font-medium text-white hover:bg-[#16294F] disabled:opacity-50 transition-colors"

export const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-[#D8DCE6] bg-white px-4 py-2 text-sm font-medium text-[#0B1B3B] hover:bg-[#F6F7FB] disabled:opacity-50 transition-colors"

/** Determinate or indeterminate waiting bar for background actions */
export function ProgressBar({
  label,
  pct,
  indeterminate,
  tone = "navy",
}: {
  label?: string
  pct?: number
  indeterminate?: boolean
  tone?: "navy" | "green" | "amber"
}) {
  const bar =
    tone === "green" ? "bg-[#1E9A5A]" : tone === "amber" ? "bg-[#D98E04]" : "bg-[#0B1B3B]"
  const track =
    tone === "green" ? "bg-[#E1F5E9]" : tone === "amber" ? "bg-[#FCEACB]" : "bg-[#E3E7F0]"
  const workingText = tone === "amber" ? "text-[#B57703]" : "text-[#5B6478]"
  const value = Math.max(0, Math.min(100, pct ?? 0))

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <div className="flex justify-between text-xs text-[#5B6478]">
          <span className="font-medium text-[#0B1B3B]">{label}</span>
          {!indeterminate && <span className="tabular-nums">{value}%</span>}
          {indeterminate && <span className={`${workingText} animate-pulse`}>Working…</span>}
        </div>
      )}
      <div className={`h-2.5 w-full rounded-full overflow-hidden ${track}`}>
        {indeterminate ? (
          <div className={`h-full w-2/5 rounded-full ${bar} animate-pulse`} />
        ) : (
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${bar}`}
            style={{ width: `${value}%` }}
          />
        )}
      </div>
    </div>
  )
}