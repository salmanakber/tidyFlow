"use client"

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import Link from "next/link"
import axios from "axios"
import { SUBSCRIBE_THEME as T } from "@/lib/public-plan-scope"
import {
  clearAdminSession,
  clearCustomerSession,
  getCustomerToken,
  getCustomerUserEmail,
  isTrialCurrentlyActive,
  trialDaysRemaining,
} from "@/lib/customer-account"
import AppDownloadBanner from "@/components/AppDownloadBanner"
import AccountChrome from "@/components/account/AccountChrome"
import AccountSetupModal from "@/components/account/AccountSetupModal"
import AccountUpgradeBanner from "@/components/account/AccountUpgradeBanner"
import { shouldSkipSetupPrompt } from "@/components/account/accountUi"

type Tab = "overview" | "usage" | "plans" | "invoices"

interface BillingRecord {
  id: string
  companyName: string
  billingDate: string
  status: string
  amountPaid: number
  amountDue: number
  propertyCount: number
  nextBillingDate?: string
  isTrialPeriod: boolean
  trialEndsAt?: string
  invoiceUrl?: string | null
}

interface CompanyBillingInfo {
  name: string
  isTrialActive: boolean
  subscriptionStatus: string
  planTier?: string
  pendingPlanTier?: string | null
  pendingPlanEffectiveAt?: string | null
  monthlyCost: number
  propertyCount: number
  trialEndsAt?: string
}

interface CurrentSubscription {
  id: string
  subscriptionId: string
  status: string
  nextBillingDate?: string
  cancelAtPeriodEnd?: boolean
  cancelEffectiveAt?: string | null
}

interface PlanCard {
  tier: string
  label: string
  monthlyPrice: number
  maxProperties?: number
  maxCleaners?: number
  limits?: { properties?: number; cleaners?: number; maxProperties?: number; maxCleaners?: number }
  scope?: { maxProperties?: number; maxCleaners?: number }
  features?: Record<string, boolean>
}

interface UsageMeter {
  current: number
  max: number
  atLimit: boolean
}

interface UsageSnapshot {
  planTier?: string
  label?: string
  pendingPlanTier?: string | null
  pendingPlanLabel?: string | null
  pendingPlanEffectiveAt?: string | null
  subscriptionActive?: boolean
  usagePeriodStart?: string | null
  usagePeriodEnd?: string | null
  usagePeriodSource?: string
  remaining?: {
    aiThisMonth: number
    invoicesThisMonth: number
    photoVerificationsThisMonth: number
    pdfGenerationsThisMonth: number
  }
  usage?: {
    cleaners: UsageMeter
    properties: UsageMeter
    managers: UsageMeter
    aiThisMonth: UsageMeter
    invoicesThisMonth: UsageMeter
    photoVerificationsThisMonth: UsageMeter
    pdfGenerationsThisMonth: UsageMeter
  }
  blocked?: Record<string, boolean>
  planIncludes?: Record<string, boolean>
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(amount) || 0)
}

function formatDate(value?: string | null) {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function planPropertyLimit(p: PlanCard) {
  return Number(p.limits?.properties ?? p.limits?.maxProperties ?? p.scope?.maxProperties ?? p.maxProperties ?? 0)
}

function planCleanerLimit(p: PlanCard) {
  return Number(p.limits?.cleaners ?? p.limits?.maxCleaners ?? p.scope?.maxCleaners ?? p.maxCleaners ?? 0)
}

function statusStyle(status: string): CSSProperties {
  const s = (status || "").toLowerCase()
  if (["active", "paid", "processed", "trialing"].includes(s)) {
    return { background: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0" }
  }
  if (s === "failed") {
    return { background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA" }
  }
  return { background: "#FFFBEB", color: "#92400E", border: "1px solid #FDE68A" }
}

/** Standalone customer billing — mirrors Android BillingScreen capabilities. */
export default function CustomerBillingPage() {
  const [tab, setTab] = useState<Tab>("overview")
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [records, setRecords] = useState<BillingRecord[]>([])
  const [company, setCompany] = useState<CompanyBillingInfo | null>(null)
  const [currentSubscription, setCurrentSubscription] = useState<CurrentSubscription | null>(null)
  const [summary, setSummary] = useState({ total_transactions: 0, failed_payments: 0 })
  const [plans, setPlans] = useState<PlanCard[]>([])
  const [usage, setUsage] = useState<UsageSnapshot | null>(null)
  const [trialDaysConfig, setTrialDaysConfig] = useState(14)
  const [portalLoading, setPortalLoading] = useState(false)
  const [changingPlan, setChangingPlan] = useState<string | null>(null)
  const [canceling, setCanceling] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [invoiceLoadingId, setInvoiceLoadingId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState("")
  const [showSetup, setShowSetup] = useState(false)

  const authHeaders = () => ({ Authorization: `Bearer ${getCustomerToken()}` })

  const load = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      const token = getCustomerToken()
      if (!token) {
        window.location.href = "/account/login"
        return
      }
      // Scrub leftover admin tokens + HTTP-only cookie from older builds
      clearAdminSession()
      await axios.post("/api/auth/clear-admin-session").catch(() => null)
      setUserEmail(getCustomerUserEmail())

      const [billingRes, plansRes, usageRes, pricingRes, meRes] = await Promise.all([
        axios.get("/api/billing", { headers: authHeaders(), params: { limit: 50 } }),
        axios.get("/api/subscription/plans", { headers: authHeaders() }).catch(() => null),
        axios.get("/api/subscription/usage", { headers: authHeaders() }).catch(() => null),
        axios.get("/api/subscription/pricing", { headers: authHeaders() }).catch(() => null),
        axios.get("/api/auth/me", { headers: authHeaders() }).catch(() => null),
      ])

      if (billingRes.data.success) {
        setRecords(billingRes.data.billingRecords || [])
        setCompany(billingRes.data.company || null)
        setCurrentSubscription(billingRes.data.currentSubscription || null)
        setSummary(billingRes.data.summary || { total_transactions: 0, failed_payments: 0 })
      } else {
        setMessage(billingRes.data.message || "Could not load billing")
      }

      if (plansRes?.data?.success) {
        setPlans(plansRes.data.data || [])
        if (plansRes.data.trialDays) setTrialDaysConfig(Number(plansRes.data.trialDays))
      }
      if (usageRes?.data?.success) setUsage(usageRes.data.data || null)
      const configuredTrial = pricingRes?.data?.data?.pricing?.trialDays
      if (configuredTrial != null) setTrialDaysConfig(Number(configuredTrial))
      if (meRes?.data?.success) {
        const meUser = meRes.data.data?.user
        if (meUser?.email) setUserEmail(meUser.email)
        if (meRes.data.data?.needsOnboarding && !shouldSkipSetupPrompt()) {
          setShowSetup(true)
        }
      }
    } catch (err: any) {
      if (err?.response?.status === 401) {
        clearCustomerSession()
        window.location.href = "/account/login"
        return
      }
      setMessage(err?.response?.data?.message || "Could not load billing")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (loading) return
    const params = new URLSearchParams(window.location.search)
    const tabParam = params.get("tab")
    if (tabParam === "plans" || tabParam === "usage" || tabParam === "invoices" || tabParam === "overview") {
      setTab(tabParam)
    }
    const pay = params.get("pay")
    if (!pay) return
    const useTrial = params.get("trial") !== "0"
    window.history.replaceState({}, "", "/account/billing")
    void startCheckout(pay.toUpperCase(), useTrial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const currentTier = (
    usage?.planTier ||
    company?.planTier ||
    "STANDARD"
  ).toUpperCase()
  const pendingTier = (usage?.pendingPlanTier || company?.pendingPlanTier || "").toUpperCase() || null
  const subscriptionStatus = (
    currentSubscription?.status ||
    company?.subscriptionStatus ||
    ""
  ).toLowerCase()
  // Only show trial when flag is on AND end date is still in the future (never trust stale "trialing" alone)
  const onTrial = isTrialCurrentlyActive(company?.isTrialActive, company?.trialEndsAt)
  const trialDaysLeft = trialDaysRemaining(company?.trialEndsAt)
  const hasStripeSubscription = Boolean(currentSubscription?.subscriptionId)
  const isCancelScheduled = Boolean(currentSubscription?.cancelAtPeriodEnd)
  const canCancel =
    hasStripeSubscription &&
    !isCancelScheduled &&
    ["active", "trialing"].includes(subscriptionStatus)
  const needsCheckout =
    !hasStripeSubscription &&
    !["active", "trialing"].includes(subscriptionStatus)

  const sortedPlans = useMemo(
    () => [...plans].sort((a, b) => Number(a.monthlyPrice) - Number(b.monthlyPrice)),
    [plans]
  )
  const currentPlan = sortedPlans.find((p) => p.tier.toUpperCase() === currentTier)
  const paidTotal = records.reduce((sum, r) => sum + Number(r.amountPaid || 0), 0)

  const openPortal = async () => {
    setPortalLoading(true)
    setMessage(null)
    try {
      const res = await axios.post("/api/subscription/billing-portal", {}, { headers: authHeaders() })
      const url = res.data?.data?.url
      if (!res.data?.success || !url) throw new Error(res.data?.message || "Could not open portal")
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (err: any) {
      const code = err?.response?.data?.code
      if (code === "NO_CUSTOMER") {
        setMessage("No billing account yet. Choose a plan below to start checkout.")
        setTab("plans")
      } else {
        setMessage(err?.response?.data?.message || err?.message || "Could not open billing portal")
      }
    } finally {
      setPortalLoading(false)
    }
  }

  const startCheckout = async (tier: string, useTrial: boolean) => {
    setCheckoutLoading(tier)
    setMessage(null)
    try {
      const res = await axios.post(
        "/api/subscription/checkout-session",
        {
          planTier: tier,
          useTrial,
          email: userEmail || undefined,
          source: "web_account_billing",
        },
        { headers: authHeaders() }
      )
      const url = res.data?.data?.url
      if (!res.data?.success || !url) throw new Error(res.data?.message || "Could not start checkout")
      window.location.href = url
    } catch (err: any) {
      setMessage(err?.response?.data?.message || err?.message || "Could not start checkout")
      setCheckoutLoading(null)
    }
  }

  const changePlan = async (plan: PlanCard) => {
    if (changingPlan) return
    const tier = plan.tier.toUpperCase()
    if (tier === currentTier) return

    const currentPrice = currentPlan?.monthlyPrice ?? 0
    const isUpgrade = plan.monthlyPrice > currentPrice
    const isDowngrade = plan.monthlyPrice < currentPrice

    const title = onTrial
      ? "Change plan during trial"
      : isUpgrade
        ? "Upgrade plan"
        : isDowngrade
          ? "Downgrade plan"
          : "Change plan"

    const confirmMsg = onTrial
      ? `Switch to ${plan.label}? Your free trial will end immediately and billing for the new plan will begin.`
      : isUpgrade
        ? `Upgrade to ${plan.label}? You'll be charged any price difference today and new features unlock right away.`
        : isDowngrade
          ? `Switch to ${plan.label}? You'll keep your current plan until the end of this billing period. The lower price starts on your next renewal.`
          : `Switch to the ${plan.label} plan?`

    if (!window.confirm(`${title}\n\n${confirmMsg}`)) return

    // No Stripe customer yet → checkout for this plan
    if (needsCheckout || !hasStripeSubscription) {
      await startCheckout(tier, onTrial || !hasStripeSubscription)
      return
    }

    setChangingPlan(tier)
    setMessage(null)
    try {
      const res = await axios.post(
        "/api/subscription/change-plan",
        { planTier: tier },
        { headers: authHeaders() }
      )
      if (res.data.success) {
        setMessage(res.data.message || "Plan updated")
        await load()
        setTab("overview")
      } else {
        setMessage(res.data.message || "Could not change plan")
      }
    } catch (err: any) {
      // Fall back to Stripe portal / checkout like Android external billing
      try {
        await openPortal()
      } catch {
        setMessage(err?.response?.data?.message || err?.message || "Could not change plan")
      }
    } finally {
      setChangingPlan(null)
    }
  }

  const cancelSubscription = async () => {
    const title = onTrial ? "Cancel trial?" : "Cancel subscription?"
    const body = onTrial
      ? `Cancel your trial now? You will not be charged and access ends immediately unless you subscribe again. (Configured trial: ${trialDaysConfig} days)`
      : "Cancel your subscription? You will keep access until the end of the current billing period."
    if (!window.confirm(`${title}\n\n${body}`)) return

    setCanceling(true)
    setMessage(null)
    try {
      const res = await axios.post("/api/subscription/cancel", {}, { headers: authHeaders() })
      if (res.data.success) {
        setMessage(res.data.message || "Subscription canceled")
        await load()
      } else {
        setMessage(res.data.message || "Failed to cancel")
      }
    } catch (err: any) {
      setMessage(err?.response?.data?.message || "Failed to cancel subscription")
    } finally {
      setCanceling(false)
    }
  }

  const openInvoice = async (record: BillingRecord) => {
    if (record.invoiceUrl) {
      window.open(record.invoiceUrl, "_blank", "noopener,noreferrer")
      return
    }
    setInvoiceLoadingId(record.id)
    try {
      const res = await axios.get(`/api/billing/${record.id}/invoice`, { headers: authHeaders() })
      const url = res.data?.data?.invoiceUrl
      if (res.data?.success && url) {
        setRecords((prev) => prev.map((r) => (r.id === record.id ? { ...r, invoiceUrl: url } : r)))
        window.open(url, "_blank", "noopener,noreferrer")
      } else {
        setMessage(res.data?.message || "Could not generate invoice")
      }
    } catch (err: any) {
      setMessage(err?.response?.data?.message || "Could not generate invoice")
    } finally {
      setInvoiceLoadingId(null)
    }
  }

  return (
    <AccountChrome
      active="billing"
      title="Account dashboard"
      subtitle={`${company?.name || "Your account"}${userEmail ? ` · ${userEmail}` : ""}`}
      extraActions={
        <>
          <button type="button" onClick={() => load()} style={secondaryBtn}>
            Refresh
          </button>
          <button type="button" onClick={openPortal} disabled={portalLoading} style={primaryBtn}>
            {portalLoading ? "Opening…" : "Manage payment"}
          </button>
        </>
      }
    >
        <AccountSetupModal
          open={showSetup}
          onClose={() => setShowSetup(false)}
          onComplete={() => {
            setShowSetup(false)
            if (needsCheckout) setTab("plans")
            void load()
          }}
        />

        <AppDownloadBanner variant="hero" />

        {!loading ? (
          <AccountUpgradeBanner
            needsCheckout={needsCheckout}
            onTrial={onTrial}
            trialDaysLeft={trialDaysLeft}
            currentLabel={usage?.label || currentPlan?.label}
            onChoosePlan={() => setTab("plans")}
          />
        ) : null}

        {/* Tabs */}
        <div style={tabBar}>
          {(
            [
              ["overview", "Overview"],
              ["usage", "Usage"],
              ["plans", "Plans"],
              ["invoices", "Invoices"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                ...tabBtn,
                ...(tab === id ? tabBtnActive : null),
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {message && (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 14px",
              borderRadius: 12,
              background: "#FEF3C7",
              border: `1px solid ${T.border}`,
              color: T.ink,
              fontSize: 13,
            }}
          >
            {message}
          </div>
        )}

        {loading ? (
          <div style={{ ...card, padding: 40, textAlign: "center", color: T.inkMid }}>Loading billing…</div>
        ) : (
          <>
            {tab === "overview" && (
              <div style={{ display: "grid", gap: 16 }}>
                {/* Trial / subscription hero */}
                <div
                  style={{
                    ...card,
                    background: `linear-gradient(135deg, ${T.navy}, ${T.navyMid})`,
                    color: "#fff",
                    border: "none",
                  }}
                >
                  <p style={{ margin: 0, fontSize: 12, opacity: 0.75, fontWeight: 700, letterSpacing: 1 }}>
                    CURRENT PLAN
                  </p>
                  <h2 style={{ margin: "8px 0 0", fontSize: 26, fontWeight: 700 }}>
                    {usage?.label || currentPlan?.label || currentTier}
                  </h2>
                  <p style={{ margin: "6px 0 0", fontSize: 15, opacity: 0.9 }}>
                    {formatMoney(currentPlan?.monthlyPrice ?? company?.monthlyCost ?? 0)} / month
                  </p>

                  {onTrial ? (
                    <div
                      style={{
                        marginTop: 16,
                        padding: "12px 14px",
                        borderRadius: 12,
                        background: "rgba(245,158,11,0.2)",
                        border: "1px solid rgba(245,158,11,0.45)",
                      }}
                    >
                      <strong>Free trial active</strong>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.95 }}>
                        {trialDaysLeft > 0
                          ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left · ends ${formatDate(company?.trialEndsAt)}`
                          : `Trial ends ${formatDate(company?.trialEndsAt)}`}
                        . Switching plans ends the trial and starts billing.
                      </div>
                    </div>
                  ) : (
                    <p style={{ margin: "12px 0 0", fontSize: 13, opacity: 0.8 }}>
                      Status: {subscriptionStatus || "unknown"}
                      {currentSubscription?.nextBillingDate
                        ? ` · Next billing ${formatDate(currentSubscription.nextBillingDate)}`
                        : ""}
                    </p>
                  )}

                  {pendingTier ? (
                    <div
                      style={{
                        marginTop: 12,
                        padding: "10px 12px",
                        borderRadius: 10,
                        background: "rgba(255,255,255,0.1)",
                        fontSize: 13,
                      }}
                    >
                      Downgrade to {usage?.pendingPlanLabel || pendingTier} scheduled for{" "}
                      {formatDate(usage?.pendingPlanEffectiveAt || company?.pendingPlanEffectiveAt)}
                    </div>
                  ) : null}

                  {isCancelScheduled ? (
                    <div
                      style={{
                        marginTop: 12,
                        padding: "10px 12px",
                        borderRadius: 10,
                        background: "rgba(255,255,255,0.1)",
                        fontSize: 13,
                      }}
                    >
                      Cancellation scheduled for{" "}
                      {formatDate(
                        currentSubscription?.cancelEffectiveAt || currentSubscription?.nextBillingDate
                      )}
                    </div>
                  ) : null}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 14,
                  }}
                >
                  <div style={card}>
                    <p style={statLabel}>Paid total</p>
                    <p style={statValue}>{formatMoney(paidTotal)}</p>
                    <p style={statHint}>{summary.total_transactions} transactions</p>
                  </div>
                  <div style={card}>
                    <p style={statLabel}>Failed payments</p>
                    <p style={statValue}>{summary.failed_payments}</p>
                    <p style={statHint}>Properties: {company?.propertyCount ?? 0}</p>
                  </div>
                  <div style={card}>
                    <p style={statLabel}>Plan usage</p>
                    <p style={statValue}>
                      {usage?.usage?.properties?.current ?? company?.propertyCount ?? 0}
                      <span style={{ fontSize: 13, fontWeight: 500, color: T.inkMid }}>
                        {" "}
                        / {usage?.usage?.properties?.max ?? "—"} properties
                      </span>
                    </p>
                    <p style={statHint}>
                      Cleaners {usage?.usage?.cleaners?.current ?? 0}/{usage?.usage?.cleaners?.max ?? "—"}
                    </p>
                    <button type="button" onClick={() => setTab("usage")} style={{ ...linkBtn, marginTop: 8 }}>
                      View usage dashboard
                    </button>
                  </div>
                  <div style={card}>
                    <p style={statLabel}>Manage</p>
                    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                      <button type="button" onClick={() => setTab("plans")} style={primaryBtn}>
                        {needsCheckout ? "Choose a plan" : "Upgrade / switch plan"}
                      </button>
                      <Link href="/account/settings" style={secondaryBtn}>
                        Edit profile & company
                      </Link>
                      {canCancel ? (
                        <button
                          type="button"
                          onClick={cancelSubscription}
                          disabled={canceling}
                          style={{ ...ghostBtn, color: T.rose, justifyContent: "flex-start", paddingLeft: 0 }}
                        >
                          {canceling
                            ? "Canceling…"
                            : onTrial
                              ? "Cancel trial"
                              : "Cancel subscription"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === "usage" && (
              <UsageDashboard
                usage={usage}
                subscriptionActive={usage?.subscriptionActive ?? !needsCheckout}
                onUpgrade={() => setTab("plans")}
              />
            )}

            {tab === "plans" && (
              <div style={{ display: "grid", gap: 16 }}>
                {onTrial && (
                  <div
                    style={{
                      ...card,
                      background: T.amberSoft,
                      borderColor: "#F6D98A",
                    }}
                  >
                    <strong style={{ color: T.ink }}>Trial period</strong>
                    <p style={{ margin: "6px 0 0", fontSize: 13, color: T.inkMid, lineHeight: 1.45 }}>
                      You have {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left
                      {company?.trialEndsAt ? ` (ends ${formatDate(company.trialEndsAt)})` : ""}.
                      Changing plan ends the trial immediately and starts billing for the new plan — same as
                      the Android app.
                    </p>
                  </div>
                )}

                {needsCheckout && (
                  <div style={card}>
                    <strong style={{ color: T.ink }}>Start subscription</strong>
                    <p style={{ margin: "6px 0 0", fontSize: 13, color: T.inkMid }}>
                      Your account is already set up. Pick a plan below to open Stripe checkout
                      {onTrial ? " (trial available)" : ""} — you will not be asked to create another account.
                    </p>
                  </div>
                )}

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    gap: 14,
                  }}
                >
                  {sortedPlans.map((p) => {
                    const tier = p.tier.toUpperCase()
                    const isCurrent = tier === currentTier
                    const isPending = !!pendingTier && tier === pendingTier
                    const isUpgrade =
                      (currentPlan?.monthlyPrice ?? 0) < Number(p.monthlyPrice)
                    const busy = changingPlan === tier || checkoutLoading === tier

                    return (
                      <div
                        key={p.tier}
                        style={{
                          ...card,
                          borderColor: isCurrent ? T.amber : isPending ? "#93C5FD" : T.border,
                          boxShadow: isCurrent ? "0 10px 28px rgba(245,158,11,0.15)" : card.boxShadow,
                        }}
                      >
                        {(isCurrent || isPending) && (
                          <span
                            style={{
                              display: "inline-block",
                              marginBottom: 10,
                              padding: "3px 8px",
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 700,
                              background: isCurrent ? T.amberSoft : "#DBEAFE",
                              color: isCurrent ? T.amberDeep : "#1D4ED8",
                            }}
                          >
                            {isCurrent ? "Current plan" : "Scheduled"}
                          </span>
                        )}
                        <h3 style={{ margin: 0, fontSize: 18, color: T.ink }}>{p.label}</h3>
                        <p style={{ margin: "8px 0 0", fontSize: 24, fontWeight: 700, color: T.ink }}>
                          {formatMoney(p.monthlyPrice)}
                          <span style={{ fontSize: 13, fontWeight: 500, color: T.inkMid }}> /mo</span>
                        </p>
                        <p style={{ margin: "8px 0 0", fontSize: 13, color: T.inkMid }}>
                          {planPropertyLimit(p)} properties · {planCleanerLimit(p)} cleaners
                        </p>

                        {!isCurrent && !isPending ? (
                          <button
                            type="button"
                            disabled={!!changingPlan || !!checkoutLoading}
                            onClick={() =>
                              needsCheckout
                                ? startCheckout(tier, true)
                                : changePlan(p)
                            }
                            style={{
                              ...primaryBtn,
                              marginTop: 16,
                              width: "100%",
                              justifyContent: "center",
                              background: isUpgrade ? T.emerald : T.navy,
                            }}
                          >
                            {busy
                              ? "Working…"
                              : needsCheckout
                                ? `Start ${p.label}`
                                : isUpgrade
                                  ? "Upgrade"
                                  : "Switch plan"}
                          </button>
                        ) : (
                          <p style={{ marginTop: 16, fontSize: 13, color: T.inkFaint }}>
                            {isCurrent ? "This is your active plan." : "Takes effect at period end."}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>

                {!needsCheckout && (
                  <p style={{ fontSize: 12, color: T.inkFaint, margin: 0 }}>
                    Upgrades apply immediately. Downgrades are scheduled for the end of the billing period.
                    You can also{" "}
                    <button type="button" onClick={openPortal} style={linkBtn}>
                      manage payment method in Stripe
                    </button>
                    .
                  </p>
                )}
              </div>
            )}

            {tab === "invoices" && (
              <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                <div
                  style={{
                    padding: "16px 20px",
                    borderBottom: `1px solid ${T.border}`,
                    fontWeight: 700,
                    color: T.ink,
                  }}
                >
                  Billing history & invoices
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: T.inkFaint, background: "#FCFAF7" }}>
                        <th style={th}>Date</th>
                        <th style={th}>Status</th>
                        <th style={th}>Amount</th>
                        <th style={th}>Properties</th>
                        <th style={th}>Invoice</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ padding: 36, textAlign: "center", color: T.inkMid }}>
                            No billing records yet.{" "}
                            <button type="button" onClick={() => setTab("plans")} style={linkBtn}>
                              Choose a plan
                            </button>
                          </td>
                        </tr>
                      ) : (
                        records.map((r) => (
                          <tr key={r.id} style={{ borderTop: `1px solid ${T.border}` }}>
                            <td style={td}>
                              {formatDate(r.billingDate)}
                              {r.isTrialPeriod ? (
                                <div style={{ fontSize: 12, color: T.amberDeep }}>Trial period</div>
                              ) : null}
                            </td>
                            <td style={td}>
                              <span
                                style={{
                                  ...statusStyle(r.status),
                                  display: "inline-block",
                                  padding: "2px 8px",
                                  borderRadius: 999,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  textTransform: "capitalize",
                                }}
                              >
                                {r.status}
                              </span>
                            </td>
                            <td style={{ ...td, fontWeight: 600 }}>
                              {formatMoney(r.amountPaid || r.amountDue)}
                            </td>
                            <td style={td}>{r.propertyCount}</td>
                            <td style={td}>
                              <button
                                type="button"
                                onClick={() => openInvoice(r)}
                                disabled={invoiceLoadingId === r.id}
                                style={linkBtn}
                              >
                                {invoiceLoadingId === r.id
                                  ? "Generating…"
                                  : r.invoiceUrl
                                    ? "View invoice"
                                    : "Generate invoice"}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
    </AccountChrome>
  )
}

function UsageBar({
  label,
  meter,
  hint,
}: {
  label: string
  meter?: UsageMeter
  hint?: string
}) {
  const current = meter?.current ?? 0
  const max = meter?.max ?? 0
  const pct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0
  const over = !!meter?.atLimit
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <p style={{ ...statLabel, margin: 0 }}>{label}</p>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: over ? T.rose : T.ink }}>
          {current} / {max || "∞"}
        </p>
      </div>
      <div
        style={{
          marginTop: 10,
          height: 8,
          borderRadius: 999,
          background: "#F1EEE8",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: over ? T.rose : pct > 80 ? T.amber : T.emerald,
          }}
        />
      </div>
      {hint ? <p style={statHint}>{hint}</p> : null}
    </div>
  )
}

function UsageDashboard({
  usage,
  subscriptionActive,
  onUpgrade,
}: {
  usage: UsageSnapshot | null
  subscriptionActive: boolean
  onUpgrade: () => void
}) {
  const u = usage?.usage
  const period =
    usage?.usagePeriodStart && usage?.usagePeriodEnd
      ? `${formatDate(usage.usagePeriodStart)} – ${formatDate(usage.usagePeriodEnd)}`
      : "Current billing period"

  const included = usage?.planIncludes || {}

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={card}>
        <p style={statLabel}>Plan scope</p>
        <h2 style={{ margin: "6px 0 0", fontSize: 22, color: T.ink }}>{usage?.label || "Current plan"}</h2>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: T.inkMid }}>
          Usage window: {period}
          {usage?.usagePeriodSource ? ` · ${usage.usagePeriodSource}` : ""}
        </p>
        {!subscriptionActive ? (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: T.rose }}>
            Subscription inactive. Limits stay blocked until you subscribe.
          </p>
        ) : null}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        <UsageBar label="Properties" meter={u?.properties} hint="Live property records on this account" />
        <UsageBar label="Cleaners" meter={u?.cleaners} hint="Active cleaner seats" />
        <UsageBar label="Managers" meter={u?.managers} hint="Managers + company admins" />
        <UsageBar label="AI requests" meter={u?.aiThisMonth} hint="Assignment, insights, and other AI this period" />
        <UsageBar
          label="Photo verifications"
          meter={u?.photoVerificationsThisMonth}
          hint={included.aiPhoto ? "AI photo checks this period" : "Not included on this plan"}
        />
        <UsageBar
          label="Invoices"
          meter={u?.invoicesThisMonth}
          hint={included.invoices ? "Client invoices this period" : "Invoicing not included"}
        />
        <UsageBar label="PDF exports" meter={u?.pdfGenerationsThisMonth} />
      </div>

      <div style={card}>
        <p style={statLabel}>Included features</p>
        <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: T.inkMid, fontSize: 13, lineHeight: 1.7 }}>
          <li>Google Sheets: {included.googleSheets ? "Yes" : "No"}</li>
          <li>QuickBooks: {included.quickbooks ? "Yes" : "No"}</li>
          <li>AI insights: {included.aiInsights ? "Yes" : "No"}</li>
          <li>Supply forecast: {included.aiSupplyForecast ? "Yes" : "No"}</li>
        </ul>
        <button type="button" onClick={onUpgrade} style={{ ...primaryBtn, marginTop: 14 }}>
          Upgrade for more capacity
        </button>
      </div>
    </div>
  )
}

const card: CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 16,
  padding: 18,
  boxShadow: "0 8px 24px rgba(11,30,54,0.04)",
}

const tabBar: CSSProperties = {
  display: "flex",
  gap: 8,
  marginBottom: 16,
  flexWrap: "wrap",
}

const tabBtn: CSSProperties = {
  border: `1px solid ${T.border}`,
  background: T.surface,
  borderRadius: 999,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 600,
  color: T.inkMid,
  cursor: "pointer",
}

const tabBtnActive: CSSProperties = {
  background: T.navy,
  borderColor: T.navy,
  color: "#fff",
}

const statLabel: CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.8,
  textTransform: "uppercase",
  color: T.inkFaint,
}

const statValue: CSSProperties = {
  margin: "8px 0 0",
  fontSize: 22,
  fontWeight: 700,
  color: T.ink,
}

const statHint: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 12,
  color: T.inkMid,
}

const th: CSSProperties = { padding: "12px 20px", fontWeight: 600, fontSize: 12 }
const td: CSSProperties = { padding: "14px 20px", color: T.ink, verticalAlign: "top" }

const primaryBtn: CSSProperties = {
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
}

const secondaryBtn: CSSProperties = {
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
}

const ghostBtn: CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: "transparent",
  color: T.inkMid,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
}

const linkBtn: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: T.amberDeep,
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
}
