"use client"

/**
 * Hard lock when company subscription is inactive.
 * Blocks workspace content and sends users to /account/billing.
 */
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import axios from "axios"
import { CreditCard, Lock, Loader2, ShieldAlert } from "lucide-react"

function authHeaders() {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      : null
  const companyId =
    typeof window !== "undefined" ? localStorage.getItem("selectedCompanyId") : null
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (companyId) headers["X-Company-Id"] = companyId
  return headers
}

/** Paths that remain reachable while locked (billing / account / logout flows). */
function isBillingExempt(pathname: string | null) {
  if (!pathname) return false
  return (
    pathname.startsWith("/account") ||
    pathname.startsWith("/subscribe") ||
    pathname.includes("/billing") ||
    pathname.startsWith("/login")
  )
}

export default function SubscriptionLock({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)
  const [locked, setLocked] = useState(false)
  const [statusLabel, setStatusLabel] = useState("")
  const [companyName, setCompanyName] = useState("")

  const check = useCallback(async () => {
    try {
      setChecking(true)
      const res = await axios.get("/api/subscription/status", {
        headers: authHeaders(),
      })
      if (res.data?.success) {
        const data = res.data.data
        const isLocked = !!data?.locked || data?.entitled === false
        setLocked(isLocked)
        setStatusLabel(String(data?.company?.subscriptionStatus || "inactive"))
        setCompanyName(String(data?.company?.name || ""))
      } else {
        // If status endpoint fails with company missing, don't hard-lock platform admins
        setLocked(false)
      }
    } catch (e: any) {
      const msg = String(e?.response?.data?.message || "")
      if (msg.toLowerCase().includes("subscription inactive") || e?.response?.status === 403) {
        setLocked(true)
        setStatusLabel("inactive")
      } else {
        setLocked(false)
      }
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    void check()
  }, [check, pathname])

  if (checking) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Checking subscription…</span>
      </div>
    )
  }

  if (!locked || isBillingExempt(pathname)) {
    return <>{children}</>
  }

  return (
    <div className="relative min-h-[70vh]">
      <div
        className="pointer-events-none select-none blur-[2px] opacity-40"
        aria-hidden
      >
        {children}
      </div>

      <div className="absolute inset-0 z-40 flex items-center justify-center bg-navy-950/55 p-4 backdrop-blur-md dark:bg-navy-950/70">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-amber-500/30 bg-white shadow-2xl dark:border-amber-800/50 dark:bg-control-darkCard">
          <div className="bg-navy-950 px-6 py-5 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
                <Lock size={20} />
              </div>
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  Access locked
                </p>
                <h2 className="text-lg font-extrabold tracking-tight">
                  Subscription inactive
                </h2>
              </div>
            </div>
          </div>

          <div className="space-y-4 px-6 py-5">
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
              <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-600" />
              <p>
                {companyName ? (
                  <>
                    <strong>{companyName}</strong> needs an active plan to use the workspace.
                  </>
                ) : (
                  <>Your company needs an active plan to use the workspace.</>
                )}{" "}
                Status: <span className="font-mono font-bold">{statusLabel || "inactive"}</span>
              </p>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300">
              Renew or choose a plan to unlock properties, jobs, live monitor, chat, and the rest of
              TidyFlow.
            </p>

            <Link
              href="/account/billing"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-600 text-sm font-bold text-white shadow-sm transition hover:bg-amber-700"
            >
              <CreditCard size={16} />
              Go to billing &amp; plans
            </Link>

            <button
              type="button"
              onClick={() => void check()}
              className="w-full text-center text-xs font-semibold text-slate-500 hover:text-amber-700"
            >
              I already renewed — refresh status
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
