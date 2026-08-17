import { getCustomerToken, getCustomerUserEmail } from "@/lib/customer-account"

export function isCustomerLoggedIn(): boolean {
  return !!getCustomerToken()
}

/** Start Stripe Checkout for the signed-in customer. Does not create a new account. */
export async function startCustomerCheckout(opts: {
  planTier: string
  useTrial?: boolean
  source?: string
}): Promise<string> {
  const token = getCustomerToken()
  if (!token) {
    throw new Error("Please sign in to upgrade this account.")
  }

  const res = await fetch("/api/subscription/checkout-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      planTier: String(opts.planTier || "").toUpperCase(),
      useTrial: opts.useTrial !== false,
      email: getCustomerUserEmail() || undefined,
      source: opts.source || "web_logged_in_upgrade",
    }),
  })

  const json = await res.json().catch(() => ({}))
  const url = json?.data?.url
  if (!json?.success || !url) {
    throw new Error(json?.message || "Could not start checkout")
  }
  return String(url)
}
