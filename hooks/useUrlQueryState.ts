"use client"

/**
 * Sync filter to URL search params (web-only UX).
 */
import { useCallback, useEffect, useState } from "react"

export function useUrlQueryState(key: string, fallback = "all") {
  const [value, setValue] = useState(fallback)

  useEffect(() => {
    if (typeof window === "undefined") return
    const fromUrl = new URLSearchParams(window.location.search).get(key)
    if (fromUrl) setValue(fromUrl)
  }, [key])

  const set = useCallback(
    (next: string) => {
      setValue(next)
      if (typeof window === "undefined") return
      const url = new URL(window.location.href)
      if (!next || next === fallback) url.searchParams.delete(key)
      else url.searchParams.set(key, next)
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`)
    },
    [key, fallback]
  )

  return [value, set] as const
}
