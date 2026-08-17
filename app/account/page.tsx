"use client"

import { useEffect } from "react"
import { getCustomerToken } from "@/lib/customer-account"

/** Customer account hub — routes to billing or login. */
export default function AccountIndexPage() {
  useEffect(() => {
    const token = getCustomerToken()
    window.location.replace(token ? "/account/billing" : "/account/login")
  }, [])

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        color: "#4A5D73",
      }}
    >
      Redirecting…
    </main>
  )
}
