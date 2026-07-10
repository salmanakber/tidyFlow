"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import axios from "axios"
import { Building2, ChevronDown, Search } from "lucide-react"

interface Company {
  id: number
  name: string
  subscriptionStatus: string
}

interface CompanySelectorProps {
  selectedCompanyId: number | null
  onCompanyChange: (companyId: number | null) => void
  userRole: string
}

export default function CompanySelector({ selectedCompanyId, onCompanyChange, userRole }: CompanySelectorProps) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (userRole === "SUPER_ADMIN" || userRole === "OWNER" || userRole === "DEVELOPER") {
      loadCompanies()
    }
  }, [userRole])

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch("")
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchRef.current?.focus(), 0)
    } else {
      setSearch("")
    }
  }, [isOpen])

  const loadCompanies = async () => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const response = await axios.get("/api/admin/companies", {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.data.success) {
        setCompanies(response.data.data)
        if (!selectedCompanyId && response.data.data.length > 0) {
          onCompanyChange(response.data.data[0].id)
        }
      }
    } catch (error) {
      console.error("Error loading companies:", error)
    } finally {
      setLoading(false)
    }
  }

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId)

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return companies
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.subscriptionStatus.toLowerCase().includes(q) ||
        String(c.id).includes(q)
    )
  }, [companies, search])

  if (userRole !== "SUPER_ADMIN" && userRole !== "OWNER" && userRole !== "DEVELOPER") {
    return null
  }

  if (loading) {
    return (
      <div className="px-4 py-2 bg-gray-100 rounded-lg animate-pulse">
        <div className="h-4 w-32 bg-gray-300 rounded"></div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors min-w-[200px]"
      >
        <Building2 className="w-4 h-4 text-gray-600 shrink-0" />
        <span className="text-sm font-medium text-gray-700 truncate flex-1 text-left">
          {selectedCompany ? selectedCompany.name : "Select Company"}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-600 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search companies…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            <button
              onClick={() => {
                onCompanyChange(null)
                setIsOpen(false)
                setSearch("")
                window.location.reload()
              }}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                selectedCompanyId === null
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              All Companies
            </button>
            {filteredCompanies.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">No companies match your search.</p>
            ) : (
              filteredCompanies.map((company) => (
                <button
                  key={company.id}
                  onClick={() => {
                    onCompanyChange(company.id)
                    setIsOpen(false)
                    setSearch("")
                    window.location.reload()
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedCompanyId === company.id
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{company.name}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded shrink-0 ${
                        company.subscriptionStatus === "active"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {company.subscriptionStatus}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
