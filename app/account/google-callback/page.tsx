"use client"

import { useEffect, useState } from "react"
import { storeAdminSession, storeCustomerSession } from "@/lib/customer-account"

export default function GoogleCallbackPage() {
  const [error, setError] = useState("")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get("token")
    const portal = params.get("portal") === "admin" ? "admin" : "customer"
    const email = params.get("email") || ""
    const next = params.get("next") || (portal === "admin" ? "/admin/dashboard" : "/account/billing")
    const pay = params.get("pay")
    const trial = params.get("trial") === "1"

    if (!token) {
      setError("Google sign-in did not return a session. Please try again.")
      return
    }

    const user = { email, role: portal === "admin" ? "ADMIN" : "OWNER" }
    if (portal === "admin") {
      storeAdminSession(token, user, true)
      window.location.replace(next)
      return
    }

    storeCustomerSession(token, user, true)
    const dest = new URL(next, window.location.origin)
    if (pay) dest.searchParams.set("pay", pay)
    if (trial) dest.searchParams.set("trial", "1")
    window.location.replace(dest.pathname + dest.search)
  }, [])

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        fontFamily: "system-ui, sans-serif",
        color: "#0B1E36",
      }}
    >
      {error || "Signing you in…"}
    </main>
  )
}
