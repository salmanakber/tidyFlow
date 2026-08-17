/** Standalone customer account session — never shares admin `authToken`. */

export const CUSTOMER_TOKEN_KEY = "customerAuthToken"
export const CUSTOMER_USER_KEY = "customerUserData"

const ADMIN_TOKEN_KEYS = ["authToken", "userData"] as const

export function getCustomerToken(): string | null {
  if (typeof window === "undefined") return null
  return (
    localStorage.getItem(CUSTOMER_TOKEN_KEY) ||
    sessionStorage.getItem(CUSTOMER_TOKEN_KEY)
  )
}

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
}

/** Customer portal login — does NOT unlock /admin. */
export function storeCustomerSession(token: string, user: unknown, remember: boolean) {
  // Drop any admin session so customer login cannot open the admin dashboard
  clearAdminSession()

  if (remember) {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, token)
    localStorage.setItem(CUSTOMER_USER_KEY, JSON.stringify(user))
    sessionStorage.removeItem(CUSTOMER_TOKEN_KEY)
    sessionStorage.removeItem(CUSTOMER_USER_KEY)
  } else {
    sessionStorage.setItem(CUSTOMER_TOKEN_KEY, token)
    sessionStorage.setItem(CUSTOMER_USER_KEY, JSON.stringify(user))
    localStorage.removeItem(CUSTOMER_TOKEN_KEY)
    localStorage.removeItem(CUSTOMER_USER_KEY)
  }
}

/** Admin console login — does NOT unlock /account customer portal. */
export function storeAdminSession(token: string, user: unknown, remember: boolean) {
  clearCustomerSession()

  if (remember) {
    localStorage.setItem("authToken", token)
    localStorage.setItem("userData", JSON.stringify(user))
    sessionStorage.removeItem("authToken")
    sessionStorage.removeItem("userData")
  } else {
    sessionStorage.setItem("authToken", token)
    sessionStorage.setItem("userData", JSON.stringify(user))
    localStorage.removeItem("authToken")
    localStorage.removeItem("userData")
  }
}

export function clearCustomerSession() {
  ;[CUSTOMER_TOKEN_KEY, CUSTOMER_USER_KEY].forEach((k) => {
    localStorage.removeItem(k)
    sessionStorage.removeItem(k)
  })
}

export function clearAdminSession() {
  ADMIN_TOKEN_KEYS.forEach((k) => {
    localStorage.removeItem(k)
    sessionStorage.removeItem(k)
  })
}

export function getCustomerUserEmail(): string {
  if (typeof window === "undefined") return ""
  const stored =
    localStorage.getItem(CUSTOMER_USER_KEY) || sessionStorage.getItem(CUSTOMER_USER_KEY)
  if (!stored) return ""
  try {
    return JSON.parse(stored)?.email || ""
  } catch {
    return ""
  }
}

/** Trial is active only when the flag is set AND the end date is still in the future. */
export function isTrialCurrentlyActive(
  isTrialActive?: boolean | null,
  trialEndsAt?: string | null
): boolean {
  if (!isTrialActive || !trialEndsAt) return false
  const end = new Date(trialEndsAt).getTime()
  if (Number.isNaN(end)) return false
  return end > Date.now()
}

export function trialDaysRemaining(trialEndsAt?: string | null): number {
  if (!trialEndsAt) return 0
  const end = new Date(trialEndsAt).getTime()
  if (Number.isNaN(end)) return 0
  return Math.max(0, Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24)))
}
