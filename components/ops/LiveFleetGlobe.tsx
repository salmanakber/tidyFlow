"use client"

/**
 * Gray Shopify-style 3D globe for Live fleet positions.
 * Pure canvas (no extra deps) — soft lit sphere, land arcs, marker pins.
 */
import { useEffect, useRef } from "react"
import type { FleetMapMarker } from "@/components/ops/LiveFleetMap"

type Vec3 = { x: number; y: number; z: number }

function latLngToVec(lat: number, lng: number, radius = 1): Vec3 {
  const φ = (lat * Math.PI) / 180
  const λ = (lng * Math.PI) / 180
  return {
    x: radius * Math.cos(φ) * Math.cos(λ),
    y: radius * Math.sin(φ),
    z: radius * Math.cos(φ) * Math.sin(λ),
  }
}

function rotateY(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c }
}

function rotateX(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c }
}

/** Lightweight land “blobs” (approx continents) as lat/lng samples for gray land look. */
const LAND_DOTS: Array<[number, number]> = (() => {
  const pts: Array<[number, number]> = []
  const regions: Array<[number, number, number, number, number]> = [
    // lat0, lng0, latSpan, lngSpan, density
    [55, -100, 25, 50, 28], // N America
    [10, -70, 20, 30, 18], // S America
    [50, 10, 20, 40, 30], // Europe
    [15, 20, 25, 40, 24], // Africa
    [45, 90, 30, 60, 32], // Asia
    [-25, 135, 18, 30, 16], // Australia
  ]
  for (const [lat0, lng0, latSpan, lngSpan, n] of regions) {
    for (let i = 0; i < n; i++) {
      pts.push([
        lat0 + (Math.random() - 0.5) * latSpan,
        lng0 + (Math.random() - 0.5) * lngSpan,
      ])
    }
  }
  return pts
})()

export default function LiveFleetGlobe({
  markers,
  height = 460,
  onMarkerClick,
}: {
  markers: FleetMapMarker[]
  height?: number
  onMarkerClick?: (m: FleetMapMarker) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const rotRef = useRef(0.35)
  const tiltRef = useRef(0.35)
  const dragRef = useRef<{ x: number; y: number; rot: number; tilt: number } | null>(null)
  const markersRef = useRef(markers)
  markersRef.current = markers
  const clickRef = useRef(onMarkerClick)
  clickRef.current = onMarkerClick
  const hitRef = useRef<Array<{ m: FleetMapMarker; x: number; y: number; r: number }>>([])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let raf = 0
    let alive = true
    let auto = true

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = wrap.clientWidth
      const h = height
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const draw = () => {
      if (!alive) return
      const w = wrap.clientWidth
      const h = height
      const cx = w / 2
      const cy = h / 2
      const R = Math.min(w, h) * 0.38

      if (auto && !dragRef.current) rotRef.current += 0.0022

      ctx.clearRect(0, 0, w, h)

      // Soft vignette background
      const bg = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, Math.max(w, h) * 0.7)
      bg.addColorStop(0, "#1e293b")
      bg.addColorStop(0.55, "#0f172a")
      bg.addColorStop(1, "#020617")
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      // Atmosphere glow
      const glow = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.25)
      glow.addColorStop(0, "rgba(148,163,184,0.18)")
      glow.addColorStop(1, "rgba(148,163,184,0)")
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(cx, cy, R * 1.25, 0, Math.PI * 2)
      ctx.fill()

      // Sphere body
      const body = ctx.createRadialGradient(
        cx - R * 0.35,
        cy - R * 0.4,
        R * 0.1,
        cx,
        cy,
        R
      )
      body.addColorStop(0, "#64748b")
      body.addColorStop(0.45, "#475569")
      body.addColorStop(0.85, "#334155")
      body.addColorStop(1, "#1e293b")
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.fillStyle = body
      ctx.fill()

      // Specular highlight
      const spec = ctx.createRadialGradient(
        cx - R * 0.35,
        cy - R * 0.45,
        0,
        cx - R * 0.2,
        cy - R * 0.3,
        R * 0.7
      )
      spec.addColorStop(0, "rgba(248,250,252,0.35)")
      spec.addColorStop(0.4, "rgba(226,232,240,0.08)")
      spec.addColorStop(1, "rgba(255,255,255,0)")
      ctx.fillStyle = spec
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.fill()

      const project = (lat: number, lng: number) => {
        let v = latLngToVec(lat, lng)
        v = rotateY(v, rotRef.current)
        v = rotateX(v, tiltRef.current)
        return v
      }

      // Grid lines
      ctx.strokeStyle = "rgba(226,232,240,0.12)"
      ctx.lineWidth = 1
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath()
        let started = false
        for (let lng = -180; lng <= 180; lng += 6) {
          const v = project(lat, lng)
          if (v.z < 0) {
            started = false
            continue
          }
          const x = cx + v.x * R
          const y = cy - v.y * R
          if (!started) {
            ctx.moveTo(x, y)
            started = true
          } else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      for (let lng = -180; lng < 180; lng += 30) {
        ctx.beginPath()
        let started = false
        for (let lat = -90; lat <= 90; lat += 6) {
          const v = project(lat, lng)
          if (v.z < 0) {
            started = false
            continue
          }
          const x = cx + v.x * R
          const y = cy - v.y * R
          if (!started) {
            ctx.moveTo(x, y)
            started = true
          } else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }

      // Land dots
      for (const [lat, lng] of LAND_DOTS) {
        const v = project(lat, lng)
        if (v.z < 0.05) continue
        const x = cx + v.x * R
        const y = cy - v.y * R
        const depth = (v.z + 1) / 2
        ctx.fillStyle = `rgba(203,213,225,${0.15 + depth * 0.35})`
        ctx.beginPath()
        ctx.arc(x, y, 1.4 + depth * 1.2, 0, Math.PI * 2)
        ctx.fill()
      }

      // Rim stroke
      ctx.strokeStyle = "rgba(148,163,184,0.35)"
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.stroke()

      // Markers
      const hits: Array<{ m: FleetMapMarker; x: number; y: number; r: number }> = []
      const list = markersRef.current.filter(
        (m) => Number.isFinite(m.lat) && Number.isFinite(m.lng)
      )
      for (const m of list) {
        const v = project(m.lat, m.lng)
        if (v.z < 0.02) continue
        const x = cx + v.x * R
        const y = cy - v.y * R
        const depth = (v.z + 1) / 2
        const r = 4 + depth * 3
        const color =
          m.kind === "sos"
            ? "#f43f5e"
            : m.warn
              ? "#f59e0b"
              : m.kind === "property"
                ? "#94a3b8"
                : "#10b981"

        ctx.beginPath()
        ctx.arc(x, y, r + 4, 0, Math.PI * 2)
        ctx.fillStyle = `${color}33`
        ctx.fill()
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        ctx.strokeStyle = "rgba(255,255,255,0.85)"
        ctx.lineWidth = 1.5
        ctx.stroke()
        hits.push({ m, x, y, r: r + 6 })
      }
      hitRef.current = hits

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)

    const onDown = (e: PointerEvent) => {
      auto = false
      dragRef.current = {
        x: e.clientX,
        y: e.clientY,
        rot: rotRef.current,
        tilt: tiltRef.current,
      }
      canvas.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.x
      const dy = e.clientY - dragRef.current.y
      rotRef.current = dragRef.current.rot + dx * 0.008
      tiltRef.current = Math.max(
        -0.9,
        Math.min(0.9, dragRef.current.tilt + dy * 0.006)
      )
    }
    const onUp = () => {
      dragRef.current = null
      setTimeout(() => {
        auto = true
      }, 2200)
    }
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const hit = hitRef.current.find(
        (h) => (h.x - x) ** 2 + (h.y - y) ** 2 <= h.r ** 2
      )
      if (hit) clickRef.current?.(hit.m)
    }

    canvas.addEventListener("pointerdown", onDown)
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("pointerup", onUp)
    canvas.addEventListener("pointercancel", onUp)
    canvas.addEventListener("click", onClick)

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerup", onUp)
      canvas.removeEventListener("pointercancel", onUp)
      canvas.removeEventListener("click", onClick)
    }
  }, [height])

  return (
    <div
      ref={wrapRef}
      className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
      style={{ height }}
    >
      <canvas ref={canvasRef} className="block h-full w-full cursor-grab active:cursor-grabbing" />
      <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/40 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-300 backdrop-blur-sm">
        3D globe · drag to orbit
      </div>
      {markers.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-lg bg-black/45 px-3 py-2 text-xs text-slate-300 backdrop-blur-sm">
            Waiting for live GPS pins…
          </p>
        </div>
      )}
    </div>
  )
}
