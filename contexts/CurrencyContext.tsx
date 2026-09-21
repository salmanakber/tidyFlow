"use client"

/**
 * Company currency — same source as mobile App Preferences.
 * GET/PATCH /api/company/currency → AdminConfiguration.currency
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { adminGet, adminPatch, setActiveCurrency } from "@/lib/admin-session"
import {
  DEFAULT_CURRENCY,
  normalizeCurrencyCode,
} from "@/lib/stripe-currencies"

const CACHE_KEY = "tidyflow-company-currency"

type CurrencyContextValue = {
  currency: string
  symbol: string
  loading: boolean
  refresh: () => Promise<void>
  setCurrency: (code: string) => void
  updateCurrency: (code: string) => Promise<{ success: boolean; message?: string }>
  formatMoney: (
    amount: number | string | null | undefined,
    options?: { compact?: boolean; maximumFractionDigits?: number }
  ) => string
}

function currencySymbol(code: string): string {
  const normalized = normalizeCurrencyCode(code)
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: normalized,
    }).formatToParts(0)
    const sym = parts.find((p) => p.type === "currency")?.value
    if (sym && sym !== normalized) return sym
  } catch {
    /* fall through */
  }
  return `${normalized} `
}

function formatWithCode(
  amount: number | string | null | undefined,
  code: string,
  options?: { compact?: boolean; maximumFractionDigits?: number }
) {
  const value = typeof amount === "string" ? Number(amount) : Number(amount)
  const n = Number.isFinite(value) ? value : 0
  const currency = normalizeCurrencyCode(code)
  try {
    if (options?.compact) {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        notation: "compact",
        maximumFractionDigits: options.maximumFractionDigits ?? 1,
      }).format(n)
    }
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: options?.maximumFractionDigits ?? 2,
    }).format(n)
  } catch {
    return `${currency} ${n.toFixed(2)}`
  }
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: DEFAULT_CURRENCY,
  symbol: "$",
  loading: true,
  refresh: async () => {},
  setCurrency: () => {},
  updateCurrency: async () => ({ success: false }),
  formatMoney: (amount) => formatWithCode(amount, DEFAULT_CURRENCY),
})

function readCache(): string {
  if (typeof window === "undefined") return DEFAULT_CURRENCY
  try {
    const companyId = localStorage.getItem("selectedCompanyId") || "default"
    const raw = localStorage.getItem(`${CACHE_KEY}:${companyId}`)
    if (raw) return normalizeCurrencyCode(raw)
  } catch {
    /* ignore */
  }
  return DEFAULT_CURRENCY
}

function writeCache(code: string) {
  try {
    const companyId = localStorage.getItem("selectedCompanyId") || "default"
    localStorage.setItem(`${CACHE_KEY}:${companyId}`, normalizeCurrencyCode(code))
  } catch {
    /* ignore */
  }
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState(DEFAULT_CURRENCY)
  const [loading, setLoading] = useState(true)

  const apply = useCallback((code: string) => {
    const normalized = normalizeCurrencyCode(code)
    setCurrencyState(normalized)
    setActiveCurrency(normalized)
    writeCache(normalized)
  }, [])

  const refresh = useCallback(async () => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
        : null
    if (!token) {
      apply(DEFAULT_CURRENCY)
      setLoading(false)
      return
    }

    const cached = readCache()
    apply(cached)
    setLoading(true)
    try {
      const res = await adminGet("/api/company/currency")
      if (res.data?.success && res.data.data?.currency) {
        apply(String(res.data.data.currency))
      }
    } catch {
      /* keep cache */
    } finally {
      setLoading(false)
    }
  }, [apply])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Re-fetch when company selection changes (platform company switcher)
  useEffect(() => {
    if (typeof window === "undefined") return
    const onStorage = (e: StorageEvent) => {
      if (e.key === "selectedCompanyId" || e.key === "authToken") {
        void refresh()
      }
    }
    window.addEventListener("storage", onStorage)
    const onFocus = () => {
      void refresh()
    }
    window.addEventListener("focus", onFocus)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("focus", onFocus)
    }
  }, [refresh])

  const setCurrency = useCallback(
    (code: string) => {
      apply(code)
    },
    [apply]
  )

  /** Owner/billing access — same PATCH as mobile App Preferences */
  const updateCurrency = useCallback(
    async (code: string) => {
      try {
        const res = await adminPatch("/api/company/currency", {
          currency: normalizeCurrencyCode(code),
        })
        if (res.data?.success) {
          apply(String(res.data.data?.currency || code))
          return { success: true, message: res.data.message as string | undefined }
        }
        return {
          success: false,
          message: (res.data?.message as string) || "Failed to update currency",
        }
      } catch (e: any) {
        return {
          success: false,
          message: e?.response?.data?.message || e?.message || "Failed to update currency",
        }
      }
    },
    [apply]
  )

  const formatMoney = useCallback(
    (
      amount: number | string | null | undefined,
      options?: { compact?: boolean; maximumFractionDigits?: number }
    ) => formatWithCode(amount, currency, options),
    [currency]
  )

  const value = useMemo(
    () => ({
      currency,
      symbol: currencySymbol(currency),
      loading,
      refresh,
      setCurrency,
      updateCurrency,
      formatMoney,
    }),
    [currency, loading, refresh, setCurrency, updateCurrency, formatMoney]
  )

  return (
    <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
  )
}

export function useCurrency() {
  return useContext(CurrencyContext)
}
