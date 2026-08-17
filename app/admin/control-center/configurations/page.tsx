"use client"

import { useState, useEffect, useCallback } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import TurnstileWidget from "@/components/TurnstileWidget"

interface Configuration {
  id: number | null
  companyId: number | null
  photoCountRequirement: number
  watermarkEnabled: boolean
  geofenceRadius: number
  timezone: string
  dataRetentionDays: number
  notificationTemplate?: string | null
  applyToAllCompanies?: boolean
}

export default function ConfigurationsPage() {
  const [config, setConfig] = useState<Configuration | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    loadConfigurations()
  }, [])

  const loadConfigurations = async () => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const response = await axios.get("/api/admin/configurations", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.data.success) {
        const data = response.data.data
        setConfig({
          id: data.id ?? null,
          companyId: data.companyId ?? null,
          photoCountRequirement: data.photoCountRequirement ?? 20,
          watermarkEnabled: data.watermarkEnabled ?? false,
          geofenceRadius: data.geofenceRadius ?? 150,
          timezone: data.timezone ?? "UTC",
          dataRetentionDays: data.dataRetentionDays ?? 365,
          notificationTemplate: data.notificationTemplate ?? "",
          applyToAllCompanies: data.applyToAllCompanies ?? true,
        })
      }
    } catch (error) {
      console.error("Error loading configurations:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token)
  }, [])

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken(null)
  }, [])

  const handleSave = async () => {
    if (!config) return

    if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !turnstileToken) {
      setMessage({ type: "error", text: "Please complete the security check before saving." })
      return
    }

    try {
      setSaving(true)
      setMessage(null)
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const response = await axios.patch(
        "/api/admin/configurations",
        {
          photoCountRequirement: config.photoCountRequirement,
          watermarkEnabled: config.watermarkEnabled,
          geofenceRadius: config.geofenceRadius,
          timezone: config.timezone,
          dataRetentionDays: config.dataRetentionDays,
          notificationTemplate: config.notificationTemplate || null,
          applyToAllCompanies: true,
          turnstileToken,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      if (response.data.success) {
        const applied = response.data.data?.companiesUpdated
        setMessage({
          type: "success",
          text: applied
            ? `Configuration saved and applied to ${applied} companies.`
            : response.data.message || "Configuration saved successfully!",
        })
        if (response.data.data) {
          setConfig((prev) =>
            prev
              ? {
                  ...prev,
                  photoCountRequirement: response.data.data.photoCountRequirement ?? prev.photoCountRequirement,
                  watermarkEnabled: response.data.data.watermarkEnabled ?? prev.watermarkEnabled,
                  geofenceRadius: response.data.data.geofenceRadius ?? prev.geofenceRadius,
                  timezone: response.data.data.timezone ?? prev.timezone,
                  dataRetentionDays: response.data.data.dataRetentionDays ?? prev.dataRetentionDays,
                  notificationTemplate: response.data.data.notificationTemplate ?? prev.notificationTemplate,
                }
              : prev
          )
        }
        setTurnstileToken(null)
      }
    } catch (error: any) {
      setMessage({
        type: "error",
        text: error.response?.data?.message || "Failed to save configuration",
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex flex-col justify-center items-center min-h-[60vh] space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-slate-200 border-t-cyan-600"></div>
          <p className="text-sm text-slate-500 font-medium">Loading parameters...</p>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-950 sm:text-3xl tracking-tight">Admin Configurations</h1>
          <p className="mt-2 text-sm text-slate-500">
            Manage system-wide defaults applied to all companies. Use Company Configuration to override settings for a single company.
          </p>
        </div>

        <div className="mb-6 p-4 rounded-xl border border-cyan-100 bg-cyan-50/50 text-sm text-cyan-900">
          Changes on this page apply to <strong>every company</strong> when you save. Per-company overrides are managed under Settings → Company Configuration.
        </div>

        {/* Messaging Feedback Banner */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-xl border flex items-start gap-3 transition-all duration-200 ${
              message.type === "success"
                ? "bg-emerald-50/60 border-emerald-100 text-emerald-900"
                : "bg-rose-50/60 border-rose-100 text-rose-900"
            }`}
          >
            {message.type === "success" ? (
              <svg className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <div className="text-sm font-medium">{message.text}</div>
          </div>
        )}

        <div className="space-y-6">
          {/* Main Form Fields Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Column 1: Operational Settings */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-6 space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="text-lg font-semibold text-slate-900">Operational Parameters</h2>
                <p className="text-xs text-slate-400">Settings related to cleaning metrics and validation requirements.</p>
              </div>

              {/* Photo Count Requirement */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <label className="text-sm font-medium text-slate-700">Minimum Photos Required</label>
                </div>
                <input
                  type="number"
                  min="1"
                  value={config?.photoCountRequirement ?? 20}
                  onChange={(e) =>
                    setConfig({
                      ...config!,
                      photoCountRequirement: Number.parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all"
                />
                <p className="text-xs text-slate-400 leading-relaxed">
                  Minimum quantity of standard visual checks needed prior to and following execution.
                </p>
              </div>

              {/* Geofence Radius */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <label className="text-sm font-medium text-slate-700">Geofence Radius (meters)</label>
                </div>
                <input
                  type="number"
                  min="50"
                  max="500"
                  value={config?.geofenceRadius ?? 150}
                  onChange={(e) =>
                    setConfig({ ...config!, geofenceRadius: Number.parseInt(e.target.value) || 0 })
                  }
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all"
                />
                <p className="text-xs text-slate-400 leading-relaxed">
                  Allowed boundary deviation in meters from coordinate benchmark validation.
                </p>
              </div>

              {/* Watermark Toggle Switch */}
              <div className="pt-2 border-t border-slate-50">
                <div className="flex items-center justify-between bg-slate-50/50 p-3 rounded-lg border border-slate-100">
                  <div className="space-y-0.5">
                    <span className="text-sm font-medium text-slate-700 block">Photo Watermarking</span>
                    <span className="text-xs text-slate-400">Append timestamps and user signatures.</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={config?.watermarkEnabled || false}
                      onChange={(e) =>
                        setConfig({ ...config!, watermarkEnabled: e.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* Column 2: Localization & Policy */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-6 space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="text-lg font-semibold text-slate-900">Regional & System Data</h2>
                <p className="text-xs text-slate-400">Manage global standardizations and data lifecycles.</p>
              </div>

              {/* Timezone Selection with Categorized Optgroups */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <label className="text-sm font-medium text-slate-700">System Timezone</label>
                </div>
                <select
                  value={config?.timezone || "UTC"}
                  onChange={(e) => setConfig({ ...config!, timezone: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all appearance-none"
                  style={{ backgroundImage: `url("data:image/svg+xml;utf8,<svg fill='none' stroke='%2364748b' stroke-width='2' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'><path stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'></path></svg>")`, backgroundPosition: 'right 14px center', backgroundSize: '16px', backgroundRepeat: 'no-repeat' }}
                >
                  <optgroup label="Universal">
                    <option value="UTC">Coordinated Universal Time (UTC)</option>
                  </optgroup>
                  <optgroup label="North America">
                    <option value="America/Anchorage">Alaska Time (AKST/AKDT)</option>
                    <option value="America/Los_Angeles">Pacific Time (PST/PDT)</option>
                    <option value="America/Denver">Mountain Time (MST/MDT)</option>
                    <option value="America/Chicago">Central Time (CST/CDT)</option>
                    <option value="America/New_York">Eastern Time (EST/EDT)</option>
                    <option value="America/Halifax">Atlantic Time (AST/ADT)</option>
                  </optgroup>
                  <optgroup label="Central & South America">
                    <option value="America/Mexico_City">Mexico City (CST)</option>
                    <option value="America/Bogota">Bogota (EST)</option>
                    <option value="America/Sao_Paulo">São Paulo (BRT)</option>
                    <option value="America/Argentina/Buenos_Aires">Buenos Aires (ART)</option>
                  </optgroup>
                  <optgroup label="Europe">
                    <option value="Europe/London">London (GMT/BST)</option>
                    <option value="Europe/Dublin">Dublin (GMT/IST)</option>
                    <option value="Europe/Paris">Paris (CET/CEST)</option>
                    <option value="Europe/Berlin">Berlin (CET/CEST)</option>
                    <option value="Europe/Rome">Rome (CET/CEST)</option>
                    <option value="Europe/Athens">Athens (EET/EEST)</option>
                    <option value="Europe/Moscow">Moscow (MSK)</option>
                  </optgroup>
                  <optgroup label="Africa & Middle East">
                    <option value="Africa/Lagos">Lagos (WAT)</option>
                    <option value="Africa/Cairo">Cairo (EET)</option>
                    <option value="Africa/Johannesburg">Johannesburg (SAST)</option>
                    <option value="Africa/Nairobi">Nairobi (EAT)</option>
                    <option value="Asia/Dubai">Dubai (GST)</option>
                    <option value="Asia/Jerusalem">Jerusalem (IST/IDT)</option>
                  </optgroup>
                  <optgroup label="Asia">
                    <option value="Asia/Kolkata">Kolkata (IST)</option>
                    <option value="Asia/Jakarta">Jakarta (WIB)</option>
                    <option value="Asia/Singapore">Singapore (SGT)</option>
                    <option value="Asia/Shanghai">Shanghai (CST)</option>
                    <option value="Asia/Hong_Kong">Hong Kong (HKT)</option>
                    <option value="Asia/Tokyo">Tokyo (JST)</option>
                    <option value="Asia/Seoul">Seoul (KST)</option>
                  </optgroup>
                  <optgroup label="Oceania">
                    <option value="Australia/Perth">Perth (AWST)</option>
                    <option value="Australia/Adelaide">Adelaide (ACST/ACDT)</option>
                    <option value="Australia/Sydney">Sydney (AEST/AEDT)</option>
                    <option value="Pacific/Auckland">Auckland (NZST/NZDT)</option>
                  </optgroup>
                </select>
                <p className="text-xs text-slate-400">
                  Global reference framework timezone configuration.
                </p>
              </div>

              {/* Data Retention */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <label className="text-sm font-medium text-slate-700">Data Retention Limit (days)</label>
                </div>
                <input
                  type="number"
                  min="30"
                  max="3650"
                  value={config?.dataRetentionDays ?? 365}
                  onChange={(e) =>
                    setConfig({ ...config!, dataRetentionDays: Number.parseInt(e.target.value) || 0 })
                  }
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all"
                />
                <p className="text-xs text-slate-400">
                  Timeframe defining stored database records before archiving.
                </p>
              </div>
            </div>
          </div>

          {/* Full Width Section: Notifications & Security */}
          <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-6 space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-lg font-semibold text-slate-900">Communication & Security</h2>
              <p className="text-xs text-slate-400">Manage communication schema settings and security authorizations.</p>
            </div>

            {/* Notification Template */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <label className="text-sm font-medium text-slate-700">Notification Template</label>
              </div>
              <textarea
                value={config?.notificationTemplate || ""}
                onChange={(e) =>
                  setConfig({ ...config!, notificationTemplate: e.target.value })
                }
                rows={4}
                placeholder="Custom notification template format..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all resize-y min-h-[100px]"
              />
              <p className="text-xs text-slate-400">
                Structure templates using custom placeholders. Leave empty to use system fallback.
              </p>
            </div>

            {/* Security Widget */}
            <div className="pt-4 border-t border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="max-w-md">
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <label className="text-sm font-medium text-slate-700">Security Verification</label>
                </div>
                <p className="text-xs text-slate-400">
                  Verification confirms authorization for modification adjustments and guards against potential programmatic attempts.
                </p>
              </div>
              
              <div className="shrink-0 bg-slate-50/50 p-2 border border-slate-100 rounded-lg">
                <TurnstileWidget
                  onVerify={handleTurnstileVerify}
                  onExpire={handleTurnstileExpire}
                  onError={handleTurnstileExpire}
                />
              </div>
            </div>
          </div>

          {/* Action Trigger Area */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              disabled={saving || !config}
              className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 text-white font-medium rounded-lg text-sm transition-all focus:ring-4 focus:ring-cyan-500/20 disabled:opacity-40 flex items-center justify-center gap-2 shadow-sm"
            >
              {saving && (
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {saving ? "Saving Changes..." : "Apply Configurations"}
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
