"use client"

/**
 * Tiny iframe page hosted on the app domain.
 * Reads local session and postMessages parent (marketing website on another domain).
 */
import { useEffect } from "react"
import { getAdminToken, getCustomerToken } from "@/lib/customer-account"
import { getAppOrigin } from "@/lib/domains"

export default function NavAuthEmbedPage() {
  useEffect(() => {
    const app = getAppOrigin()
    const admin = getAdminToken()
    const customer = getCustomerToken()
    const token = admin || customer
    const portal = admin ? "admin" : customer ? "customer" : null

    const run = async () => {
      if (!token) {
        window.parent?.postMessage(
          {
            source: "tidyflow-nav-auth",
            loggedIn: false,
            label: "Login",
            href: `${app}/login`,
            accountLoginHref: `${app}/account/login`,
          },
          "*"
        )
        return
      }

      try {
        const res = await fetch("/api/public/nav-auth", {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        window.parent?.postMessage(
          {
            source: "tidyflow-nav-auth",
            ...data,
            portal: data.portal || portal,
          },
          "*"
        )
      } catch {
        window.parent?.postMessage(
          {
            source: "tidyflow-nav-auth",
            loggedIn: !!token,
            label: portal === "customer" ? "Go to billing" : "Go to dashboard",
            href: portal === "customer" ? `${app}/account/billing` : `${app}/login`,
            portal,
          },
          "*"
        )
      }
    }

    void run()
  }, [])

  return (
    <html>
      <body style={{ margin: 0, background: "transparent" }} />
    </html>
  )
}
