"use client"

import { useEffect, useRef, useState } from "react"
import { mapsUrl } from "@/lib/ops-tracking"

export type FleetMapGeofence = {
  id: string
  lat: number
  lng: number
  radiusM: number
  label?: string
  warn?: boolean
}

export type FleetMapTrail = {
  id: string
  points: Array<{ lat: number; lng: number; at?: string }>
  color?: string
  warn?: boolean
}

export type FleetMapMarker = {
  id: string
  lat: number
  lng: number
  label: string
  sub?: string
  kind: "cleaner" | "property" | "sos"
  warn?: boolean
  signal?: "live" | "stale" | "offline" | "unknown"
  meta?: Record<string, unknown>
}

/**
 * Advanced Leaflet fleet map — geofence circles, trails, incremental marker updates.
 * Web read-only. Does not recreate the map on every GPS tick.
 */
export default function LiveFleetMap({
  markers,
  geofences = [],
  trails = [],
  height = 480,
  focusId,
  focusLatLng,
  playbackIndex,
  emptyMessage = "No live coordinates yet",
  onMarkerClick,
}: {
  markers: FleetMapMarker[]
  geofences?: FleetMapGeofence[]
  trails?: FleetMapTrail[]
  height?: number
  focusId?: string | null
  focusLatLng?: { lat: number; lng: number } | null
  /** When set, trail points after this index are dimmed (playback scrub). */
  playbackIndex?: number | null
  emptyMessage?: string
  onMarkerClick?: (m: FleetMapMarker) => void
}) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInst = useRef<any>(null)
  const layerRef = useRef<any>(null)
  const LRef = useRef<any>(null)
  const clickRef = useRef(onMarkerClick)
  clickRef.current = onMarkerClick
  const [mode, setMode] = useState<"loading" | "ready" | "empty" | "error">("loading")
  const fittedOnce = useRef(false)

  const validMarkers = markers.filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const L = (await import("leaflet")).default
        await import("leaflet/dist/leaflet.css")
        if (cancelled || !mapRef.current) return
        LRef.current = L
        if (!mapInst.current) {
          const map = L.map(mapRef.current, {
            scrollWheelZoom: true,
            zoomControl: true,
          }).setView([51.5, -0.12], 11)
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap",
            maxZoom: 19,
          }).addTo(map)
          layerRef.current = L.layerGroup().addTo(map)
          mapInst.current = map
        }
        setMode("ready")
        setTimeout(() => mapInst.current?.invalidateSize(), 60)
      } catch {
        if (!cancelled) setMode("error")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const L = LRef.current
    const map = mapInst.current
    const layer = layerRef.current
    if (!L || !map || !layer) return

    if (validMarkers.length === 0 && geofences.length === 0) {
      layer.clearLayers()
      setMode((m) => (m === "ready" ? "empty" : m))
      return
    }
    setMode("ready")
    layer.clearLayers()

    for (const g of geofences) {
      if (!Number.isFinite(g.lat) || !Number.isFinite(g.lng)) continue
      L.circle([g.lat, g.lng], {
        radius: Math.max(30, g.radiusM || 150),
        color: g.warn ? "#dc2626" : "#1e3a5f",
        fillColor: g.warn ? "#fecaca" : "#93c5fd",
        fillOpacity: 0.12,
        weight: 1.5,
        dashArray: "4 4",
      })
        .bindTooltip(g.label || "Geofence", { sticky: true })
        .addTo(layer)
    }

    for (const t of trails) {
      const pts = t.points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
      if (pts.length < 2) continue
      const cut =
        playbackIndex != null && playbackIndex >= 0
          ? pts.slice(0, Math.min(pts.length, playbackIndex + 1))
          : pts
      if (cut.length < 2) continue
      L.polyline(
        cut.map((p) => [p.lat, p.lng]),
        {
          color: t.warn ? "#dc2626" : t.color || "#d97706",
          weight: 3,
          opacity: 0.75,
        }
      ).addTo(layer)
    }

    const bounds: [number, number][] = []
    for (const p of validMarkers) {
      const color =
        p.kind === "sos"
          ? "#dc2626"
          : p.warn
            ? "#dc2626"
            : p.kind === "property"
              ? "#1e3a5f"
              : p.signal === "stale"
                ? "#94a3b8"
                : p.signal === "offline"
                  ? "#64748b"
                  : "#d97706"
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: p.kind === "property" ? 7 : p.kind === "sos" ? 12 : 10,
        color,
        fillColor: color,
        fillOpacity: p.signal === "offline" ? 0.45 : 0.9,
        weight: focusId === p.id ? 3 : 2,
      }).addTo(layer)

      marker.bindPopup(
        `<strong>${esc(p.label)}</strong>${
          p.sub ? `<br/><span style="color:#64748b;font-size:12px">${esc(p.sub)}</span>` : ""
        }<br/><a href="${mapsUrl(p.lat, p.lng)}" target="_blank" rel="noreferrer" style="font-size:11px;color:#b45309">Open in Maps</a>`
      )
      marker.on("click", () => clickRef.current?.(p))
      bounds.push([p.lat, p.lng])
    }

    if (focusLatLng && Number.isFinite(focusLatLng.lat)) {
      map.setView([focusLatLng.lat, focusLatLng.lng], Math.max(map.getZoom(), 15), {
        animate: true,
      })
    } else if (!fittedOnce.current && bounds.length > 0) {
      if (bounds.length === 1) map.setView(bounds[0], 14)
      else map.fitBounds(bounds, { padding: [36, 36] })
      fittedOnce.current = true
    }
  }, [validMarkers, geofences, trails, focusId, focusLatLng, playbackIndex])

  useEffect(() => {
    return () => {
      if (mapInst.current) {
        mapInst.current.remove()
        mapInst.current = null
        layerRef.current = null
      }
    }
  }, [])

  return (
    <div className="relative overflow-hidden rounded-xl border border-control-border bg-slate-100 dark:border-navy-800 dark:bg-navy-950">
      {(mode === "empty" || (mode === "ready" && validMarkers.length === 0 && geofences.length === 0)) && (
        <div
          className="absolute inset-0 z-[1] flex items-center justify-center bg-slate-50/90 text-sm text-slate-400 dark:bg-navy-950/90"
          style={{ height }}
        >
          {emptyMessage}
        </div>
      )}
      {mode === "error" && (
        <div
          className="flex items-center justify-center text-sm text-slate-400"
          style={{ height }}
        >
          Map failed to load — check network
        </div>
      )}
      <div ref={mapRef} className="w-full" style={{ height }} />
      <div className="pointer-events-none absolute bottom-3 left-3 z-[400] flex flex-wrap gap-1.5">
        <LegendDot color="#d97706" label="Live" />
        <LegendDot color="#94a3b8" label="Stale" />
        <LegendDot color="#dc2626" label="Off-site / SOS" />
        <LegendDot color="#1e3a5f" label="Property" />
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 font-mono text-[9px] font-bold text-slate-600 shadow-sm dark:bg-navy-950/95 dark:text-slate-300">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
