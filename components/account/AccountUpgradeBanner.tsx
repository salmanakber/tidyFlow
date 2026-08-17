"use client"

import { SUBSCRIBE_THEME as T } from "@/lib/public-plan-scope"
import { primaryBtn, secondaryBtn } from "@/components/account/accountUi"

export default function AccountUpgradeBanner({
  needsCheckout,
  onTrial,
  trialDaysLeft,
  currentLabel,
  onChoosePlan,
}: {
  needsCheckout: boolean
  onTrial: boolean
  trialDaysLeft: number
  currentLabel?: string
  onChoosePlan: () => void
}) {
  if (!needsCheckout && !onTrial) return null

  return (
    <div
      style={{
        marginBottom: 16,
        padding: 18,
        borderRadius: 16,
        background: `linear-gradient(135deg, ${T.navy}, ${T.navyMid})`,
        color: "#fff",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
      }}
    >
      <div style={{ maxWidth: 640 }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: 1.2, color: T.amber }}>
          {needsCheckout ? "COMPLETE YOUR UPGRADE" : "YOU ARE ON A FREE TRIAL"}
        </p>
        <h2 style={{ margin: "6px 0 0", fontSize: 18, fontWeight: 700 }}>
          {needsCheckout
            ? "Choose a plan to keep using TidyFlow after setup"
            : `${currentLabel || "Your plan"} trial is active`}
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,0.82)" }}>
          {needsCheckout
            ? "Your account is created. Pick Startup, Standard, or Pro to add a payment method. Trial days are applied at checkout when available."
            : trialDaysLeft > 0
              ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left. Upgrade anytime to unlock a higher property or cleaner limit.`
              : "Upgrade to keep access and unlock more properties, cleaners, and AI tools."}
        </p>
      </div>
      <button
        type="button"
        onClick={onChoosePlan}
        style={{
          ...(needsCheckout ? { ...primaryBtn, background: T.amber, color: T.navy } : secondaryBtn),
          minWidth: 140,
          width: "100%",
          maxWidth: 280,
          justifyContent: "center",
        }}
      >
        {needsCheckout ? "View plans" : "Upgrade"}
      </button>
    </div>
  )
}
