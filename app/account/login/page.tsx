"use client"

import { useEffect, useState, type CSSProperties } from "react"
import Link from "next/link"
import axios from "axios"
import { SUBSCRIBE_THEME as T } from "@/lib/public-plan-scope"
import GoogleSignInButton from "@/components/GoogleSignInButton"
import { getCustomerToken, storeCustomerSession, clearAdminSession } from "@/lib/customer-account"
import AppDownloadBanner from "@/components/AppDownloadBanner"

const REF_KEY = "tidyflow_referral_code"

/** Standalone customer login / register — not part of admin. */
export default function CustomerAccountLoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [rememberMe, setRememberMe] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [referralCode, setReferralCode] = useState("")

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const ref = (params.get("ref") || params.get("referral") || "").trim().toUpperCase()
      if (ref) {
        localStorage.setItem(REF_KEY, ref)
        setReferralCode(ref)
        setMode("register")
      } else {
        const stored = localStorage.getItem(REF_KEY) || ""
        if (stored) setReferralCode(stored)
      }
    } catch {
      // ignore
    }

    const params = new URLSearchParams(window.location.search)
    const oauthError = params.get("error")
    if (oauthError) setError(oauthError)

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
    setSuccess("")
    setLoading(true)
    try {
      if (mode === "register") {
        const res = await axios.post("/api/auth/register", {
          email,
          password,
          firstName,
          lastName,
          portal: "customer",
          referralCode: referralCode || undefined,
        })
        if (!res.data.success) {
          setError(res.data.message || "Registration failed")
          return
        }
        // Ensure admin cookie is cleared even if register does not set one
        await axios.post("/api/auth/clear-admin-session").catch(() => null)
        try {
          localStorage.removeItem(REF_KEY)
        } catch {
          // ignore
        }
        const token = res.data?.data?.token
        const user = res.data?.data?.user
        if (token && user) {
          finishAuth(token, user)
          return
        }
        setSuccess("Account created. Please sign in.")
        setMode("login")
        setPassword("")
        return
      }

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

  const inputStyle: CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: `1px solid ${T.border}`,
    background: T.surface,
    color: T.ink,
    fontSize: 14,
    outline: "none",
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
              fontWeight: 700,
              letterSpacing: 1.6,
              color: T.amberDeep,
              marginBottom: 8,
            }}
          >
            TIDYFLOW
          </p>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: T.ink, margin: 0 }}>
            {mode === "register" ? "Create your account" : "Customer sign in"}
          </h1>
          <p style={{ marginTop: 8, fontSize: 14, color: T.inkMid, lineHeight: 1.45 }}>
            {mode === "register"
              ? "Create your login, then add company details and choose a plan. Nothing is billed until checkout."
              : "Manage your plan, usage, invoices, and payment."}
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
        {success && (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 14px",
              borderRadius: 12,
              background: "#ECFDF5",
              border: "1px solid #A7F3D0",
              color: "#065F46",
              fontSize: 13,
            }}
          >
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          {mode === "register" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>First name</label>
                  <input
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Last name</label>
                  <input
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
              {referralCode ? (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: T.amberSoft,
                    border: `1px solid ${T.border}`,
                    fontSize: 12,
                    color: T.inkMid,
                  }}
                >
                  Referred by partner code <strong>{referralCode}</strong>
                </div>
              ) : null}
            </>
          )}

          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              placeholder="you@company.com"
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
            />
          </div>

          {mode === "login" && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.inkMid }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              Keep me signed in
            </label>
          )}

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
            {loading
              ? mode === "register"
                ? "Creating…"
                : "Signing in…"
              : mode === "register"
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: T.inkFaint, fontSize: 12 }}>
            <span style={{ flex: 1, height: 1, background: T.border }} />
            or
            <span style={{ flex: 1, height: 1, background: T.border }} />
          </div>
          <GoogleSignInButton
            portal="customer"
            next="/account/billing"
            label={mode === "register" ? "Sign up with Google" : "Sign in with Google"}
          />
        </div>

        <p style={{ marginTop: 18, textAlign: "center", fontSize: 13, color: T.inkMid }}>
          {mode === "login" ? (
            <>
              New customer?{" "}
              <button type="button" onClick={() => setMode("register")} style={linkBtn}>
                Create account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button type="button" onClick={() => setMode("login")} style={linkBtn}>
                Sign in
              </button>
            </>
          )}
        </p>

        <p style={{ marginTop: 14, textAlign: "center", fontSize: 13 }}>
          <Link href="/subscribe" style={{ color: T.amberDeep, fontWeight: 600, textDecoration: "none" }}>
            View plans
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

const linkBtn: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: T.amberDeep,
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
}
