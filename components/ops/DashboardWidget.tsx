"use client"

import { useState } from "react"
import { GripVertical, Eye, EyeOff } from "lucide-react"
import type { DashboardWidgetId } from "@/hooks/useDashboardLayout"
import { DASHBOARD_WIDGET_LABELS } from "@/hooks/useDashboardLayout"

/**
 * Draggable dashboard section shell. Uses HTML5 DnD — no extra deps.
 */
export default function DashboardWidget({
  id,
  editMode,
  onMove,
  onToggleHidden,
  hidden,
  children,
}: {
  id: DashboardWidgetId
  editMode: boolean
  onMove: (from: DashboardWidgetId, to: DashboardWidgetId) => void
  onToggleHidden?: (id: DashboardWidgetId) => void
  hidden?: boolean
  children: React.ReactNode
}) {
  const [dragging, setDragging] = useState(false)
  const [over, setOver] = useState(false)

  if (hidden && !editMode) return null

  return (
    <div
      draggable={editMode}
      onDragStart={(e) => {
        if (!editMode) return
        e.dataTransfer.setData("text/widget-id", id)
        e.dataTransfer.effectAllowed = "move"
        setDragging(true)
      }}
      onDragEnd={() => setDragging(false)}
      onDragOver={(e) => {
        if (!editMode) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!editMode) return
        e.preventDefault()
        setOver(false)
        const from = e.dataTransfer.getData("text/widget-id") as DashboardWidgetId
        if (from) onMove(from, id)
      }}
      className={`relative transition ${
        editMode
          ? `rounded-xl ring-2 ${
              over
                ? "ring-amber-500"
                : dragging
                  ? "opacity-60 ring-amber-300"
                  : "ring-dashed ring-slate-300 dark:ring-navy-700"
            }`
          : ""
      } ${hidden && editMode ? "opacity-40" : ""}`}
    >
      {editMode && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 dark:border-amber-900/40 dark:bg-amber-950/30">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
            <GripVertical size={14} className="cursor-grab text-amber-600" />
            {DASHBOARD_WIDGET_LABELS[id]}
          </span>
          {onToggleHidden && (
            <button
              type="button"
              onClick={() => onToggleHidden(id)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-white dark:text-slate-300"
            >
              {hidden ? <Eye size={12} /> : <EyeOff size={12} />}
              {hidden ? "Show" : "Hide"}
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
