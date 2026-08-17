"use client"

import { useEffect } from "react"

export default function PartnerIndexPage() {
  useEffect(() => {
    const token = localStorage.getItem("partnerAuthToken")
    window.location.replace(token ? "/partner/dashboard" : "/partner/login")
  }, [])
  return <main className="min-h-screen grid place-items-center text-slate-500">Redirecting…</main>
}
