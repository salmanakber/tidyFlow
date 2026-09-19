"use client"

/**
 * Premium form / drawer primitives for ops create & edit flows.
 * Matches JobInspector navy/amber chrome.
 */
import React, { useEffect } from "react"
import { X } from "lucide-react"

export const opsFieldCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-navy-900 outline-none transition placeholder:text-slate-400 focus:border-amber-600 focus:ring-2 focus:ring-amber-600/15 dark:border-navy-800 dark:bg-navy-950 dark:text-slate-100"

export function OpsField({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
        {required ? <span className="text-amber-600"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="block text-[11px] text-slate-400">{hint}</span> : null}
    </label>
  )
}

export function OpsSecondaryButton({
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
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 transition hover:border-amber-300 hover:bg-amber-50 disabled:opacity-50 dark:border-navy-800 dark:bg-navy-950 dark:text-slate-200 dark:hover:border-amber-700/50"
    >
      {children}
    </button>
  )
}

export function OpsRowAction({
  children,
  onClick,
  disabled,
  tone = "neutral",
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  tone?: "neutral" | "amber" | "emerald" | "danger"
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
      : tone === "amber"
        ? "text-amber-800 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
        : tone === "danger"
          ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-900"
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition disabled:opacity-50 ${toneCls}`}
    >
      {children}
    </button>
  )
}

export function OpsDrawer({
  open,
  onClose,
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  eyebrow?: string
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <button
        type="button"
        aria-label="Close drawer"
        className="fixed inset-0 z-[60] bg-navy-950/55 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-[70] flex w-full flex-col border-l border-amber-900/20 bg-white shadow-2xl dark:border-amber-900/40 dark:bg-control-darkCard ${
          wide ? "sm:max-w-xl sm:w-[36rem]" : "sm:max-w-md sm:w-[28rem]"
        }`}
        role="dialog"
        aria-modal
      >
        <header className="flex-shrink-0 border-b border-amber-900/20 bg-navy-950 px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {eyebrow ? (
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-amber-400">
                  {eyebrow}
                </p>
              ) : null}
              <h2 className="mt-1 truncate text-lg font-extrabold tracking-tight">{title}</h2>
              {subtitle ? (
                <p className="mt-1 text-xs text-slate-300">{subtitle}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? (
          <footer className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2 border-t border-control-border bg-slate-50/90 px-5 py-3.5 dark:border-navy-800 dark:bg-navy-950/80">
            {footer}
          </footer>
        ) : null}
      </aside>
    </>
  )
}

export function OpsSelectCard({
  selected,
  onClick,
  title,
  meta,
  trailing,
}: {
  selected: boolean
  onClick: () => void
  title: string
  meta?: string
  trailing?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
        selected
          ? "border-amber-500 bg-amber-50 shadow-sm dark:border-amber-600 dark:bg-amber-950/30"
          : "border-slate-200 bg-white hover:border-amber-300 dark:border-navy-800 dark:bg-navy-950 dark:hover:border-amber-700/40"
      }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
          selected
            ? "border-amber-600 bg-amber-600 text-white"
            : "border-slate-300 bg-white dark:border-navy-700"
        }`}
      >
        {selected ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-navy-900 dark:text-white">{title}</span>
        {meta ? (
          <span className="mt-0.5 block truncate text-xs text-slate-500">{meta}</span>
        ) : null}
      </span>
      {trailing}
    </button>
  )
}

/** Premium date / datetime field shell */
export function OpsDateField({
  label,
  required,
  type = "date",
  value,
  onChange,
  hint,
}: {
  label: string
  required?: boolean
  type?: "date" | "datetime-local" | "time"
  value: string
  onChange: (v: string) => void
  hint?: string
}) {
  return (
    <OpsField label={label} required={required} hint={hint}>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className={`${opsFieldCls} pr-3 font-medium [color-scheme:light] dark:[color-scheme:dark]`}
        />
      </div>
    </OpsField>
  )
}
