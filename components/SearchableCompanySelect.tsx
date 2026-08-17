"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Building2, ChevronDown, Search } from "lucide-react"

export interface CompanyOption {
  id: number
  name: string
  subtitle?: string
}

interface SearchableCompanySelectProps {
  companies: CompanyOption[]
  value: number | ""
  onChange: (companyId: number | "") => void
  placeholder?: string
  disabled?: boolean
  className?: string
  emptyMessage?: string
}

export default function SearchableCompanySelect({
  companies,
  value,
  onChange,
  placeholder = "Select company…",
  disabled = false,
  className = "",
  emptyMessage = "No companies found.",
}: SearchableCompanySelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = companies.find((c) => c.id === value)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return companies
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.subtitle?.toLowerCase().includes(q) ||
        String(c.id).includes(q)
    )
  }, [companies, search])

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

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        className="w-full flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-sm text-slate-800 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
        <span className={`flex-1 text-left truncate ${selected ? "" : "text-slate-400"}`}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-30 top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search companies…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-400 text-center">{emptyMessage}</p>
            ) : (
              filtered.map((company) => (
                <button
                  key={company.id}
                  type="button"
                  onClick={() => {
                    onChange(company.id)
                    setIsOpen(false)
                    setSearch("")
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    value === company.id
                      ? "bg-indigo-50 text-indigo-700 font-medium"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div className="font-medium truncate">{company.name}</div>
                  {company.subtitle && (
                    <div className="text-xs text-slate-400 mt-0.5 truncate">{company.subtitle}</div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
