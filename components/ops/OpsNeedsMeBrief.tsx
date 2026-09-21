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

const URGENCY_RING: Record<NeedsMeItem["urgency"], string> = {
  critical: "border-red-300 bg-red-50/90 dark:border-red-900/50 dark:bg-red-950/30",
  high: "border-amber-300 bg-amber-50/90 dark:border-amber-900/40 dark:bg-amber-950/20",
  medium: "border-slate-200 bg-white dark:border-navy-800 dark:bg-navy-950",
  resolved: "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/40 dark:bg-emerald-950/20",
}

/**
 * “What needs me?” — one tap per real exception. Suggests, never auto-acts.
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
  const critical = actionable.filter((i) => i.urgency === "critical" || i.urgency === "high")

  return (
    <section className="overflow-hidden rounded-xl border border-navy-200/80 bg-gradient-to-br from-navy-950 via-navy-900 to-navy-950 text-white shadow-sm dark:border-amber-900/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400">
            <Sparkles size={12} /> What needs me
          </p>
          <p className="mt-0.5 text-sm text-slate-300">
            {loading
              ? "Scanning exceptions…"
              : actionable.length === 0
                ? "All clear — nothing blocking you right now"
                : `${actionable.length} item${actionable.length === 1 ? "" : "s"} · ${critical.length} urgent`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onAiAssignAll && actionable.some((i) => i.kind === "assign") && (
            <button
              type="button"
              disabled={aiAssignBusy}
              onClick={onAiAssignAll}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-500 px-3 font-mono text-[10px] font-bold uppercase text-navy-950 hover:bg-amber-400 disabled:opacity-50"
            >
              <Sparkles size={12} />
              {aiAssignBusy ? "Assigning…" : "AI fill unassigned"}
            </button>
          )}
          <Link
            href={wsHref("rota")}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/20 px-3 font-mono text-[10px] font-bold uppercase text-slate-200 hover:bg-white/10"
          >
            Rota <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg bg-white/5"
            />
          ))}
        </div>
      ) : actionable.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
            <CheckCircle2 size={20} />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">Queue healthy</p>
            <p className="text-xs text-slate-400">
              No SOS, off-site flags, or unassigned jobs needing you.
            </p>
          </div>
        </div>
      ) : (
        <ul className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {items
            .filter((i) => i.kind !== "ok")
            .map((item) => {
              const Icon = KIND_ICON[item.kind]
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className={`group flex h-full items-start gap-3 rounded-lg border p-3 text-left transition hover:ring-2 hover:ring-amber-500/40 ${URGENCY_RING[item.urgency]}`}
                  >
                    <span
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        item.urgency === "critical"
                          ? "bg-red-600 text-white"
                          : item.urgency === "high"
                            ? "bg-amber-600 text-white"
                            : "bg-navy-950 text-amber-300 dark:bg-navy-900"
                      }`}
                    >
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-navy-950 dark:text-white">
                          {item.title}
                        </p>
                        {item.count != null && item.count > 0 && (
                          <span className="shrink-0 rounded-full bg-navy-950 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300 dark:bg-black/40">
                            {item.count}
                          </span>
                        )}
                      </div>
                      {item.detail && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-600 dark:text-slate-400">
                          {item.detail}
                        </p>
                      )}
                      <p className="mt-1.5 inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wide text-amber-700 group-hover:text-amber-600 dark:text-amber-400">
                        {item.actionLabel || "Open"} <ArrowRight size={10} />
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
