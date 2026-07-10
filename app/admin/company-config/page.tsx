
"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import { Settings, Save, CheckCircle, AlertTriangle, Building, ShieldAlert, Image, MapPin } from "lucide-react"

interface AdminConfig {
  companyId: number
  companyName?: string | null
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

const PLATFORM_ADMIN_ROLES = new Set(["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"])

export default function CompanyConfigAdminPage() {
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [companyId, setCompanyId] = useState<number | "">("")
  const [config, setConfig] = useState<AdminConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const token = () => localStorage.getItem("authToken") || sessionStorage.getItem("authToken")

  const loadConfig = async (id: number) => {
    const r = await axios
      .get(`/api/company/admin-config?companyId=${id}`, {
        headers: { Authorization: `Bearer ${token()}` },
      })
      .catch(() => null)
    if (r?.data?.success) {
      setConfig({ ...r.data.data, companyId: id })
    }
  }

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      setMessage(null)
      try {
        const authHeaders = { Authorization: `Bearer ${token()}` }
        const meRes = await axios.get("/api/auth/me", { headers: authHeaders })
        const user = meRes.data?.data?.user
        if (!user) {
          setMessage("Could not load your account. Please sign in again.")
          return
        }

        const platformAdmin = PLATFORM_ADMIN_ROLES.has(user.role)
        setIsPlatformAdmin(platformAdmin)

        if (platformAdmin) {
          const companiesRes = await axios.get("/api/admin/companies/plan", { headers: authHeaders })
          if (companiesRes.data.success) {
            const list = (companiesRes.data.data || []) as CompanyRow[]
            setCompanies(list)
            if (list.length === 1) {
              setCompanyId(list[0].id)
            }
          } else {
            setMessage("Could not load companies list.")
          }
          return
        }

        if (!user.companyId) {
          setMessage("Your account is not linked to a company. Contact support.")
          return
        }

        const cfgRes = await axios.get("/api/company/admin-config", { headers: authHeaders })
        if (cfgRes.data?.success) {
          const data = cfgRes.data.data as AdminConfig
          setCompanyId(user.companyId)
          setConfig({ ...data, companyId: user.companyId })
          if (data.companyName) {
            setCompanies([{ id: user.companyId, name: data.companyName }])
          }
        } else {
          setMessage("Could not load company configuration.")
        }
      } catch {
        setMessage("Failed to load configuration.")
      } finally {
        setLoading(false)
      }
    }

    void init()
  }, [])

  useEffect(() => {
    if (!companyId || !isPlatformAdmin) return
    void loadConfig(Number(companyId))
  }, [companyId, isPlatformAdmin])

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

  const selectedCompanyName =
    companies.find((c) => c.id === companyId)?.name || config?.companyName || ""

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Settings size={22} className="animate-spin-slow" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Company Configuration</h1>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed">
              Define visual parameters, photo upload validation counts, geographical tolerances, and currency defaults.
            </p>
          </div>
        </div>

        {/* Message Banner */}
        {message && (
          <div
            className={`flex items-start gap-3 p-4 rounded-xl border text-sm font-medium transition-all duration-200 ${
              message.includes("saved")
                ? "text-emerald-800 bg-emerald-50/60 border-emerald-100"
                : "text-amber-800 bg-amber-50/60 border-amber-100"
            }`}
          >
            {message.includes("saved") ? (
              <CheckCircle className="text-emerald-600 shrink-0 mt-0.5" size={18} />
            ) : (
              <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
            )}
            <div>{message}</div>
          </div>
        )}

        {/* Company Selection Panel */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Building className="text-slate-400" size={18} />
            <h2 className="text-sm font-semibold text-slate-900">Current Scope</h2>
          </div>

          {loading ? (
            <div className="animate-pulse flex space-y-2 flex-col">
              <div className="h-4 bg-slate-100 rounded w-24"></div>
              <div className="h-10 bg-slate-100 rounded-lg w-full"></div>
            </div>
          ) : isPlatformAdmin ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-500">Select Company Context</label>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                  <ShieldAlert size={10} /> Platform Admin Mode
                </span>
              </div>
              <div className="relative">
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-sm text-slate-800 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all appearance-none cursor-pointer"
                  style={{
                    backgroundImage: `url("data:image/svg+xml;utf8,<svg fill='none' stroke='%2364748b' stroke-width='2' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'><path stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'></path></svg>")`,
                    backgroundPosition: 'right 16px center',
                    backgroundSize: '16px',
                    backgroundRepeat: 'no-repeat'
                  }}
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">Select company…</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              {companies.length === 0 && (
                <p className="text-xs text-slate-400 mt-1">No companies found in the system database.</p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3.5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Assigned Identity</p>
                <p className="text-base font-bold text-slate-900 mt-1">{selectedCompanyName || "Your company"}</p>
              </div>
              <span className="h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-50"></span>
            </div>
          )}
        </div>

        {/* Configuration Parameters Panel */}
        {config && (
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">System Parameters</h3>
              <p className="text-xs text-slate-400 mt-0.5">Control image limits, geographic properties, and security parameters.</p>
            </div>

            <div className="p-6 space-y-6">
              {/* Photo Watermarking Toggle Block */}
              <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-sm font-semibold text-slate-800 block">Visual Watermarking</span>
                  <span className="text-xs text-slate-500">Append the current company brand context directly into task verification photos.</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={config.watermarkEnabled}
                    onChange={(e) => setConfig({ ...config, watermarkEnabled: e.target.checked })}
                  />
                  <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Grid Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                
                {/* Max photos field */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <Image size={15} />
                    <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                      Max Photos Per Type
                    </label>
                  </div>
                  <input
                    type="number"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-sm text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-medium"
                    value={config.photoCountRequirement}
                    onChange={(e) =>
                      setConfig({ ...config, photoCountRequirement: Number(e.target.value) })
                    }
                  />
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Set maximum allowable count for individual before & after photo fields.
                  </p>
                </div>

                {/* Geofence field */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <MapPin size={15} />
                    <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                      Geofence Radius (meters)
                    </label>
                  </div>
                  <input
                    type="number"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-sm text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-medium"
                    value={config.geofenceRadius}
                    onChange={(e) => setConfig({ ...config, geofenceRadius: Number(e.target.value) })}
                  />
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Acceptable geographical coordinates tolerance threshold for target properties.
                  </p>
                </div>

              </div>
            </div>

            {/* Footer Form Action */}
            <div className="bg-slate-50/50 border-t border-slate-100 p-4 sm:px-6 flex justify-end">
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-40"
              >
                {saving ? (
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <Save size={16} />
                )}
                {saving ? "Saving…" : "Save Settings"}
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
