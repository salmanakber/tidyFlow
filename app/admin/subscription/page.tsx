"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import { Shield, Save, Building2 } from "lucide-react"

interface PlanLimit {
  tier: string
  label: string
  monthlyPrice: number
  maxCleaners: number
  maxProperties: number
  maxManagers: number
  aiRequestsPerMonth: number
  aiPhotoAnalysis: boolean
  aiInsights: boolean
  aiAssignment: boolean
  aiTaskSuggestions: boolean
  invoicesEnabled: boolean
  maxInvoicesPerMonth: number
  aiInvoiceAssist: boolean
  maxPhotoVerificationsPerMonth: number
  maxPdfGenerationsPerMonth: number
  googleSheetsEnabled: boolean
  quickbooksEnabled: boolean
}

interface CompanyRow {
  id: number
  name: string
  planTier: string
}

export default function SubscriptionAdminPage() {
  const [plans, setPlans] = useState<PlanLimit[]>([])
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const token = () => localStorage.getItem("authToken") || sessionStorage.getItem("authToken")

  const load = async () => {
    const headers = { Authorization: `Bearer ${token()}` }
    const [p, c] = await Promise.all([
      axios.get("/api/admin/subscription-plans", { headers }),
      axios.get("/api/admin/companies/plan", { headers }),
    ])
    if (p.data.success) setPlans(p.data.data)
    if (c.data.success) setCompanies(c.data.data)
  }

  useEffect(() => {
    load()
  }, [])

  const savePlan = async (plan: PlanLimit) => {
    setSaving(plan.tier)
    setMessage(null)
    try {
      await axios.patch("/api/admin/subscription-plans", plan, {
        headers: { Authorization: `Bearer ${token()}` },
      })
      setMessage(`${plan.label} limits saved.`)
      load()
    } catch {
      setMessage("Failed to save plan limits.")
    } finally {
      setSaving(null)
    }
  }

  const setCompanyTier = async (companyId: number, planTier: string) => {
    try {
      await axios.patch(
        "/api/admin/companies/plan",
        { companyId, planTier },
        { headers: { Authorization: `Bearer ${token()}` } }
      )
      setMessage("Company plan updated.")
      load()
    } catch {
      setMessage("Failed to update company plan.")
    }
  }

  const updatePlan = (tier: string, field: keyof PlanLimit, value: string | number | boolean) => {
    setPlans((prev) =>
      prev.map((p) => (p.tier === tier ? { ...p, [field]: value } : p))
    )
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-8">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="text-indigo-600" size={24} />
            <h1 className="text-2xl font-bold text-gray-900">Subscription Plans</h1>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Configure Startup, Standard, and Premium limits. AI usage is tracked per company per month.
          </p>
        </div>

        {message && (
          <p className="text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-4 py-2">
            {message}
          </p>
        )}

        <div className="grid gap-6">
          {plans.map((plan) => (
            <div key={plan.tier} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">{plan.label}</h2>
                <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">{plan.tier}</span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                {(
                  [
                    ["monthlyPrice", "Monthly price ($)"],
                    ["maxCleaners", "Max cleaners"],
                    ["maxProperties", "Max properties"],
                    ["maxManagers", "Max managers"],
                    ["aiRequestsPerMonth", "AI requests / month"],
                    ["maxPhotoVerificationsPerMonth", "Photo verifications / month"],
                    ["maxPdfGenerationsPerMonth", "Task PDFs / month"],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field}>
                    <label className="text-xs font-medium text-gray-500 block mb-1">{label}</label>
                    <input
                      type="number"
                      value={plan[field]}
                      onChange={(e) => updatePlan(plan.tier, field, Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-4 mb-4">
                {(
                  [
                    ["aiPhotoAnalysis", "Photo AI"],
                    ["aiInsights", "Insights"],
                    ["aiAssignment", "Assignment AI"],
                    ["aiTaskSuggestions", "Task suggestions"],
                    ["invoicesEnabled", "Client invoices"],
                    ["aiInvoiceAssist", "AI invoice assist"],
                    ["googleSheetsEnabled", "Google Sheets sync"],
                    ["quickbooksEnabled", "QuickBooks integration"],
                  ] as const
                ).map(([field, label]) => (
                  <label key={field} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!plan[field]}
                      onChange={(e) => updatePlan(plan.tier, field, e.target.checked)}
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Max invoices / month</label>
                  <input
                    type="number"
                    value={plan.maxInvoicesPerMonth}
                    onChange={(e) => updatePlan(plan.tier, "maxInvoicesPerMonth", Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    disabled={!plan.invoicesEnabled}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => savePlan(plan)}
                disabled={saving === plan.tier}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                <Save size={16} />
                {saving === plan.tier ? "Saving..." : "Save limits"}
              </button>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={20} className="text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Assign company plans</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-4">Company</th>
                  <th className="py-2">Plan</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100">
                    <td className="py-3 pr-4 font-medium">{c.name}</td>
                    <td className="py-3">
                      <select
                        value={c.planTier || "STANDARD"}
                        onChange={(e) => setCompanyTier(c.id, e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-1.5"
                      >
                        <option value="STARTUP">Startup</option>
                        <option value="STANDARD">Standard</option>
                        <option value="PREMIUM">Premium</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
