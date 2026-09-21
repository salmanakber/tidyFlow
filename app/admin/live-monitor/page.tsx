"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import AdminLayout from "@/components/AdminLayout"
import LiveCommandCenter from "@/components/ops/LiveCommandCenter"
import { OpsSkeleton } from "@/components/ops/OpsChrome"

function Content() {
  const params = useSearchParams()
  const tabParam = params.get("tab")
  const initialTab =
    tabParam === "sos" ||
    tabParam === "exceptions" ||
    tabParam === "playback" ||
    tabParam === "timeline" ||
    tabParam === "fleet"
      ? tabParam
      : "fleet"

  return <LiveCommandCenter initialTab={initialTab} />
}

export default function LiveMonitorPage() {
  return (
    <AdminLayout>
      <Suspense
        fallback={
          <div className="space-y-4 p-1">
            <OpsSkeleton rows={3} cols={4} message="Opening fleet command…" />
          </div>
        }
      >
        <Content />
      </Suspense>
    </AdminLayout>
  )
}
