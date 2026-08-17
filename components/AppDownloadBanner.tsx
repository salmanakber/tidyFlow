"use client"

import type { ReactNode } from "react"
import { getAndroidPlayStoreUrl, getIosAppStoreUrl } from "@/lib/app-store-links"
import { SUBSCRIBE_THEME as T } from "@/lib/public-plan-scope"

type Variant = "hero" | "compact" | "sticky"

function AppleIcon() {
  return (
    <svg width="18" height="22" viewBox="0 0 18 22" fill="currentColor" aria-hidden>
      <path d="M14.7 11.6c0-2.5 2-3.7 2.1-3.8-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.6.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-3.9 2.5-1.7 2.9-.4 7.2 1.2 9.6.8 1.1 1.7 2.4 3 2.4 1.2 0 1.6-.8 3.1-.8s1.8.8 3.2.8c1.3 0 2.1-1.1 2.9-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.6-3.9zM12.4 3.8c.7-.8 1.1-2 1-3.1-1 .1-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.5 2.9-1.4z" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="18" height="20" viewBox="0 0 18 20" aria-hidden>
      <path fill="#34A853" d="M.8 1.2v17.6L10.2 10 .8 1.2z" />
      <path fill="#FBBC04" d="M13.1 7.1 3.3.4.8 1.2 10.2 10l2.9-2.9z" />
      <path fill="#4285F4" d="M.8 18.8 10.2 10l2.9 2.9-7.1 6.7-5.2-.8z" />
      <path fill="#EA4335" d="M17.2 8.8c.5.4.8 1 .8 1.7s-.3 1.3-.8 1.7l-4.1 2.4-2.9-2.9 2.9-2.9 4.1 0z" />
    </svg>
  )
}

function StoreButton({
  href,
  kicker,
  title,
  icon,
  dark,
}: {
  href: string
  kicker: string
  title: string
  icon: ReactNode
  dark?: boolean
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        minWidth: 168,
        padding: "10px 16px",
        borderRadius: 12,
        textDecoration: "none",
        background: dark ? "rgba(255,255,255,0.1)" : T.navy,
        border: dark ? "1px solid rgba(255,255,255,0.22)" : `1px solid ${T.navy}`,
        color: "#fff",
        boxShadow: dark ? "none" : "0 8px 18px rgba(11,30,54,0.18)",
      }}
    >
      <span style={{ display: "flex", width: 22, justifyContent: "center" }}>{icon}</span>
      <span style={{ display: "grid", lineHeight: 1.1, textAlign: "left" }}>
        <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.8 }}>{kicker}</span>
        <span style={{ fontSize: 15, fontWeight: 800 }}>{title}</span>
      </span>
    </a>
  )
}

export default function AppDownloadBanner({ variant = "hero" }: { variant?: Variant }) {
  const ios = getIosAppStoreUrl()
  const android = getAndroidPlayStoreUrl()
  const dark = variant === "hero" || variant === "sticky"

  const buttons = (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        justifyContent: variant === "compact" ? "center" : "flex-start",
      }}
    >
      <StoreButton href={ios} kicker="Download on the" title="App Store" icon={<AppleIcon />} dark={dark} />
      <StoreButton href={android} kicker="Get it on" title="Google Play" icon={<PlayIcon />} dark={dark} />
    </div>
  )

  if (variant === "sticky") {
    return (
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 40,
          background: T.navyDeep,
          borderTop: "1px solid rgba(245,158,11,0.35)",
          boxShadow: "0 -12px 28px rgba(6,21,37,0.28)",
          padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: 1.2, color: T.amber }}>
              GET THE APP
            </p>
            <p style={{ margin: "4px 0 0", color: "rgba(255,255,255,0.86)", fontSize: 14, fontWeight: 600 }}>
              Run jobs, photos, and rota from your phone
            </p>
          </div>
          {buttons}
        </div>
      </div>
    )
  }

  if (variant === "compact") {
    return (
      <div
        style={{
          marginTop: 18,
          padding: 16,
          borderRadius: 16,
          border: `1px solid ${T.border}`,
          background: T.canvas,
          textAlign: "center",
        }}
      >
        <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 800, letterSpacing: 1, color: T.amberDeep }}>
          TIDYFLOW APP
        </p>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: T.inkMid }}>
          Download for iPhone and Android, then sign in with this email
        </p>
        {buttons}
      </div>
    )
  }

  return (
    <div
      style={{
        margin: "0 0 18px",
        padding: "22px 20px",
        borderRadius: 18,
        background: `linear-gradient(135deg, ${T.navyDeep} 0%, ${T.navyMid} 58%, #1d3b5c 100%)`,
        color: "#fff",
        boxShadow: "0 16px 36px rgba(11,30,54,0.18)",
        border: "1px solid rgba(245,158,11,0.28)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ maxWidth: 460 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: T.amber }}>
            WORK FROM THE FIELD
          </p>
          <h2 style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 800, letterSpacing: -0.3 }}>
            Download the TidyFlow app
          </h2>
          <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,0.78)" }}>
            Cleaners and managers use the mobile app for jobs, GPS, photos, and chat. Sign in with the same
            email as this dashboard.
          </p>
        </div>
        {buttons}
      </div>
    </div>
  )
}
