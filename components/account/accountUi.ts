import type { CSSProperties } from "react"
import { SUBSCRIBE_THEME as T } from "@/lib/public-plan-scope"

export const accountCard: CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 16,
  padding: 20,
}

export const accountLabel: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: T.inkMid,
  marginBottom: 6,
}

export const accountInput: CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: 10,
  border: `1px solid ${T.border}`,
  background: "#fff",
  color: T.ink,
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
}

export const primaryBtn: CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: T.navy,
  color: "#fff",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
}

export const secondaryBtn: CSSProperties = {
  border: `1px solid ${T.border}`,
  borderRadius: 10,
  padding: "10px 14px",
  background: T.surface,
  color: T.ink,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
}

export const ghostBtn: CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: "transparent",
  color: T.inkMid,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
}

export const ACCOUNT_CURRENCIES = [
  "USD",
  "GBP",
  "EUR",
  "AUD",
  "CAD",
  "NZD",
  "AED",
  "SAR",
  "SEK",
  "NOK",
  "DKK",
  "CHF",
  "PLN",
  "CNY",
] as const

export const ACCOUNT_TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Oslo",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Shanghai",
] as const

export const SETUP_LATER_KEY = "tidyflow_setup_later_until"
export const SETUP_SESSION_SKIP_KEY = "tidyflow_setup_later_session"

export function shouldSkipSetupPrompt(): boolean {
  if (typeof window === "undefined") return false
  if (sessionStorage.getItem(SETUP_SESSION_SKIP_KEY) === "1") return true
  const until = Number(localStorage.getItem(SETUP_LATER_KEY) || 0)
  return Number.isFinite(until) && until > Date.now()
}

export function skipSetupPrompt(days = 7) {
  if (typeof window === "undefined") return
  sessionStorage.setItem(SETUP_SESSION_SKIP_KEY, "1")
  localStorage.setItem(SETUP_LATER_KEY, String(Date.now() + days * 24 * 60 * 60 * 1000))
}

export function clearSetupPromptSkip() {
  if (typeof window === "undefined") return
  sessionStorage.removeItem(SETUP_SESSION_SKIP_KEY)
  localStorage.removeItem(SETUP_LATER_KEY)
}
