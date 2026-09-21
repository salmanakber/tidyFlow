"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import AdminLayout from "@/components/AdminLayout"
import LiveCommandCenter from "@/components/ops/LiveCommandCenter"
import { OpsSkeleton } from "@/components/ops/OpsChrome"

/**
 * Safety & GPS — same fleet command center, default SOS tab.
 * Merges with Live Monitor so managers have one ops war room.
 */
function Content() {
  const params = useSearchParams()
  const tabParam = params.get("tab")
  const initialTab =
    tabParam === "fleet" ||
    tabParam === "exceptions" ||
    tabParam === "playback" ||
    tabParam === "timeline" ||
    tabParam === "sos"
      ? tabParam
      : "sos"

  return <LiveCommandCenter initialTab={initialTab} />
}

export default function SafetyPage() {
  return (
    <AdminLayout>
      <Suspense
        fallback={
          <div className="space-y-4 p-1">
            <OpsSkeleton rows={3} cols={4} message="Opening safety command…" />
          </div>
        }
      >
        <Content />
      </Suspense>
    </AdminLayout>
  )
}
