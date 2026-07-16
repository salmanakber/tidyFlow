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
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-gray-400">{sub}</p> : null}
    </div>
  )
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="text-center py-12 px-4">
      <p className="text-sm font-medium text-gray-900">{title}</p>
      {description ? <p className="mt-1 text-sm text-gray-500">{description}</p> : null}
    </div>
  )
}

export function LoadingBlock() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
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
      className={`rounded-lg px-4 py-3 text-sm mb-4 ${
        message.type === "success"
          ? "bg-green-50 text-green-800 border border-green-200"
          : "bg-red-50 text-red-800 border border-red-200"
      }`}
    >
      {message.text}
    </div>
  )
}

export const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
export const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"

/** Determinate or indeterminate waiting bar for AI / Redis actions */
export function ProgressBar({
  label,
  pct,
  indeterminate,
  tone = "indigo",
}: {
  label?: string
  pct?: number
  indeterminate?: boolean
  tone?: "indigo" | "green" | "amber"
}) {
  const bar =
    tone === "green" ? "bg-green-500" : tone === "amber" ? "bg-amber-500" : "bg-indigo-500"
  const track =
    tone === "green" ? "bg-green-100" : tone === "amber" ? "bg-amber-100" : "bg-indigo-100"
  const value = Math.max(0, Math.min(100, pct ?? 0))

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <div className="flex justify-between text-xs text-gray-600">
          <span className="font-medium">{label}</span>
          {!indeterminate && <span>{value}%</span>}
          {indeterminate && <span className="text-indigo-600 animate-pulse">Working…</span>}
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
