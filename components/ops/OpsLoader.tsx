"use client"

/**
 * Branded TidyFlow loader — navy/amber orbit with logo mark.
 * Prefer this over plain spinners for page / panel loading.
 */
import React from "react"

export function OpsLoader({
  message = "Loading your workspace…",
  size = "md",
  fullPage,
}: {
  message?: string
  size?: "sm" | "md" | "lg"
  fullPage?: boolean
}) {
  const dim = size === "sm" ? 44 : size === "lg" ? 88 : 64
  const logo = size === "sm" ? 22 : size === "lg" ? 44 : 32

  const body = (
    <div className="flex flex-col items-center justify-center gap-4 px-4 py-10 text-center">
      <div className="relative" style={{ width: dim, height: dim }}>
        {/* Orbit ring */}
        <span
          className="absolute inset-0 rounded-full border-2 border-amber-500/25 border-t-amber-500 animate-spin"
          style={{ animationDuration: "0.9s" }}
        />
        <span
          className="absolute inset-1 rounded-full border border-navy-900/10 border-b-navy-900/40 dark:border-white/10 dark:border-b-amber-300/50"
          style={{ animation: "ops-orbit-reverse 1.4s linear infinite" }}
        />
        {/* Soft glow */}
        <span className="absolute inset-2 rounded-full bg-amber-400/15 blur-md" />
        {/* Brand mark */}
        <span
          className="absolute inset-0 m-auto flex items-center justify-center overflow-hidden rounded-2xl bg-navy-950 shadow-lg shadow-navy-950/25 ring-1 ring-amber-400/40"
          style={{ width: logo + 12, height: logo + 12 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/logot-transparent.png"
            alt=""
            className="object-contain"
            style={{ width: logo, height: logo }}
            onError={(e) => {
              const el = e.currentTarget
              if (!el.src.includes("new-icon.png")) el.src = "/assets/new-icon.png"
            }}
          />
        </span>
        {/* Spark dots */}
        <span className="absolute -right-0.5 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
        <span
          className="absolute -left-0.5 bottom-2 h-1 w-1 animate-pulse rounded-full bg-amber-300"
          style={{ animationDelay: "0.4s" }}
        />
      </div>
      <div>
        <p className="text-sm font-bold tracking-tight text-navy-900 dark:text-white">
          Tidy<span className="text-amber-600">Flow</span>
        </p>
        <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
          {message}
        </p>
      </div>
      <style jsx>{`
        @keyframes ops-orbit-reverse {
          to {
            transform: rotate(-360deg);
          }
        }
      `}</style>
    </div>
  )

  if (fullPage) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">{body}</div>
    )
  }

  return body
}

/** Compact inline brand spinner (buttons / small slots) */
export function OpsSpinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600 ${className}`}
      aria-hidden
    />
  )
}

/** Table / list loading state with brand mark */
export function OpsLoadingPanel({
  message = "Fetching live data…",
  rows = 5,
}: {
  message?: string
  rows?: number
}) {
  return (
    <div className="px-3 py-6">
      <OpsLoader message={message} size="sm" />
      <div className="mx-auto mt-2 max-w-lg animate-pulse space-y-2 opacity-60">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-9 rounded-lg bg-slate-100 dark:bg-navy-900"
            style={{ opacity: 1 - i * 0.12 }}
          />
        ))}
      </div>
    </div>
  )
}
