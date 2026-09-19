"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import axios from "axios"
import { Building2, CheckCircle2, ClipboardList, Crosshair, UserPlus, X } from "lucide-react"
import { useCompanyWorkspace } from "@/contexts/CompanyWorkspaceContext"

const SKIP_KEY = "tidyflow_ops_onboarding_skip"

type Steps = {
  properties: number
  cleaners: number
  tasks: number
}

function authHeaders() {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function OpsOnboardingCard() {
  const { href } = useCompanyWorkspace()
  const [steps, setSteps] = useState<Steps | null>(null)
  const [hidden, setHidden] = useState(true)

  const load = useCallback(async () => {
    try {
      if (typeof window !== "undefined" && localStorage.getItem(SKIP_KEY) === "1") {
        setHidden(true)
        return
      }
      const res = await axios.get("/api/dashboard/overview", { headers: authHeaders() })
      const stats = res.data?.data?.stats || {}
      const next = {
        properties: Number(stats.totalProperties || 0),
        cleaners: Number(stats.totalCleaners || 0),
        tasks: Number(stats.totalTasks || 0),
      }
      setSteps(next)
      const done = next.properties > 0 && next.cleaners > 0 && next.tasks > 0
      setHidden(done)
    } catch {
      setHidden(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (hidden || !steps) return null

  const items = [
    {
      done: steps.properties > 0,
      label: "Add your first property",
      href: href("properties"),
      icon: Building2,
    },
    {
      done: steps.cleaners > 0,
      label: "Invite a cleaner",
      href: href("team"),
      icon: UserPlus,
    },
    {
      done: steps.tasks > 0,
      label: "Create a job",
      href: `${href("jobs")}?create=1`,
      icon: ClipboardList,
    },
    {
      done: false,
      label: "Open Live monitor",
      href: href("monitor"),
      icon: Crosshair,
      optional: true,
    },
  ]

  const remaining = items.filter((i) => !i.done && !i.optional).length

  return (
    <section className="relative overflow-hidden rounded-xl border border-amber-200 bg-gradient-to-br from-white via-amber-50/80 to-slate-50 p-4 shadow-sm dark:border-amber-900/40 dark:from-navy-950 dark:via-control-darkCard dark:to-navy-950">
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(SKIP_KEY, "1")
          setHidden(true)
        }}
        className="absolute right-2 top-2 rounded-lg p-1.5 text-slate-400 hover:bg-white/80 hover:text-slate-600 dark:hover:bg-navy-900"
        aria-label="Dismiss onboarding"
      >
        <X size={14} />
      </button>
      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
        Get started · {remaining} left
      </p>
      <h2 className="mt-1 text-base font-bold text-navy-900 dark:text-white">
        Set up your operations desk
      </h2>
      <p className="mt-1 max-w-xl text-xs text-slate-500 dark:text-slate-400">
        Property → team → first job → Live monitor. Takes a few minutes.
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition ${
                item.done
                  ? "border-emerald-200 bg-emerald-50/80 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                  : "border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50 dark:border-navy-800 dark:bg-navy-950 dark:hover:border-amber-700/50"
              }`}
            >
              {item.done ? (
                <CheckCircle2 size={16} className="flex-shrink-0 text-emerald-600" />
              ) : (
                <item.icon size={16} className="flex-shrink-0 text-amber-600" />
              )}
              <span className="font-semibold">{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
