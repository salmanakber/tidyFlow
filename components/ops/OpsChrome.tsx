"use client"

/**
 * Shared ops UI chrome — matches attached control-panel reference
 * (navy/amber, dense headers, control cards).
 */
import React from "react"
import { RefreshCw } from "lucide-react"

export function OpsPageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 font-mono">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 dark:text-white">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function OpsCard({
  children,
  className = "",
  padding = true,
}: {
  children: React.ReactNode
  className?: string
  padding?: boolean
}) {
  return (
    <div
      className={`rounded-xl border border-control-border bg-white shadow-sm dark:border-control-darkBorder dark:bg-control-darkCard ${
        padding ? "p-5" : ""
      } ${className}`}
    >
      {children}
    </div>
  )
}

export function OpsKpi({
  label,
  value,
  hint,
}: {
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return (
    <OpsCard>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1.5 text-2xl font-extrabold tabular-nums text-navy-900 dark:text-white">
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </OpsCard>
  )
}

export function OpsRefreshButton({
  onClick,
  loading,
}: {
  onClick: () => void
  loading?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-control-border bg-white px-3 text-xs font-bold text-slate-700 hover:border-amber-600 hover:text-amber-700 dark:border-control-darkBorder dark:bg-control-darkCard dark:text-slate-200"
    >
      <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
      Refresh
    </button>
  )
}

export function OpsPrimaryButton({
  children,
  onClick,
  type = "button",
  disabled,
}: {
  children: React.ReactNode
  onClick?: () => void
  type?: "button" | "submit"
  disabled?: boolean
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 text-xs font-bold text-white shadow-amber-glow hover:bg-amber-700 disabled:opacity-50"
    >
      {children}
    </button>
  )
}

export function OpsFlash({
  ok,
  text,
  onClose,
}: {
  ok: boolean
  text: string
  onClose: () => void
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm ${
        ok
          ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border border-red-200 bg-red-50 text-red-800"
      }`}
    >
      <span>{text}</span>
      <button type="button" onClick={onClose} className="text-xs font-bold opacity-70">
        Dismiss
      </button>
    </div>
  )
}

export function OpsEmpty({ message }: { message: string }) {
  return (
    <div className="py-16 text-center text-sm text-slate-500">{message}</div>
  )
}

export function OpsBadge({ status }: { status?: string | null }) {
  const label = String(status || "—")
  const s = label.toLowerCase()
  let cls = "bg-slate-100 text-slate-600 border-slate-200"
  if (["approved", "paid", "active", "completed", "synced", "resolved"].includes(s)) {
    cls = "bg-emerald-50 text-emerald-700 border-emerald-200"
  } else if (["pending", "open", "in_progress", "assigned", "planned"].includes(s)) {
    cls = "bg-amber-50 text-amber-800 border-amber-200"
  } else if (["rejected", "failed", "cancelled", "high"].includes(s)) {
    cls = "bg-red-50 text-red-700 border-red-200"
  }
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}
    >
      {label.replace(/_/g, " ")}
    </span>
  )
}

/** Dense control-panel table chrome matching the dispatch queue reference */
export function OpsTableShell({
  title,
  badge,
  tabs,
  activeTab,
  onTabChange,
  footer,
  children,
}: {
  title: string
  badge?: React.ReactNode
  tabs?: { id: string; label: string }[]
  activeTab?: string
  onTabChange?: (id: string) => void
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-control-border bg-white shadow-sm dark:border-control-darkBorder dark:bg-control-darkCard">
      <div className="flex flex-col gap-3 border-b border-control-border px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between dark:border-navy-800">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-bold text-navy-900 dark:text-white">{title}</h2>
          {badge}
        </div>
        {tabs && tabs.length > 0 && (
          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-navy-950">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTabChange?.(t.id)}
                className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition ${
                  activeTab === t.id
                    ? "bg-white text-amber-700 shadow-sm dark:bg-navy-800 dark:text-amber-400"
                    : "text-slate-500 hover:text-navy-900 dark:hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="overflow-x-auto">{children}</div>
      {footer && (
        <div className="flex items-center justify-between border-t border-control-border bg-slate-50 px-5 py-2.5 font-mono text-[10px] text-slate-400 dark:border-navy-800 dark:bg-navy-950">
          {footer}
        </div>
      )}
    </div>
  )
}

export const opsTh =
  "px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap"
export const opsTd = "px-4 py-3.5 text-sm align-middle"
