"use client"

import { useEffect, useState, type CSSProperties } from "react"
import axios from "axios"
import Link from "next/link"

const T = {
  navy: "#0B1E36",
  amber: "#D97706",
  canvas: "#F7F4EE",
  surface: "#fff",
  ink: "#0B1E36",
  inkMid: "#4A5D73",
  border: "#E6E0D6",
}

const TOKEN_KEY = "partnerAuthToken"
const USER_KEY = "partnerUserData"

export default function PartnerLoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY)
    if (token) window.location.href = "/partner/dashboard"
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const res = await axios.post("/api/partner/login", { email, password })
      if (!res.data.success) throw new Error(res.data.message)
      const { token, partner } = res.data.data
      localStorage.setItem(TOKEN_KEY, token)
      localStorage.setItem(USER_KEY, JSON.stringify(partner))
      // Ensure admin session is not active
      localStorage.removeItem("authToken")
      sessionStorage.removeItem("authToken")
      window.location.href = "/partner/dashboard"
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Login failed")
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
        background: T.canvas,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 20,
          padding: 28,
          boxShadow: "0 16px 40px rgba(11,30,54,0.08)",
        }}
      >
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: 1.4, color: T.amber }}>
          TIDYFLOW PARTNER PORTAL
        </p>
        <h1 style={{ margin: "8px 0 0", fontSize: 26, color: T.ink }}>Sign in</h1>
        <p style={{ marginTop: 8, fontSize: 14, color: T.inkMid, lineHeight: 1.45 }}>
          For marketing partners and investors. This is separate from the admin console and customer billing.
        </p>

        {error && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 12,
              background: "#FEF2F2",
              color: "#991B1B",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 20 }}>
          <label style={label}>
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={input}
            />
          </label>
          <label style={label}>
            Password
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={input}
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              border: "none",
              borderRadius: 12,
              padding: "12px 16px",
              background: T.navy,
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p style={{ marginTop: 18, fontSize: 12, color: T.inkMid, textAlign: "center" }}>
          Admin? <Link href="/login">Admin login</Link>
        </p>
      </div>
    </main>
  )
}

const label: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  fontWeight: 600,
  color: T.inkMid,
}

const input: CSSProperties = {
  border: `1px solid ${T.border}`,
  borderRadius: 10,
  padding: "11px 12px",
  fontSize: 14,
  color: T.ink,
}
