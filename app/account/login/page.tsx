"use client"

import { useEffect, useState, type CSSProperties } from "react"
import Link from "next/link"
import axios from "axios"
import { SUBSCRIBE_THEME as T } from "@/lib/public-plan-scope"
import GoogleSignInButton from "@/components/GoogleSignInButton"
import { getCustomerToken, storeCustomerSession, clearAdminSession } from "@/lib/customer-account"
import AppDownloadBanner from "@/components/AppDownloadBanner"

const REF_KEY = "tidyflow_referral_code"

/**
 * Customer registration only.
 * Existing customers sign in at /account/signin (billing) or /login (workspace).
 */
export default function CustomerAccountRegisterPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [rememberMe, setRememberMe] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [referralCode, setReferralCode] = useState("")

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      // Legacy login links → billing sign-in
      if (params.get("mode") === "login" || params.get("signin") === "1") {
        window.location.replace(`/account/signin${window.location.search}`)
        return
      }

      const ref = (params.get("ref") || params.get("referral") || "").trim().toUpperCase()
      if (ref) {
        localStorage.setItem(REF_KEY, ref)
        setReferralCode(ref)
      } else {
        const stored = localStorage.getItem(REF_KEY) || ""
        if (stored) setReferralCode(stored)
      }
    } catch {
      // ignore
    }

    const params = new URLSearchParams(window.location.search)
    const oauthError = params.get("error")
    if (oauthError) {
      setError(
        oauthError === "google_not_configured"
          ? "Google sign-up is not configured yet. Please use email."
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
      const res = await axios.post("/api/auth/register", {
        email,
        password,
        firstName,
        lastName,
        companyName: companyName.trim() || undefined,
        portal: "customer",
        referralCode: referralCode || undefined,
      })
      if (!res.data.success) {
        setError(res.data.message || "Registration failed")
        return
      }
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
      setError("Account created, but sign-in failed. Please sign in.")
      window.location.href = "/account/signin"
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
        background: T.canvas,
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `
            radial-gradient(720px 360px at 12% -8%, ${T.amberGlow}, transparent 55%),
            radial-gradient(640px 400px at 100% 100%, rgba(11,30,54,0.08), transparent 50%)
          `,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 1080,
          margin: "0 auto",
          minHeight: "100vh",
          display: "grid",
          gridTemplateColumns: "1fr",
          alignItems: "center",
          gap: 40,
          padding: "40px 20px",
        }}
        className="account-register-grid"
      >
        <style>{`
          @media (min-width: 900px) {
            .account-register-grid {
              grid-template-columns: 1fr 1fr !important;
              gap: 56px !important;
              padding: 48px 32px !important;
            }
            .account-register-hero { display: block !important; }
          }
        `}</style>

        <section className="account-register-hero" style={{ display: "none" }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: T.amberDeep,
              marginBottom: 14,
            }}
          >
            Start free · TidyFlow
          </p>
          <h1
            style={{
              fontSize: "clamp(28px, 3.2vw, 42px)",
              fontWeight: 900,
              letterSpacing: "-0.03em",
              color: T.ink,
              lineHeight: 1.12,
              margin: 0,
              maxWidth: 440,
            }}
          >
            Create your cleaning ops account in minutes.
          </h1>
          <p
            style={{
              marginTop: 16,
              fontSize: 16,
              lineHeight: 1.55,
              color: T.inkMid,
              maxWidth: 420,
            }}
          >
            Set up billing, invite your team, and run jobs from the same account you use in the
            mobile app. Nothing is charged until you pick a plan at checkout.
          </p>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "28px 0 0",
              display: "grid",
              gap: 12,
            }}
          >
            {[
              "Owner account ready for billing & plan changes",
              "Same login for web and the iPhone / Android app",
              "Google sign-up supported",
            ].map((item) => (
              <li
                key={item}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  fontSize: 14,
                  color: T.inkMid,
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    background: T.amberSoft,
                    color: T.amberDeep,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 32, maxWidth: 380 }}>
            <AppDownloadBanner variant="compact" />
          </div>
        </section>

        <section style={{ width: "100%", maxWidth: 460, margin: "0 auto" }}>
          <div
            style={{
              background: T.surface,
              borderRadius: 24,
              border: `1px solid ${T.border}`,
              boxShadow: "0 28px 70px rgba(11,30,54,0.10)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                background: T.navy,
                padding: "22px 24px",
                color: "#fff",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: T.amber,
                }}
              >
                New customer
              </p>
              <h2 style={{ margin: "8px 0 0", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>
                Create your account
              </h2>
              <p style={{ margin: "8px 0 0", fontSize: 13, color: "rgba(255,255,255,0.72)", lineHeight: 1.45 }}>
                Then choose a plan and manage invoices from your billing dashboard.
              </p>
            </div>

            <div style={{ padding: "24px 24px 28px" }}>
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

              {referralCode ? (
                <div
                  style={{
                    marginBottom: 16,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: T.amberSoft,
                    border: `1px solid ${T.border}`,
                    fontSize: 12,
                    color: T.inkMid,
                  }}
                >
                  Partner referral applied: <strong>{referralCode}</strong>
                </div>
              ) : null}

              <div style={{ display: "grid", gap: 12, marginBottom: 18 }}>
                <GoogleSignInButton
                  portal="customer"
                  next="/account/billing"
                  label="Sign up with Google"
                />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    color: T.inkFaint,
                    fontSize: 12,
                  }}
                >
                  <span style={{ flex: 1, height: 1, background: T.border }} />
                  or use email
                  <span style={{ flex: 1, height: 1, background: T.border }} />
                </div>
              </div>

              <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={labelStyle}>First name</label>
                    <input
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      style={inputStyle}
                      placeholder="Alex"
                      autoComplete="given-name"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Last name</label>
                    <input
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      style={inputStyle}
                      placeholder="Rivera"
                      autoComplete="family-name"
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>
                    Company name <span style={{ fontWeight: 500, color: T.inkFaint }}>(optional)</span>
                  </label>
                  <input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    style={inputStyle}
                    placeholder="Your cleaning company"
                    autoComplete="organization"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Work email</label>
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
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={inputStyle}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                </div>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    color: T.inkMid,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  Keep me signed in after signup
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    marginTop: 4,
                    border: "none",
                    borderRadius: 12,
                    padding: "14px 16px",
                    background: T.amberDeep,
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: 15,
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.7 : 1,
                    boxShadow: "0 10px 24px rgba(217,119,6,0.28)",
                  }}
                >
                  {loading ? "Creating account…" : "Create account"}
                </button>
              </form>

              <p
                style={{
                  marginTop: 18,
                  textAlign: "center",
                  fontSize: 13,
                  color: T.inkMid,
                  lineHeight: 1.5,
                }}
              >
                Already have an account?{" "}
                <Link href="/account/signin" style={linkStyle}>
                  Sign in to billing
                </Link>
                {" · "}
                <Link href="/login" style={linkStyle}>
                  Workspace login
                </Link>
              </p>

              <p style={{ marginTop: 12, textAlign: "center", fontSize: 13 }}>
                <Link href="/subscribe" style={{ ...linkStyle, color: T.amberDeep }}>
                  View plans
                </Link>
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
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
  color: T.navy,
  fontWeight: 700,
  textDecoration: "none",
}
