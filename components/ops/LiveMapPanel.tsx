"use client"

import { useEffect, useRef, useState } from "react"
import { ExternalLink, MapPin, Navigation, Radio } from "lucide-react"
import { mapsUrl, osmEmbedUrl } from "@/lib/ops-tracking"

export type MapPoint = {
  id: string | number
  lat: number
  lng: number
  label: string
  sub?: string
  kind?: "cleaner" | "property" | "log"
  warn?: boolean
}

/**
 * Multi-marker live map (Leaflet + OSM tiles). Falls back to single-marker embed.
 * Web-only — read paths only.
 */
export default function LiveMapPanel({
  points,
  height = 280,
  emptyMessage = "No live coordinates yet",
}: {
  points: MapPoint[]
  height?: number
  emptyMessage?: string
}) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInst = useRef<any>(null)
  const [mode, setMode] = useState<"loading" | "leaflet" | "embed" | "empty">("loading")

  const valid = points.filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90
  )
  const focus = valid[0]
  const sig = valid.map((p) => `${p.id}:${p.lat}:${p.lng}:${p.warn ? 1 : 0}`).join("|")

  useEffect(() => {
    if (!valid.length) {
      setMode("empty")
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const L = (await import("leaflet")).default
        await import("leaflet/dist/leaflet.css")
        if (cancelled || !mapRef.current) return

        if (mapInst.current) {
          mapInst.current.remove()
          mapInst.current = null
        }

        const map = L.map(mapRef.current, { scrollWheelZoom: false }).setView(
          [focus!.lat, focus!.lng],
          13
        )
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap",
          maxZoom: 19,
        }).addTo(map)

        const bounds: [number, number][] = []
        for (const p of valid) {
          const color =
            p.warn ? "#dc2626" : p.kind === "property" ? "#1e3a5f" : "#d97706"
          const marker = L.circleMarker([p.lat, p.lng], {
            radius: p.kind === "property" ? 8 : 10,
            color,
            fillColor: color,
            fillOpacity: 0.85,
            weight: 2,
          }).addTo(map)
          marker.bindPopup(
            `<strong>${escapeHtml(p.label)}</strong>${
              p.sub
                ? `<br/><span style="color:#64748b;font-size:12px">${escapeHtml(p.sub)}</span>`
                : ""
            }`
          )
          bounds.push([p.lat, p.lng])
        }
        if (bounds.length > 1) map.fitBounds(bounds, { padding: [28, 28] })
        mapInst.current = map
        setMode("leaflet")
        setTimeout(() => map.invalidateSize(), 80)
      } catch {
        if (!cancelled) setMode("embed")
      }
    })()

    return () => {
      cancelled = true
      if (mapInst.current) {
        mapInst.current.remove()
        mapInst.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  return (
    <div className="overflow-hidden rounded-xl border border-control-border dark:border-amber-900/40">
      {mode === "empty" || valid.length === 0 ? (
        <div
          className="flex items-center justify-center bg-slate-50 text-sm text-slate-400 dark:bg-navy-950"
          style={{ height }}
        >
          {emptyMessage}
        </div>
      ) : mode === "embed" && focus ? (
        <iframe
          title="Live map"
          src={osmEmbedUrl(focus.lat, focus.lng)}
          className="w-full border-0"
          style={{ height }}
          loading="lazy"
        />
      ) : (
        <div ref={mapRef} className="w-full bg-slate-100 dark:bg-navy-950" style={{ height }} />
      )}

      {valid.length > 0 && (
        <ul className="divide-y divide-slate-100 border-t border-control-border dark:divide-navy-900 dark:border-navy-800">
          {valid.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm"
            >
              <div className="flex min-w-0 items-start gap-2">
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                    p.warn
                      ? "bg-red-100 text-red-600"
                      : p.kind === "property"
                        ? "bg-navy-100 text-navy-700"
                        : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {p.kind === "property" ? <MapPin size={12} /> : <Radio size={12} />}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-bold text-navy-900 dark:text-white">{p.label}</p>
                  {p.sub && <p className="truncate text-[11px] text-slate-400">{p.sub}</p>}
                </div>
              </div>
              <a
                href={mapsUrl(p.lat, p.lng)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold uppercase text-amber-700 hover:border-amber-500 dark:border-amber-800/50"
              >
                <Navigation size={10} /> Open
                <ExternalLink size={9} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
