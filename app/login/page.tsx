"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"
import Link from "next/link"
import GoogleSignInButton from "@/components/GoogleSignInButton"
import AppDownloadBanner from "@/components/AppDownloadBanner"
import { configureAdminApiClient } from "@/lib/admin-api-client"
import {
  CUSTOMER_TOKEN_KEY,
  CUSTOMER_USER_KEY,
  getAdminToken,
  storeAdminSession,
} from "@/lib/customer-account"
import { companyNeedsPlan, resolvePostLoginPath } from "@/lib/post-login-path"
import { buildCompanySlug } from "@/lib/company-slug"

/** Mirror admin session into customer keys so /account/billing APIs work. */
function unlockBillingSession(token: string, user: unknown, rememberMe: boolean) {
  if (rememberMe) {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, token)
    localStorage.setItem(CUSTOMER_USER_KEY, JSON.stringify(user))
    sessionStorage.removeItem(CUSTOMER_TOKEN_KEY)
    sessionStorage.removeItem(CUSTOMER_USER_KEY)
  } else {
    sessionStorage.setItem(CUSTOMER_TOKEN_KEY, token)
    sessionStorage.setItem(CUSTOMER_USER_KEY, JSON.stringify(user))
    localStorage.removeItem(CUSTOMER_TOKEN_KEY)
    localStorage.removeItem(CUSTOMER_USER_KEY)
  }
}

function planFieldsFromCompany(company: any, meNeedsPlan?: boolean | null) {
  return {
    subscriptionStatus: company?.subscriptionStatus ?? null,
    planTier: company?.planTier ?? null,
    isTrialActive: company?.isTrialActive ?? null,
    trialEndsAt: company?.trialEndsAt ?? null,
    needsPlan: typeof meNeedsPlan === "boolean" ? meNeedsPlan : company?.needsPlan ?? null,
  }
}

/** Company owner / manager sign-in (platform admins also use this). Customers: /account/login */
export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [rememberMe, setRememberMe] = useState(false)

  useEffect(() => {
    configureAdminApiClient()
    const token = getAdminToken()
    if (!token) return

    axios
      .get("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.data?.success) return
        const user = res.data.data.user
        const company = res.data.data.company
        const needsPlan =
          typeof res.data.data?.needsPlan === "boolean"
            ? res.data.data.needsPlan
            : typeof company?.needsPlan === "boolean"
              ? company.needsPlan
              : companyNeedsPlan(planFieldsFromCompany(company))

        const path = resolvePostLoginPath({
          role: user?.role,
          companyId: user?.companyId || company?.id,
          companyName: company?.name,
          companySlug: company?.slug,
          ...planFieldsFromCompany(company, needsPlan),
        })

        if (path === "/account/billing") {
          unlockBillingSession(token, user, true)
        }
        router.push(path)
      })
      .catch(() => {})
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const response = await axios.post("/api/auth/login", {
        email,
        password,
      })

      if (response.data.success) {
        const { token, user, company } = response.data.data
        storeAdminSession(token, user, rememberMe)

        const slug =
          company?.slug ||
          (user.companyId
            ? buildCompanySlug({ id: user.companyId, name: company?.name })
            : null)

        if (company?.id) {
          localStorage.setItem("selectedCompanyId", String(company.id))
        }

        let plan = planFieldsFromCompany(company)
        const hasPlanSignal =
          plan.subscriptionStatus != null ||
          plan.planTier != null ||
          plan.isTrialActive != null ||
          plan.trialEndsAt != null ||
          typeof plan.needsPlan === "boolean"

        if (!hasPlanSignal) {
          try {
            const me = await axios.get("/api/auth/me", {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (me.data?.success) {
              const meCompany = me.data.data?.company
              const meNeeds =
                typeof me.data.data?.needsPlan === "boolean"
                  ? me.data.data.needsPlan
                  : meCompany?.needsPlan
              plan = planFieldsFromCompany(meCompany || company, meNeeds)
            }
          } catch {
            /* proceed with login company fields */
          }
        }

        const path = resolvePostLoginPath({
          role: user.role,
          companyId: user.companyId || company?.id,
          companyName: company?.name,
          companySlug: slug,
          ...plan,
        })

        if (path === "/account/billing") {
          unlockBillingSession(token, user, rememberMe)
        }

        window.location.href = path
      } else {
        setError(response.data.message || "Login failed")
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "An error occurred during login")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#F7F4EF]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-amber-300/30 blur-3xl" />
        <div className="absolute -right-16 bottom-0 h-96 w-96 rounded-full bg-navy-900/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.55),transparent_40%)]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-4 py-10 lg:grid lg:grid-cols-2 lg:items-center lg:gap-12 lg:px-8">
        <div className="mb-8 hidden lg:mb-0 lg:block">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-amber-700">
            Operations workspace
          </p>
          <h1 className="mt-3 max-w-md text-4xl font-black tracking-tight text-navy-950 xl:text-5xl">
            Run jobs, team &amp; live GPS in one place.
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-slate-600">
            Sign in to dispatch cleaners, approve hours, and manage your company — the same ops
            stack your mobile team already uses.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 text-xs font-semibold text-slate-500">
            <span className="rounded-full border border-amber-200 bg-white/80 px-3 py-1.5">
              Smart assign
            </span>
            <span className="rounded-full border border-amber-200 bg-white/80 px-3 py-1.5">
              Live tracking
            </span>
            <span className="rounded-full border border-amber-200 bg-white/80 px-3 py-1.5">
              Payroll &amp; invoices
            </span>
          </div>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div className="overflow-hidden rounded-3xl border border-white/70 bg-white/90 shadow-[0_30px_80px_rgba(15,39,68,0.12)] backdrop-blur">
            <div className="border-b border-slate-100 bg-navy-950 px-6 py-5 text-white">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white/10 ring-1 ring-amber-400/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/assets/logot-transparent.png"
                    alt="TidyFlow"
                    className="h-10 w-10 object-contain"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).src = "/assets/new-icon.png"
                    }}
                  />
                </div>
                <div>
                  <p className="text-lg font-black tracking-tight">
                    Tidy<span className="text-amber-400">Flow</span>
                  </p>
                  <p className="text-xs text-slate-300">Company workspace sign-in</p>
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-8">
              {error && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Email
                  </span>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-navy-900 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20"
                    placeholder="you@company.com"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Password
                  </span>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-navy-900 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20"
                    placeholder="Enter your password"
                  />
                </label>

                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    id="remember"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  />
                  Remember me
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-amber-600 py-3.5 text-sm font-bold text-white shadow-amber-glow transition hover:bg-amber-700 disabled:opacity-50"
                >
                  {loading ? "Signing in…" : "Sign in to workspace"}
                </button>
              </form>

              <div className="mt-5">
                <div className="mb-4 flex items-center gap-3 text-xs text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" />
                  or
                  <span className="h-px flex-1 bg-slate-200" />
                </div>
                <GoogleSignInButton portal="admin" next="/login" label="Continue with Google" />
              </div>

              <AppDownloadBanner variant="compact" />

              <div className="mt-6 space-y-2 text-center text-sm text-slate-600">
                <p>
                  Managing subscription only?{" "}
                  <Link href="/account/login" className="font-bold text-amber-700 hover:text-amber-800">
                    Billing login
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
