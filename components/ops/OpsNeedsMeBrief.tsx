"use client"

import Link from "next/link"
import {
  Sparkles,
  UserX,
  ShieldAlert,
  MapPin,
  FileText,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Zap,
} from "lucide-react"
import { useCompanyWorkspace } from "@/contexts/CompanyWorkspaceContext"

export type NeedsMeItem = {
  id: string
  kind: "assign" | "sos" | "gps" | "invoice" | "issue" | "overdue" | "ok"
  title: string
  detail?: string
  href: string
  count?: number
  urgency: "critical" | "high" | "medium" | "resolved"
  actionLabel?: string
}

const KIND_ICON = {
  assign: UserX,
  sos: ShieldAlert,
  gps: MapPin,
  invoice: FileText,
  issue: AlertCircle,
  overdue: Clock,
  ok: CheckCircle2,
} as const

/**
 * “What needs me?” — urgency-first exception strip. Suggests, never auto-acts.
 */
export default function OpsNeedsMeBrief({
  items,
  loading,
  onAiAssignAll,
  aiAssignBusy,
}: {
  items: NeedsMeItem[]
  loading?: boolean
  onAiAssignAll?: () => void
  aiAssignBusy?: boolean
}) {
  const { href: wsHref } = useCompanyWorkspace()
  const actionable = items.filter((i) => i.kind !== "ok")
  const critical = actionable.filter((i) => i.urgency === "critical")
  const high = actionable.filter((i) => i.urgency === "high")
  const totalUrgent = critical.length + high.length
  const pressure = Math.min(100, actionable.length * 18 + totalUrgent * 12)

  return (
    <section className="overflow-hidden rounded-2xl border border-navy-800/40 bg-navy-950 shadow-lg shadow-navy-950/20 dark:border-amber-900/50">
      {/* Top urgency bar */}
      <div className="h-1 w-full bg-navy-900">
        <div
          className={`h-1 transition-all duration-700 ${
            critical.length > 0
              ? "bg-red-500"
              : high.length > 0
                ? "bg-amber-500"
                : actionable.length > 0
                  ? "bg-sky-500"
                  : "bg-emerald-500"
          }`}
          style={{ width: `${actionable.length === 0 ? 100 : Math.max(8, pressure)}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
              critical.length > 0
                ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/40"
                : high.length > 0
                  ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40"
                  : "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
            }`}
          >
            {actionable.length === 0 ? <CheckCircle2 size={20} /> : <Zap size={20} />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-amber-400">
                What needs me
              </p>
              {!loading && actionable.length > 0 && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                  {actionable.length} open
                </span>
              )}
              {!loading && totalUrgent > 0 && (
                <span className="rounded-full bg-red-500/90 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                  {totalUrgent} urgent
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-medium text-slate-200">
              {loading
                ? "Scanning exceptions…"
                : actionable.length === 0
                  ? "You’re clear — nothing blocking ops right now"
                  : "Tap an item to jump straight to the fix"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onAiAssignAll && actionable.some((i) => i.kind === "assign") && (
            <button
              type="button"
              disabled={aiAssignBusy}
              onClick={onAiAssignAll}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 font-mono text-[10px] font-bold uppercase tracking-wide text-navy-950 shadow-sm hover:bg-amber-400 disabled:opacity-50"
            >
              <Sparkles size={13} />
              {aiAssignBusy ? "Assigning…" : "AI fill unassigned"}
            </button>
          )}
          <Link
            href={wsHref("monitor")}
            className="inline-flex h-9 items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-3 font-mono text-[10px] font-bold uppercase text-slate-200 hover:bg-white/10"
          >
            Live map
          </Link>
          <Link
            href={wsHref("rota")}
            className="inline-flex h-9 items-center gap-1 rounded-xl border border-white/15 px-3 font-mono text-[10px] font-bold uppercase text-slate-200 hover:bg-white/10"
          >
            Rota <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-2 border-t border-white/10 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[88px] animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : actionable.length === 0 ? (
        <div className="flex items-center gap-3 border-t border-white/10 px-5 py-5">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-full rounded-full bg-emerald-500/80" />
          </div>
          <p className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400">
            Healthy
          </p>
        </div>
      ) : (
        <ul className="grid gap-2 border-t border-white/10 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {actionable.map((item, idx) => {
            const Icon = KIND_ICON[item.kind]
            const isCrit = item.urgency === "critical"
            const isHigh = item.urgency === "high"
            return (
              <li key={item.id} style={{ animationDelay: `${idx * 40}ms` }} className="animate-in fade-in">
                <Link
                  href={item.href}
                  className={`group relative flex h-full items-start gap-3 overflow-hidden rounded-xl border p-3.5 transition hover:-translate-y-0.5 hover:shadow-md ${
                    isCrit
                      ? "border-red-400/50 bg-gradient-to-br from-red-500/20 to-red-950/40 hover:border-red-400"
                      : isHigh
                        ? "border-amber-400/40 bg-gradient-to-br from-amber-500/15 to-navy-900 hover:border-amber-400"
                        : "border-white/10 bg-white/5 hover:border-amber-500/50 hover:bg-white/[0.07]"
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      isCrit
                        ? "bg-red-500 text-white shadow-lg shadow-red-500/30"
                        : isHigh
                          ? "bg-amber-500 text-navy-950"
                          : "bg-navy-800 text-amber-300"
                    }`}
                  >
                    <Icon size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-white">{item.title}</p>
                      {item.count != null && item.count > 0 && (
                        <span className="shrink-0 rounded-full bg-black/30 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                          {item.count}
                        </span>
                      )}
                    </div>
                    {item.detail && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-slate-400">
                        {item.detail}
                      </p>
                    )}
                    <p className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wide text-amber-400 group-hover:text-amber-300">
                      {item.actionLabel || "Open"}{" "}
                      <ArrowRight size={10} className="transition group-hover:translate-x-0.5" />
                    </p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** Build brief items from live ops counts — pure helper for dashboard. */
export function buildNeedsMeItems(input: {
  unassignedToday: number
  sosCount: number
  offSiteCount: number
  openIssues: number
  billableGroups: number
  overdueJobs?: number
  wsHref: (page: string) => string
}): NeedsMeItem[] {
  const { wsHref } = input
  const items: NeedsMeItem[] = []

  if (input.sosCount > 0) {
    items.push({
      id: "sos",
      kind: "sos",
      title: "SOS alerts open",
      detail: "Safety first — review and resolve immediately",
      href: `${wsHref("safety")}?tab=sos`,
      count: input.sosCount,
      urgency: "critical",
      actionLabel: "Review SOS",
    })
  }
  if (input.offSiteCount > 0) {
    items.push({
      id: "gps",
      kind: "gps",
      title: "Cleaners off-site",
      detail: "Active job GPS outside geofence",
      href: wsHref("monitor"),
      count: input.offSiteCount,
      urgency: "critical",
      actionLabel: "Open live map",
    })
  }
  if (input.unassignedToday > 0) {
    items.push({
      id: "assign",
      kind: "assign",
      title: "Unassigned today",
      detail: "Use AI assign or open jobs to dispatch",
      href: `${wsHref("jobs")}?status=unassigned`,
      count: input.unassignedToday,
      urgency: "high",
      actionLabel: "Assign now",
    })
  }
  if ((input.overdueJobs || 0) > 0) {
    items.push({
      id: "overdue",
      kind: "overdue",
      title: "Overdue jobs",
      detail: "Scheduled earlier — still open",
      href: `${wsHref("jobs")}?status=overdue`,
      count: input.overdueJobs,
      urgency: "high",
      actionLabel: "Triage",
    })
  }
  if (input.openIssues > 0) {
    items.push({
      id: "issues",
      kind: "issue",
      title: "Open issues",
      detail: "Reported problems awaiting action",
      href: wsHref("issues"),
      count: input.openIssues,
      urgency: "medium",
      actionLabel: "View issues",
    })
  }
  if (input.billableGroups > 0) {
    items.push({
      id: "invoice",
      kind: "invoice",
      title: "Ready to bill",
      detail: "Completed jobs with no open invoice",
      href: `${wsHref("invoices")}?create=1`,
      count: input.billableGroups,
      urgency: "medium",
      actionLabel: "Draft invoices",
    })
  }

  if (items.length === 0) {
    items.push({
      id: "ok",
      kind: "ok",
      title: "All clear",
      href: wsHref("dashboard"),
      urgency: "resolved",
    })
  }

  return items
}
