"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import { CreditCard, Save } from "lucide-react"

interface StripeSettings {
  stripe_secret_key: string
  stripe_publishable_key: string
  stripe_price_id_startup: string
  stripe_price_id_standard: string
  stripe_price_id_premium: string
  stripe_base_price_id: string
  stripe_property_price_id: string
}

const EMPTY: StripeSettings = {
  stripe_secret_key: "",
  stripe_publishable_key: "",
  stripe_price_id_startup: "",
  stripe_price_id_standard: "",
  stripe_price_id_premium: "",
  stripe_base_price_id: "",
  stripe_property_price_id: "",
}

export default function StripeSettingsPage() {
  const [settings, setSettings] = useState<StripeSettings>(EMPTY)
  const [secretMode, setSecretMode] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<any>(null)

  const token = () => localStorage.getItem("authToken") || sessionStorage.getItem("authToken")

  const load = async () => {
    const res = await axios.get("/api/admin/stripe-settings", {
      headers: { Authorization: `Bearer ${token()}` },
    })
    if (res.data.success) {
      setSettings({ ...EMPTY, ...res.data.data })
      setSecretMode(res.data.data.stripe_secret_mode || "")
    }
  }

  useEffect(() => {
    load().catch(() => setMessage("Failed to load Stripe settings."))
  }, [])

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await axios.patch("/api/admin/stripe-settings", settings, {
        headers: { Authorization: `Bearer ${token()}` },
      })
      if (res.data.success) {
        setSettings({ ...EMPTY, ...res.data.data })
        setSecretMode(res.data.data.stripe_secret_mode || "")
        setMessage("Stripe settings saved.")
      }
    } catch {
      setMessage("Failed to save Stripe settings.")
    } finally {
      setSaving(false)
    }
  }

  const testStripe = async () => {
    setTesting(true)
    setMessage(null)
    try {
      const res = await axios.post(
        "/api/admin/stripe-settings/test",
        {},
        { headers: { Authorization: `Bearer ${token()}` } }
      )
      setTestResult(res.data.data)
      setMessage(res.data.message || "Stripe test finished.")
    } catch (err: any) {
      setTestResult(err?.response?.data?.data || null)
      setMessage(err?.response?.data?.message || "Stripe test failed.")
    } finally {
      setTesting(false)
    }
  }

  const field = (key: keyof StripeSettings, label: string, hint?: string, secret = false) => (
    <div key={key}>
      <label className="text-xs font-medium text-gray-500 block mb-1">{label}</label>
      <input
        type={secret ? "password" : "text"}
        value={settings[key]}
        onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
        placeholder={secret && settings[key] === "••••••••" ? "Leave unchanged or enter new key" : "price_..."}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
      />
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto p-6 space-y-8">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="text-indigo-600" size={24} />
            <h1 className="text-2xl font-bold text-gray-900">Stripe Configuration</h1>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Map each subscription tier to one paid monthly Stripe Price ID. Keep free trial on TidyFlow
            (trial days setting) — do not use a separate $0 trial Price ID.
          </p>
          {secretMode ? (
            <p className={`mt-2 text-sm font-medium ${secretMode === "live" ? "text-amber-800" : "text-teal-700"}`}>
              Currently stored secret key mode: <strong>{secretMode.toUpperCase()}</strong>
              {secretMode === "live"
                ? " — test Price IDs will fail until you paste sk_test_… and matching test prices."
                : " — use test Price IDs from the Stripe test dashboard."}
            </p>
          ) : null}
        </div>

        {message && (
          <p className="text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-4 py-2">
            {message}
          </p>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">API Keys</h2>
          {field("stripe_secret_key", "Secret key (sk_live_… or sk_test_…)", "Stored encrypted. Paste the full key to replace — leaving the dots does not switch modes.", true)}
          {field("stripe_publishable_key", "Publishable key (pk_live_… or pk_test_…)", "Used by the mobile app.")}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Plan Price IDs</h2>
          <p className="text-sm text-gray-500">
            One recurring monthly Price per tier from the <strong>same</strong> Stripe mode as the secret key.
            If Stripe added a trial onto the Price itself, Checkout will use that trial automatically — you do not
            need a second trial Price ID. Leave TidyFlow trial days as the fallback when the Price has no built-in trial.
          </p>
          {field("stripe_price_id_startup", "Startup plan price ID", "e.g. price_1StartupMonthly")}
          {field("stripe_price_id_standard", "Standard plan price ID", "e.g. price_1StandardMonthly")}
          {field("stripe_price_id_premium", "Premium plan price ID", "e.g. price_1PremiumMonthly")}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4 opacity-80">
          <h2 className="text-lg font-semibold text-gray-900">Legacy (optional)</h2>
          <p className="text-sm text-gray-500">Fallback if per-tier IDs are not set. Standard tier uses base price ID.</p>
          {field("stripe_base_price_id", "Legacy base price ID")}
          {field("stripe_property_price_id", "Legacy per-property price ID (unused)")}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? "Saving..." : "Save Stripe settings"}
          </button>
          <button
            type="button"
            onClick={testStripe}
            disabled={testing}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            {testing ? "Testing…" : "Test keys & prices"}
          </button>
        </div>

        {testResult?.prices && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 text-sm space-y-2">
            <p className="font-semibold text-gray-900">
              Key mode: {testResult.mode}
              {testResult.mixedMode ? " · mismatch detected" : ""}
            </p>
            {testResult.prices.map((p: any) => (
              <p key={p.tier} className={p.ok ? "text-gray-700" : "text-red-700"}>
                {p.tier}: {p.ok ? `ok (${p.livemode ? "live" : "test"} price${p.builtinTrialDays ? `, ${p.builtinTrialDays}-day trial on Price` : ""})` : p.error}
              </p>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
