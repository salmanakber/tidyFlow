"use client"

/**
 * Optional realtime for web managers.
 * Exposes connection status for the sidebar LIVE pill.
 */
import { useEffect, useRef, useState, useCallback } from "react"

const EVENTS = [
  "cleaner:location",
  "task:status",
  "task:tracker",
  "task:geofence",
  "safety:sos",
  "notification:new",
  "realtime",
] as const

export type OpsRealtimeStatus = "connecting" | "live" | "offline"

export function useOpsRealtime(onEvent: () => void, enabled = true) {
  const cb = useRef(onEvent)
  cb.current = onEvent
  const [status, setStatus] = useState<OpsRealtimeStatus>("offline")

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setStatus("offline")
      return
    }
    let socket: any = null
    let cancelled = false
    setStatus("connecting")

    ;(async () => {
      try {
        const { io } = await import("socket.io-client")
        if (cancelled) return
        const token =
          localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
        socket = io({
          path: "/api/socket",
          transports: ["websocket", "polling"],
          auth: token ? { token } : undefined,
          reconnection: true,
          reconnectionAttempts: 8,
        })
        const fire = () => cb.current()
        socket.on("connect", () => {
          if (!cancelled) setStatus("live")
        })
        socket.on("disconnect", () => {
          if (!cancelled) setStatus("offline")
        })
        socket.on("connect_error", () => {
          if (!cancelled) setStatus("offline")
        })
        for (const ev of EVENTS) socket.on(ev, fire)
        if (socket.connected) setStatus("live")
      } catch {
        if (!cancelled) setStatus("offline")
      }
    })()

    return () => {
      cancelled = true
      if (socket) {
        for (const ev of EVENTS) socket.off(ev)
        socket.disconnect()
      }
      setStatus("offline")
    }
  }, [enabled])

  return { status }
}

/** Polling helper when socket is offline */
export function useInterval(fn: () => void, ms: number, enabled = true) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    if (!enabled || ms <= 0) return
    const id = setInterval(() => ref.current(), ms)
    return () => clearInterval(id)
  }, [ms, enabled])
}

export function useForceTick() {
  const [, setN] = useState(0)
  return useCallback(() => setN((n) => n + 1), [])
}
