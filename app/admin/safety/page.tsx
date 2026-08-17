"use client"

import { useEffect, useState, useCallback } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import { AlertTriangle, MapPin, Shield, CheckCircle, RefreshCw, ExternalLink } from "lucide-react"

interface SOSAlert {
  id: number
  status: string
  latitude: number
  longitude: number
  createdAt: string
  notes?: string
  user: { firstName?: string; lastName?: string; phone?: string; email?: string }
  task?: { id: number; title: string; property?: { address?: string } } | null
}

interface LocationLog {
  id: number
  checkType: string
  withinGeofence: boolean
  distanceFromProperty: number | null
  latitude: number
  longitude: number
  createdAt: string
  user: { firstName?: string; lastName?: string }
  task: { id: number; title: string; property?: { address?: string } }
}

export default function SafetyDashboardPage() {
  const [activeSos, setActiveSos] = useState<SOSAlert[]>([])
  const [resolvedSos, setResolvedSos] = useState<SOSAlert[]>([])
  const [gpsFlags, setGpsFlags] = useState<LocationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"sos" | "gps">("sos")

  const getToken = () => localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
  const companyQuery = () => {
    const id = localStorage.getItem("selectedCompanyId")
    return id ? `&companyId=${id}` : ""
  }

  const load = useCallback(async () => {
    setLoading(true)
    const headers = { Authorization: `Bearer ${getToken()}` }
    try {
      const [activeRes, resolvedRes, gpsRes] = await Promise.all([
        axios.get(`/api/safety/sos?status=active${companyQuery()}`, { headers }),
        axios.get(`/api/safety/sos?status=resolved${companyQuery()}`, { headers }),
        axios.get(`/api/safety/location-logs?flagged=true&limit=30${companyQuery()}`, { headers }),
      ])
      if (activeRes.data.success) setActiveSos(activeRes.data.data || [])
      if (resolvedRes.data.success) setResolvedSos(resolvedRes.data.data || [])
      if (gpsRes.data.success) setGpsFlags(gpsRes.data.data || [])
    } catch (e) {
      console.error("Safety dashboard load error:", e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [load])

  const acknowledgeSos = async (id: number) => {
    try {
      await axios.patch(
        `/api/safety/sos/${id}`,
        { status: "resolved" },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      )
      load()
    } catch {
      alert("Failed to resolve SOS alert")
    }
  }

  const mapsUrl = (lat: number, lng: number) => `https://maps.google.com/?q=${lat},${lng}`

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="text-rose-600" size={26} />
              <h1 className="text-2xl font-bold text-gray-900">Safety & GPS</h1>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Monitor SOS emergencies and cleaner GPS geofence flags in real time.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {activeSos.length > 0 && (
          <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-4">
            <div className="flex items-center gap-2 text-rose-800 font-semibold mb-3">
              <AlertTriangle size={20} />
              {activeSos.length} active SOS alert{activeSos.length !== 1 ? "s" : ""}
            </div>
            <div className="space-y-3">
              {activeSos.map((alert) => (
                <SosCard key={alert.id} alert={alert} onResolve={() => acknowledgeSos(alert.id)} mapsUrl={mapsUrl} urgent />
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setTab("sos")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === "sos" ? "border-rose-600 text-rose-700" : "border-transparent text-gray-500"
            }`}
          >
            SOS History
          </button>
          <button
            type="button"
            onClick={() => setTab("gps")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === "gps" ? "border-teal-600 text-teal-700" : "border-transparent text-gray-500"
            }`}
          >
            GPS Flags ({gpsFlags.length})
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-500">Loading safety data…</div>
        ) : tab === "sos" ? (
          <div className="space-y-3">
            {resolvedSos.length === 0 && activeSos.length === 0 ? (
              <p className="text-gray-500 text-sm py-8 text-center">No SOS alerts recorded.</p>
            ) : (
              resolvedSos.map((alert) => (
                <SosCard key={alert.id} alert={alert} mapsUrl={mapsUrl} />
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {gpsFlags.length === 0 ? (
              <p className="text-gray-500 text-sm py-8 text-center">No geofence flags — all check-ins within range.</p>
            ) : (
              gpsFlags.map((log) => (
                <div key={log.id} className="bg-white border border-amber-200 rounded-xl p-4 flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <MapPin size={18} className="text-amber-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">
                      {log.user?.firstName} {log.user?.lastName} · {log.checkType}
                    </p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {log.task?.title}
                      {log.task?.property?.address ? ` · ${log.task.property.address}` : ""}
                    </p>
                    <p className="text-xs text-amber-700 mt-1">
                      {log.distanceFromProperty != null ? `${log.distanceFromProperty}m from property` : "Outside geofence"}
                      {" · "}
                      {new Date(log.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <a
                    href={mapsUrl(log.latitude, log.longitude)}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 flex items-center gap-1 text-xs text-teal-700 hover:underline self-start"
                  >
                    <ExternalLink size={14} /> Map
                  </a>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

function SosCard({
  alert,
  onResolve,
  mapsUrl,
  urgent,
}: {
  alert: SOSAlert
  onResolve?: () => void
  mapsUrl: (lat: number, lng: number) => string
  urgent?: boolean
}) {
  const name = `${alert.user?.firstName || ""} ${alert.user?.lastName || ""}`.trim() || "Cleaner"
  return (
    <div
      className={`rounded-xl p-4 flex flex-wrap gap-4 items-start ${
        urgent ? "bg-white border border-rose-200" : "bg-gray-50 border border-gray-200"
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900">🚨 {name}</p>
        {alert.task && (
          <p className="text-sm text-gray-600">
            {alert.task.title}
            {alert.task.property?.address ? ` · ${alert.task.property.address}` : ""}
          </p>
        )}
        <p className="text-xs text-gray-500 mt-1">{new Date(alert.createdAt).toLocaleString()}</p>
        {alert.user?.phone && <p className="text-xs text-gray-600 mt-1">📞 {alert.user.phone}</p>}
      </div>
      <div className="flex gap-2">
        <a
          href={mapsUrl(alert.latitude, alert.longitude)}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700"
        >
          Open Map
        </a>
        {onResolve && (
          <button
            type="button"
            onClick={onResolve}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-100"
          >
            <CheckCircle size={14} /> Resolve
          </button>
        )}
      </div>
    </div>
  )
}
