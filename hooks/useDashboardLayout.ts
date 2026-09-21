"use client"

/**
 * Persist dashboard widget order / hidden state in localStorage.
 */
import { useCallback, useEffect, useState } from "react"

export const DASHBOARD_WIDGET_IDS = [
  "needsMe",
  "command",
  "kpis",
  "charts",
  "queue",
] as const

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number]

export const DASHBOARD_WIDGET_LABELS: Record<DashboardWidgetId, string> = {
  needsMe: "What needs me",
  command: "Dispatch command",
  kpis: "Telemetry KPIs",
  charts: "Charts & trends",
  queue: "Active queue",
}

const STORAGE_KEY = "tidyflow-dashboard-layout-v1"

type LayoutState = {
  order: DashboardWidgetId[]
  hidden: DashboardWidgetId[]
}

function defaultLayout(): LayoutState {
  return {
    order: [...DASHBOARD_WIDGET_IDS],
    hidden: [],
  }
}

function loadLayout(): LayoutState {
  if (typeof window === "undefined") return defaultLayout()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultLayout()
    const parsed = JSON.parse(raw) as Partial<LayoutState>
    const order = (parsed.order || []).filter((id): id is DashboardWidgetId =>
      (DASHBOARD_WIDGET_IDS as readonly string[]).includes(id)
    )
    const hidden = (parsed.hidden || []).filter((id): id is DashboardWidgetId =>
      (DASHBOARD_WIDGET_IDS as readonly string[]).includes(id)
    )
    // Ensure all known widgets present
    for (const id of DASHBOARD_WIDGET_IDS) {
      if (!order.includes(id)) order.push(id)
    }
    return { order, hidden }
  } catch {
    return defaultLayout()
  }
}

export function useDashboardLayout() {
  const [layout, setLayout] = useState<LayoutState>(defaultLayout)
  const [ready, setReady] = useState(false)
  const [editMode, setEditMode] = useState(false)

  useEffect(() => {
    setLayout(loadLayout())
    setReady(true)
  }, [])

  const persist = useCallback((next: LayoutState) => {
    setLayout(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* ignore quota */
    }
  }, [])

  const moveWidget = useCallback(
    (fromId: DashboardWidgetId, toId: DashboardWidgetId) => {
      if (fromId === toId) return
      setLayout((prev) => {
        const order = [...prev.order]
        const from = order.indexOf(fromId)
        const to = order.indexOf(toId)
        if (from < 0 || to < 0) return prev
        order.splice(from, 1)
        order.splice(to, 0, fromId)
        const next = { ...prev, order }
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
    },
    []
  )

  const toggleHidden = useCallback((id: DashboardWidgetId) => {
    setLayout((prev) => {
      const hidden = prev.hidden.includes(id)
        ? prev.hidden.filter((x) => x !== id)
        : [...prev.hidden, id]
      const next = { ...prev, hidden }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const reset = useCallback(() => {
    persist(defaultLayout())
  }, [persist])

  const visibleOrder = layout.order.filter((id) => !layout.hidden.includes(id))

  return {
    ready,
    editMode,
    setEditMode,
    order: layout.order,
    hidden: layout.hidden,
    visibleOrder,
    moveWidget,
    toggleHidden,
    reset,
  }
}
