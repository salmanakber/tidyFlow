"use client"

/**
 * Optional realtime refresh hook for web managers.
 * Listens to existing socket events if socket.io-client is installed;
 * otherwise no-ops. Never changes mobile API contracts.
 */
import { useEffect, useRef } from "react"

const EVENTS = [
  "cleaner:location",
  "task:status",
  "task:tracker",
  "task:geofence",
  "safety:sos",
] as const

export function useOpsRealtime(onEvent: () => void, enabled = true) {
  const cb = useRef(onEvent)
  cb.current = onEvent

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return
    let socket: any = null
    let cancelled = false

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
        })
        const fire = () => cb.current()
        for (const ev of EVENTS) socket.on(ev, fire)
      } catch {
        /* socket.io-client optional */
      }
    })()

    return () => {
      cancelled = true
      if (socket) {
        for (const ev of EVENTS) socket.off(ev)
        socket.disconnect()
      }
    }
  }, [enabled])
}
