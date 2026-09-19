"use client"

/**
 * Shared ops UI chrome — navy/amber control panel.
 * Web-only; does not change mobile API contracts.
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
          <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 dark:text-white">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        )}
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
      className={`rounded-xl border border-control-border bg-white shadow-sm dark:border-amber-900/40 dark:bg-control-darkCard ${
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
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-control-border bg-white px-3 text-xs font-bold text-slate-700 hover:border-amber-600 hover:text-amber-700 dark:border-amber-800/50 dark:bg-control-darkCard dark:text-slate-200 dark:hover:border-amber-500 dark:hover:text-amber-300"
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
      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 text-xs font-bold text-white shadow-amber-glow hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-500 dark:hover:bg-amber-600"
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
          ? "border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
          : "border border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
      }`}
    >
      <span>{text}</span>
      <button type="button" onClick={onClose} className="text-xs font-bold opacity-70">
        Dismiss
      </button>
    </div>
  )
}

/** Empty state with optional single CTA */
export function OpsEmpty({
  message,
  hint,
  ctaLabel,
  onCta,
  ctaHref,
}: {
  message: string
  hint?: string
  ctaLabel?: string
  onCta?: () => void
  ctaHref?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-slate-200 bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
        <span className="h-2 w-2 rounded-full bg-amber-500/80" />
      </div>
      <p className="max-w-sm text-sm font-medium text-slate-600 dark:text-slate-300">{message}</p>
      {hint ? (
        <p className="max-w-sm text-xs text-slate-400 dark:text-slate-500">{hint}</p>
      ) : null}
      {ctaLabel && (onCta || ctaHref) && (
        ctaHref ? (
          <a
            href={ctaHref}
            className="mt-2 inline-flex h-9 items-center rounded-lg bg-amber-600 px-3.5 text-xs font-bold text-white hover:bg-amber-700"
          >
            {ctaLabel}
          </a>
        ) : (
          <button
            type="button"
            onClick={onCta}
            className="mt-2 inline-flex h-9 items-center rounded-lg bg-amber-600 px-3.5 text-xs font-bold text-white hover:bg-amber-700"
          >
            {ctaLabel}
          </button>
        )
      )}
    </div>
  )
}

export function OpsSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="animate-pulse space-y-0 p-2">
      <div className="mb-2 flex gap-2 px-2">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 flex-1 rounded bg-slate-200 dark:bg-navy-800" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-2 border-t border-slate-100 px-2 py-3 dark:border-navy-900">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="h-4 flex-1 rounded bg-slate-100 dark:bg-navy-900"
              style={{ opacity: 1 - r * 0.08 }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function OpsBadge({ status }: { status?: string | null }) {
  const label = String(status || "—")
  const s = label.toLowerCase().replace(/\s+/g, "_")
  let cls =
    "bg-slate-100 text-slate-600 border-slate-200 dark:bg-navy-900 dark:text-slate-300 dark:border-navy-700"
  if (
    ["approved", "paid", "active", "completed", "synced", "resolved", "read", "ok", "on-site", "onsite"].includes(
      s
    )
  ) {
    cls =
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800"
  } else if (
    ["pending", "open", "in_progress", "assigned", "planned", "unread", "live"].includes(s)
  ) {
    cls =
      "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
  } else if (
    ["rejected", "failed", "cancelled", "high", "expired", "low", "off-site", "offsite", "late"].includes(s)
  ) {
    cls =
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900"
  } else if (["unassigned"].includes(s)) {
    cls =
      "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
  }
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}
    >
      {label.replace(/_/g, " ")}
    </span>
  )
}

/** Shell-level status color legend */
export function OpsStatusLegend({ compact }: { compact?: boolean } = {}) {
  const items = [
    { label: "Active / Done", cls: "bg-emerald-500" },
    { label: "Pending / Live", cls: "bg-amber-500" },
    { label: "Risk / Rejected", cls: "bg-red-500" },
    { label: "Neutral", cls: "bg-slate-400" },
  ]
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${
        compact ? "text-[9px]" : "text-[10px]"
      } font-mono uppercase tracking-wide text-slate-400`}
    >
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${i.cls}`} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

/** Dense control-panel table chrome */
export function OpsTableShell({
  title,
  badge,
  tabs,
  activeTab,
  onTabChange,
  footer,
  children,
  stickyHeader,
}: {
  title: string
  badge?: React.ReactNode
  tabs?: { id: string; label: string }[]
  activeTab?: string
  onTabChange?: (id: string) => void
  footer?: React.ReactNode
  children: React.ReactNode
  stickyHeader?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-control-border bg-white shadow-sm dark:border-amber-900/40 dark:bg-control-darkCard">
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
                    ? "bg-white text-amber-700 shadow-sm dark:bg-navy-800 dark:text-amber-300"
                    : "text-slate-500 hover:text-navy-900 dark:hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div
        className={`overflow-x-auto ${stickyHeader ? "max-h-[min(70vh,720px)] overflow-y-auto" : ""}`}
      >
        {children}
      </div>
      {footer && (
        <div className="flex items-center justify-between border-t border-control-border bg-slate-50 px-5 py-2.5 font-mono text-[10px] text-slate-400 dark:border-navy-800 dark:bg-navy-950">
          {footer}
        </div>
      )}
    </div>
  )
}

/** Sticky denser header cells */
export const opsTh =
  "sticky top-0 z-[1] px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap bg-slate-50/95 backdrop-blur-sm dark:bg-navy-950/95 dark:text-slate-400"
export const opsTd = "px-3 py-2.5 text-sm align-middle"

export function OpsFilterChips({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition ${
            value === o.id
              ? "border-amber-600 bg-amber-50 text-amber-800 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-300"
              : "border-slate-200 text-slate-500 hover:border-amber-400 dark:border-navy-700 dark:hover:border-amber-700"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function OpsPagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const to = Math.min(total, safePage * pageSize)

  if (total === 0) return null

  return (
    <div className="flex flex-col gap-2 border-t border-control-border bg-slate-50 px-5 py-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-navy-800 dark:bg-navy-950">
      <span className="font-mono text-[10px] text-slate-400">
        SHOWING {from}–{to} OF {total}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className="h-7 rounded-md border border-slate-200 px-2.5 text-[10px] font-bold uppercase disabled:opacity-40 dark:border-navy-700"
        >
          Prev
        </button>
        <span className="px-2 font-mono text-[10px] font-bold text-navy-900 dark:text-white">
          {safePage} / {totalPages}
        </span>
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          className="h-7 rounded-md border border-slate-200 px-2.5 text-[10px] font-bold uppercase disabled:opacity-40 dark:border-navy-700"
        >
          Next
        </button>
      </div>
    </div>
  )
}

export function useOpsPageSlice<T>(items: T[], pageSize = 10) {
  const [page, setPage] = React.useState(1)
  const list = Array.isArray(items) ? items : []
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize))
  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])
  const slice = list.slice((page - 1) * pageSize, page * pageSize)
  return { page, setPage, pageSize, total: list.length, slice, totalPages }
}

/** Sync a filter string to ?status= (or custom key) in the URL without full navigation */
export function useOpsUrlFilter(key = "status", fallback = "all") {
  const [value, setValue] = React.useState(fallback)

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const sp = new URLSearchParams(window.location.search)
    const fromUrl = sp.get(key)
    if (fromUrl) setValue(fromUrl)
  }, [key])

  const setFilter = React.useCallback(
    (next: string) => {
      setValue(next)
      if (typeof window === "undefined") return
      const url = new URL(window.location.href)
      if (!next || next === fallback) url.searchParams.delete(key)
      else url.searchParams.set(key, next)
      window.history.replaceState({}, "", url.toString())
    },
    [key, fallback]
  )

  return [value, setFilter] as const
}
