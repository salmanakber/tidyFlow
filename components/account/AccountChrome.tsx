"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { SUBSCRIBE_THEME as T } from "@/lib/public-plan-scope"
import { clearCustomerSession } from "@/lib/customer-account"
import AppDownloadBanner from "@/components/AppDownloadBanner"
import { ghostBtn } from "@/components/account/accountUi"

type AccountPage = "billing" | "settings"

export default function AccountChrome({
  title,
  subtitle,
  active,
  extraActions,
  children,
}: {
  title: string
  subtitle?: string
  active: AccountPage
  extraActions?: ReactNode
  children: ReactNode
}) {
  const signOut = () => {
    clearCustomerSession()
    window.location.href = "/account/login"
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: `radial-gradient(1000px 400px at 50% 0%, ${T.amberSoft} 0%, transparent 100%), ${T.canvas}`,
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        padding: "32px 16px 120px",
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <header
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: T.amberDeep, margin: 0 }}>
              TIDYFLOW CUSTOMER
            </p>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: T.ink, margin: "6px 0 0" }}>{title}</h1>
            {subtitle ? (
              <p style={{ margin: "8px 0 0", fontSize: 14, color: T.inkMid }}>{subtitle}</p>
            ) : null}
            <nav style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <NavLink href="/account/billing" label="Dashboard" current={active === "billing"} />
              <NavLink href="/account/settings" label="Settings" current={active === "settings"} />
            </nav>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {extraActions}
            <button type="button" onClick={signOut} style={ghostBtn}>
              Sign out
            </button>
          </div>
        </header>
        {children}
      </div>
      <AppDownloadBanner variant="sticky" />
    </main>
  )
}

function NavLink({ href, label, current }: { href: string; label: string; current: boolean }) {
  return (
    <Link
      href={href}
      style={{
        textDecoration: "none",
        fontSize: 13,
        fontWeight: 700,
        padding: "7px 12px",
        borderRadius: 999,
        border: `1px solid ${current ? T.navy : T.border}`,
        background: current ? T.navy : T.surface,
        color: current ? "#fff" : T.inkMid,
      }}
    >
      {label}
    </Link>
  )
}
