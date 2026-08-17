"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { getAdminToken, getCustomerToken } from "@/lib/customer-account"

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const adminToken = getAdminToken()
    const customerToken = getCustomerToken()

    if (customerToken && !adminToken) {
      router.push("/account/billing")
      return
    }
    if (adminToken) {
      router.push("/admin/dashboard")
      return
    }
    router.push("/login")
  }, [router])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
    </main>
  )
}
