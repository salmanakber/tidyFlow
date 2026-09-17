"use client"

import { useEffect } from "react"
import { useParams, useRouter } from "next/navigation"

/** /{companySlug} → /{companySlug}/dashboard */
export default function CompanyRootPage() {
  const params = useParams()
  const router = useRouter()
  const slug = typeof params?.companySlug === "string" ? params.companySlug : ""

  useEffect(() => {
    if (slug) router.replace(`/${slug}/dashboard`)
  }, [slug, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-control-canvas">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-600" />
    </div>
  )
}
