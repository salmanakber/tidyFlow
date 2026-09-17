"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"
import GoogleSignInButton from "@/components/GoogleSignInButton"
import { configureAdminApiClient } from "@/lib/admin-api-client"
import { getAdminToken, storeAdminSession } from "@/lib/customer-account"
import { resolvePostLoginPath } from "@/lib/post-login-path"
import { buildCompanySlug } from "@/lib/company-slug"

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
        router.push(
          resolvePostLoginPath({
            role: user?.role,
            companyId: user?.companyId || company?.id,
            companyName: company?.name,
            companySlug: company?.slug,
          })
        )
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

        window.location.href = resolvePostLoginPath({
          role: user.role,
          companyId: user.companyId || company?.id,
          companyName: company?.name,
          companySlug: slug,
        })
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
    <div className="min-h-screen flex items-center justify-center bg-control-canvas relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-100/60 via-transparent to-navy-100/40 pointer-events-none" />

      <div className="max-w-md w-full mx-4 relative z-10">
        <div className="bg-white rounded-2xl shadow-xl border border-control-border p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 overflow-hidden shadow-amber-glow bg-gradient-to-br from-amber-500 to-amber-700">
              <img src="/assets/new-icon.png" alt="TidyFlow" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-3xl font-extrabold text-navy-900 tracking-tight">
              Tidy<span className="text-amber-600">Flow</span>
            </h1>
            <p className="text-slate-500 mt-2 text-sm font-medium">
              Sign in to your company workspace
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-2">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500/30 focus:border-amber-600 transition text-slate-900"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-slate-700 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500/30 focus:border-amber-600 transition text-slate-900"
                placeholder="Enter your password"
              />
            </div>

            <div className="flex items-center">
              <input
                id="remember"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 text-amber-600 border-slate-300 rounded focus:ring-amber-500"
              />
              <label htmlFor="remember" className="ml-2 text-sm text-slate-600">
                Remember me
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white py-3 rounded-lg font-bold shadow-amber-glow transition disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-5">
            <div className="flex items-center gap-3 text-xs text-slate-400 mb-4">
              <span className="flex-1 h-px bg-slate-200" />
              or
              <span className="flex-1 h-px bg-slate-200" />
            </div>
            <GoogleSignInButton portal="admin" next="/login" label="Continue with Google" />
          </div>

          <div className="mt-6 text-center text-sm text-slate-600">
            Customer billing account?{" "}
            <a href="/account/login" className="text-amber-700 hover:text-amber-800 font-semibold">
              Sign in here
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
