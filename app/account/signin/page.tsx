"use client"

import { useEffect, useState, type CSSProperties } from "react"
import Link from "next/link"
import axios from "axios"
import { SUBSCRIBE_THEME as T } from "@/lib/public-plan-scope"
import GoogleSignInButton from "@/components/GoogleSignInButton"
import { getCustomerToken, storeCustomerSession, clearAdminSession } from "@/lib/customer-account"
import AppDownloadBanner from "@/components/AppDownloadBanner"

/** Existing customer billing sign-in (plan, invoices, payment). */
export default function CustomerAccountSignInPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const oauthError = params.get("error")
    if (oauthError) {
      setError(
        oauthError === "google_not_configured"
          ? "Google sign-in is not configured yet. Please use email."
          : decodeURIComponent(oauthError.replace(/\+/g, " "))
      )
    }

    const token = getCustomerToken()
    if (token) {
      clearAdminSession()
      void axios.post("/api/auth/clear-admin-session").catch(() => null)
      window.location.href = "/account/billing"
    }
  }, [])

  const finishAuth = (token: string, user: any) => {
    storeCustomerSession(token, user, rememberMe)
    window.location.href = "/account/billing"
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await axios.post("/api/auth/login", {
        email,
        password,
        portal: "customer",
      })
      if (!res.data.success) {
        setError(res.data.message || "Login failed")
        return
      }
      await axios.post("/api/auth/clear-admin-session").catch(() => null)
      const { token, user } = res.data.data
      finishAuth(token, user)
    } catch (err: any) {
      setError(err.response?.data?.message || "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: `radial-gradient(900px 380px at 50% -10%, ${T.amberSoft}, transparent 55%), ${T.canvas}`,
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: T.surface,
          borderRadius: 20,
          border: `1px solid ${T.border}`,
          boxShadow: "0 20px 50px rgba(11,30,54,0.08)",
          padding: 28,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 1.6,
              color: T.amberDeep,
              marginBottom: 8,
            }}
          >
            TIDYFLOW BILLING
          </p>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: T.ink, margin: 0 }}>
            Customer sign in
          </h1>
          <p style={{ marginTop: 8, fontSize: 14, color: T.inkMid, lineHeight: 1.45 }}>
            Manage your plan, usage, invoices, and payment.
          </p>
        </div>

        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 14px",
              borderRadius: 12,
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              color: "#991B1B",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              placeholder="you@company.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              placeholder="Enter password"
              autoComplete="current-password"
            />
          </div>

          <label
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.inkMid }}
          >
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            Keep me signed in
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              border: "none",
              borderRadius: 12,
              padding: "13px 16px",
              background: T.navy,
              color: "#fff",
              fontWeight: 700,
              fontSize: 15,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          <div
            style={{ display: "flex", alignItems: "center", gap: 10, color: T.inkFaint, fontSize: 12 }}
          >
            <span style={{ flex: 1, height: 1, background: T.border }} />
            or
            <span style={{ flex: 1, height: 1, background: T.border }} />
          </div>
          <GoogleSignInButton
            portal="customer"
            next="/account/billing"
            label="Sign in with Google"
          />
        </div>

        <p style={{ marginTop: 18, textAlign: "center", fontSize: 13, color: T.inkMid }}>
          New customer?{" "}
          <Link href="/account/login" style={linkStyle}>
            Create account
          </Link>
        </p>

        <p style={{ marginTop: 10, textAlign: "center", fontSize: 13, color: T.inkMid }}>
          Company workspace?{" "}
          <Link href="/login" style={linkStyle}>
            Ops sign in
          </Link>
        </p>

        <AppDownloadBanner variant="compact" />
      </div>
    </main>
  )
}

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: T.inkMid,
  marginBottom: 6,
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: `1px solid ${T.border}`,
  background: T.surface,
  color: T.ink,
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
}

const linkStyle: CSSProperties = {
  color: T.amberDeep,
  fontWeight: 700,
  textDecoration: "none",
}
