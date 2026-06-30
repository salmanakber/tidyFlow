"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import { Settings, Save } from "lucide-react"

interface AdminConfig {
  companyId: number
  photoCountRequirement: number
  watermarkEnabled: boolean
  geofenceRadius: number
  timezone: string
  currency: string
}

interface CompanyRow {
  id: number
  name: string
}

export default function CompanyConfigAdminPage() {
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [companyId, setCompanyId] = useState<number | "">("")
  const [config, setConfig] = useState<AdminConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const token = () => localStorage.getItem("authToken") || sessionStorage.getItem("authToken")

  useEffect(() => {
    axios
      .get("/api/admin/companies/plan", { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => {
        if (r.data.success) setCompanies(r.data.data)
      })
      .catch(() => {})
  }, [])

  const loadConfig = async (id: number) => {
    const r = await axios.get(`/api/company/admin-config?companyId=${id}`, {
      headers: { Authorization: `Bearer ${token()}` },
    }).catch(() => null)
    if (r?.data?.success) setConfig({ ...r.data.data, companyId: id })
  }

  useEffect(() => {
    if (companyId) loadConfig(Number(companyId))
  }, [companyId])

  const save = async () => {
    if (!companyId || !config) return
    setSaving(true)
    setMessage(null)
    try {
      await axios.patch(
        "/api/company/admin-config",
        {
          companyId: Number(companyId),
          photoCountRequirement: config.photoCountRequirement,
          watermarkEnabled: config.watermarkEnabled,
          geofenceRadius: config.geofenceRadius,
          timezone: config.timezone,
          currency: config.currency,
        },
        { headers: { Authorization: `Bearer ${token()}` } }
      )
      setMessage("Company settings saved.")
    } catch {
      setMessage("Failed to save settings.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Settings className="text-indigo-600" size={24} />
          <h1 className="text-2xl font-bold text-gray-900">Company configuration</h1>
        </div>
        <p className="text-sm text-gray-600">
          Photo limits, watermark (owner company name on task photos), geofence, and currency.
        </p>

        {message && (
          <p className="text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-4 py-2">{message}</p>
        )}

        <label className="block text-sm font-medium text-gray-700">Company</label>
        <select
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">Select company…</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {config && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.watermarkEnabled}
                onChange={(e) => setConfig({ ...config, watermarkEnabled: e.target.checked })}
              />
              Watermark task photos with company name
            </label>
            <div>
              <label className="text-xs text-gray-500">Max photos per type (before/after)</label>
              <input
                type="number"
                className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                value={config.photoCountRequirement}
                onChange={(e) => setConfig({ ...config, photoCountRequirement: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Geofence radius (m)</label>
              <input
                type="number"
                className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                value={config.geofenceRadius}
                onChange={(e) => setConfig({ ...config, geofenceRadius: Number(e.target.value) })}
              />
            </div>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              <Save size={16} />
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
