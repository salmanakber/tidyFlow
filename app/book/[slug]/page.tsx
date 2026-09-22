"use client"

import { Suspense } from "react"
import PublicBookPage from "./PublicBookClient"

export default function BookPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F7F4EF]">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#0B1F33]/20 border-t-[#0B1F33]" />
        </div>
      }
    >
      <PublicBookPage />
    </Suspense>
  )
}
