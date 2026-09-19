"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import axios from "axios"
import { SUBSCRIBE_THEME as T } from "@/lib/public-plan-scope"
import {
  clearAdminSession,
  clearCustomerSession,
  getAccountAccessToken,
  getCustomerUser,
  storeAdminSession,
} from "@/lib/customer-account"
import AppDownloadBanner from "@/components/AppDownloadBanner"
import { ghostBtn } from "@/components/account/accountUi"

type AccountPage = "billing" | "settings"

const WORKSPACE_ROLES = new Set([
  "OWNER",
  "MANAGER",
  "COMPANY_ADMIN",
  "DEVELOPER",
  "SUPER_ADMIN",
  "ADMIN_UNIQUE",
])

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
  const stored = getCustomerUser()
  const [profileImage, setProfileImage] = useState(stored?.profileImage || "")
  const [firstName, setFirstName] = useState(stored?.firstName || "")
  const [lastName, setLastName] = useState(stored?.lastName || "")
  const [email, setEmail] = useState(stored?.email || "")
  const [role, setRole] = useState(String(stored?.role || "").toUpperCase())
  const [openingWorkspace, setOpeningWorkspace] = useState(false)
  const [workspaceError, setWorkspaceError] = useState("")

  useEffect(() => {
    const token = getAccountAccessToken()
    if (!token) return
    axios
      .get("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const user = res.data?.data?.user
        if (!user) return
        setProfileImage(user.profileImage || "")
        setFirstName(user.firstName || "")
        setLastName(user.lastName || "")
        setEmail(user.email || "")
        setRole(String(user.role || "").toUpperCase())
      })
      .catch(() => null)
  }, [])

  const canOpenWorkspace = !role || WORKSPACE_ROLES.has(role)

  const openWorkspace = async () => {
    const token = getAccountAccessToken()
    if (!token) {
      window.location.href = "/login"
      return
    }
    try {
      setOpeningWorkspace(true)
      setWorkspaceError("")
      const res = await axios.post(
        "/api/auth/open-workspace",
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.data?.success) {
        setWorkspaceError(res.data?.message || "Could not open workspace")
        return
      }
      const { token: adminToken, user, company, path } = res.data.data
      storeAdminSession(adminToken, user, true, { keepCustomer: true })
      try {
        localStorage.setItem("customerAuthToken", adminToken)
        localStorage.setItem("customerUserData", JSON.stringify(user || {}))
      } catch {
        /* ignore */
      }
      if (company?.id) localStorage.setItem("selectedCompanyId", String(company.id))
      window.location.href = path || "/login"
    } catch (e: any) {
      setWorkspaceError(
        e.response?.data?.message || e.message || "Could not open workspace"
      )
    } finally {
      setOpeningWorkspace(false)
    }
  }

  const signOut = async () => {
    clearCustomerSession()
    clearAdminSession()
    try {
      await axios.post("/api/auth/clear-admin-session").catch(() => null)
    } catch {
      /* ignore */
    }
    window.location.href = "/login"
  }

  const initials = `${(firstName || email || "T").slice(0, 1)}${(lastName || "").slice(0, 1)}`.toUpperCase()
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || email || "Your account"

  return (
    <main className="account-shell">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .account-shell {
          min-height: 100vh;
          background:
            radial-gradient(900px 380px at 12% -10%, rgba(245,158,11,0.18), transparent 55%),
            radial-gradient(700px 320px at 100% 0%, rgba(15,39,68,0.08), transparent 50%),
            ${T.canvas};
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
          padding: 18px 12px 120px;
          box-sizing: border-box;
        }
        .account-wrap { max-width: 980px; margin: 0 auto; width: 100%; }
        .account-header {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 20px;
          padding: 16px 18px;
          border-radius: 20px;
          border: 1px solid ${T.border};
          background: rgba(255,255,255,0.88);
          box-shadow: 0 18px 40px rgba(15,39,68,0.06);
          backdrop-filter: blur(8px);
        }
        .account-identity {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
          flex: 1 1 220px;
        }
        .account-avatar {
          width: 48px;
          height: 48px;
          border-radius: 16px;
          object-fit: cover;
          border: 2px solid ${T.border};
          background: linear-gradient(145deg, ${T.amberSoft}, #fff);
          color: ${T.navy};
          display: grid;
          place-items: center;
          font-weight: 800;
          font-size: 16px;
          flex-shrink: 0;
        }
        .account-title { font-size: 22px; font-weight: 800; color: ${T.ink}; margin: 4px 0 0; line-height: 1.2; letter-spacing: -0.02em; }
        .account-sub { margin: 6px 0 0; font-size: 13px; color: ${T.inkMid}; word-break: break-word; }
        .account-nav { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
        .account-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          width: 100%;
        }
        .account-actions > * { flex: 1 1 auto; justify-content: center; min-height: 42px; }
        .workspace-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: none;
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 13px;
          font-weight: 800;
          background: ${T.amber};
          color: ${T.navy};
          cursor: pointer;
          box-shadow: 0 8px 20px rgba(217, 119, 6, 0.22);
        }
        .workspace-btn:disabled { opacity: 0.65; cursor: wait; }
        .account-body {
          display: grid;
          gap: 16px;
        }
        @media (min-width: 640px) {
          .account-shell { padding: 32px 16px 120px; }
          .account-title { font-size: 28px; }
          .account-avatar { width: 56px; height: 56px; }
          .account-actions { width: auto; }
          .account-actions > * { flex: 0 0 auto; }
        }
      `,
        }}
      />
      <div className="account-wrap">
        <header className="account-header">
          <div style={{ minWidth: 0, flex: "1 1 240px" }}>
            <div className="account-identity">
              <Link href="/account/settings" aria-label="Open settings" style={{ textDecoration: "none" }}>
                {profileImage ? (
                  <img src={profileImage} alt="" className="account-avatar" />
                ) : (
                  <span className="account-avatar">{initials}</span>
                )}
              </Link>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: T.amberDeep, margin: 0 }}>
                  TIDYFLOW ACCOUNT
                </p>
                <h1 className="account-title">{title}</h1>
                <p className="account-sub">{subtitle || displayName}</p>
              </div>
            </div>
            <nav className="account-nav">
              <NavLink href="/account/billing" label="Billing" current={active === "billing"} />
              <NavLink href="/account/settings" label="Settings" current={active === "settings"} />
            </nav>
            {workspaceError ? (
              <p style={{ margin: "10px 0 0", color: "#b91c1c", fontSize: 12, fontWeight: 600 }}>
                {workspaceError}
              </p>
            ) : null}
          </div>
          <div className="account-actions">
            {canOpenWorkspace && (
              <button
                type="button"
                className="workspace-btn"
                disabled={openingWorkspace}
                onClick={openWorkspace}
              >
                {openingWorkspace ? "Opening…" : "Open web app"}
              </button>
            )}
            {extraActions}
            <button type="button" onClick={signOut} style={ghostBtn}>
              Sign out
            </button>
          </div>
        </header>
        <div className="account-body">{children}</div>
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
