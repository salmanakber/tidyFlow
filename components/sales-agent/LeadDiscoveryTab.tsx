
"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  saGet,
  saPost,
  saDelete,
  LoadingBlock,
  MessageBanner,
  EmptyState,
  btnPrimary,
  btnSecondary,
  inputCls,
  ProgressBar,
} from "./shared"
import { Search, Sparkles, RefreshCw, X, Plus, Info, Trash2, FolderPlus, FolderInput, MapPin, Globe, Eye, Phone, Filter, Mail } from "lucide-react"
import QueuePanel from "./QueuePanel"

function parseTags(text: string): string[] {
  return text
    .split(/[\n,;|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function TagInput({
  label,
  hint,
  tags,
  onChange,
  placeholder,
}: {
  label: string
  hint?: string
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState("")

  const add = () => {
    const next = parseTags(draft)
    if (!next.length) return
    onChange(Array.from(new Set([...tags, ...next])))
    setDraft("")
  }

  return (
    <div className="space-y-2">
      <div>
        <label className="text-sm font-bold text-[#0D1E36]">{label}</label>
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      </div>
      
      <div className="flex flex-wrap gap-2 min-h-[38px] p-2 bg-slate-50 border border-gray-200 rounded-lg">
        {tags.length === 0 ? (
          <span className="text-xs text-gray-400 px-2 py-1 select-none">No tags added yet</span>
        ) : (
          tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 rounded-full bg-white border border-gray-200 text-[#0D1E36] text-xs px-3 py-1 font-semibold shadow-xs"
            >
              {t}
              <button 
                type="button" 
                onClick={() => onChange(tags.filter((x) => x !== t))} 
                className="text-gray-400 hover:text-[#9A2A1E] transition-colors p-0.5 rounded-full hover:bg-slate-100"
                aria-label={`Remove ${t}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))
        )}
      </div>

      <div className="flex gap-2">
        <input
          className={`${inputCls} focus:border-[#D97706] text-sm h-[42px]`}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault()
              add()
            }
          }}
        />
        <button 
          type="button" 
          className="flex items-center justify-center bg-white hover:bg-slate-50 text-[#0D1E36] border border-gray-200 px-4 py-2.5 rounded-lg shadow-sm transition-all h-[42px]" 
          onClick={add}
        >
          <Plus className="w-5 h-5 text-[#D97706]" />
        </button>
      </div>
    </div>
  )
}

const PAGE_SIZE_OPTIONS = [5, 15,  25, 100, 250] as const

type BusinessMaturity = "any" | "likely_new" | "established" | "opening_soon"
type WebsiteFilter = "any" | "with_website" | "without_website"

export default function LeadDiscoveryTab() {
  const [method, setMethod] = useState<"google_places" | "search_engine">("google_places")
  const [countries, setCountries] = useState<string[]>([])
  const [cities, setCities] = useState<string[]>([])
  const [keywords, setKeywords] = useState<string[]>(["Cleaning Company", "Commercial Cleaning"])
  const [maxResults, setMaxResults] = useState("15")
  const [maturity, setMaturity] = useState<BusinessMaturity>("any")
  const [websiteFilter, setWebsiteFilter] = useState<WebsiteFilter>("any")
  const [minRating, setMinRating] = useState("")
  const [includeServiceArea, setIncludeServiceArea] = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [aiNote, setAiNote] = useState("")
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const [leads, setLeads] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(25)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<number[]>([])
  const [search, setSearch] = useState("")
  const [emailSentFilter, setEmailSentFilter] = useState<"" | "true" | "false">("false")
  const [emailFoundFilter, setEmailFoundFilter] = useState<"" | "true" | "false">("")
  const [phoneFoundFilter, setPhoneFoundFilter] = useState<"" | "true" | "false">("")
  const [minScoreFilter, setMinScoreFilter] = useState<"" | "30" | "50" | "60" | "80">("")
  const [analyzedFilter, setAnalyzedFilter] = useState<"" | "true" | "false">("")
  const [groups, setGroups] = useState<any[]>([])
  const [groupFilter, setGroupFilter] = useState<string>("")
  const [ungroupedOnly, setUngroupedOnly] = useState(false)
  const [repliedOnly, setRepliedOnly] = useState(false)
  const [activeGroupProgress, setActiveGroupProgress] = useState<any | null>(null)
  const [trackingGroupId, setTrackingGroupId] = useState<number | null>(null)
  const [analyzeBatchIds, setAnalyzeBatchIds] = useState<number[]>([])
  const [analyzeProgress, setAnalyzeProgress] = useState<{
    total: number
    done: number
    remaining: number
    deleted: number
    pct: number
  } | null>(null)
  const [newGroupName, setNewGroupName] = useState("")
  const [assignGroupId, setAssignGroupId] = useState("")
  const [showAssignPanel, setShowAssignPanel] = useState(false)
  const [detailLead, setDetailLead] = useState<any | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const loadGroups = useCallback(async () => {
    try {
      const data = await saGet("/groups")
      setGroups(Array.isArray(data) ? data : [])
      const running = (Array.isArray(data) ? data : []).find(
        (g: any) => g.status === "RUNNING" || g.status === "QUEUED"
      )
      setActiveGroupProgress(running || null)
    } catch {
      /* ignore */
    }
  }, [])

  const loadLeads = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    try {
      const data = await saGet("/leads", {
        page,
        pageSize,
        search: search || undefined,
        emailSent: emailSentFilter || undefined,
        emailFound: emailFoundFilter || undefined,
        phoneFound: phoneFoundFilter || undefined,
        minScore: minScoreFilter || undefined,
        analyzed: analyzedFilter || undefined,
        discoveryGroupId: groupFilter || undefined,
        ungrouped: ungroupedOnly ? "true" : undefined,
        replied: repliedOnly ? "true" : undefined,
      })
      setLeads(data.items)
      setTotal(data.total)
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [
    page,
    pageSize,
    search,
    emailSentFilter,
    emailFoundFilter,
    phoneFoundFilter,
    minScoreFilter,
    analyzedFilter,
    groupFilter,
    ungroupedOnly,
    repliedOnly,
  ])

  const openLeadDetail = async (lead: any) => {
    setDetailLead(lead)
    setDetailLoading(true)
    try {
      const full = await saGet(`/leads/${lead.id}`)
      setDetailLead(full)
    } catch {
      /* keep list row data */
    } finally {
      setDetailLoading(false)
    }
  }

  const clearFilters = () => {
    setSearch("")
    setEmailSentFilter("")
    setEmailFoundFilter("")
    setPhoneFoundFilter("")
    setMinScoreFilter("")
    setAnalyzedFilter("")
    setGroupFilter("")
    setUngroupedOnly(false)
    setRepliedOnly(false)
    setPage(1)
  }

  const activeFilterCount = [
    search,
    emailSentFilter,
    emailFoundFilter,
    phoneFoundFilter,
    minScoreFilter,
    analyzedFilter,
    groupFilter || (ungroupedOnly ? "ungrouped" : ""),
    repliedOnly ? "1" : "",
  ].filter(Boolean).length

  useEffect(() => {
    loadLeads()
  }, [loadLeads])

  useEffect(() => {
    loadGroups()
    saPost("/groups", { action: "ensure_priority" }).then(() => loadGroups()).catch(() => {})
  }, [loadGroups])

  const refreshAll = useCallback(async () => {
    await Promise.all([loadLeads({ silent: true }), loadGroups()])
  }, [loadLeads, loadGroups])

  const finishDiscovery = useCallback(
    async (note?: string) => {
      setDiscovering(false)
      setTrackingGroupId(null)
      setMessage({ type: "success", text: note || "Find leads finished — list updated." })
      await refreshAll()
    },
    [refreshAll]
  )

  const finishAnalyze = useCallback(
    async (note?: string) => {
      setAnalyzing(false)
      setAnalyzeBatchIds([])
      setAnalyzeProgress(null)
      setMessage({ type: "success", text: note || "Analyze finished — list updated." })
      await refreshAll()
    },
    [refreshAll]
  )

  const handleQueueIdle = useCallback(() => {
    // Soft signal only — discovery/analyze completion is driven by group + analyze_status polls
    if (!discovering && !analyzing) {
      refreshAll()
    }
  }, [refreshAll, discovering, analyzing])

  // Live refresh while find/analyze runs (do not wait for queue "idle" — delayed emails keep Redis busy forever)
  useEffect(() => {
    if (!discovering && !analyzing) return

    let cancelled = false
    let analyzeIdleStreak = 0
    let discoverIdleStreak = 0

    const tick = async () => {
      if (cancelled) return
      try {
        await Promise.all([loadLeads({ silent: true }), loadGroups()])

        if (discovering && trackingGroupId) {
          const data = await saGet("/groups").catch(() => null)
          const list = Array.isArray(data) ? data : []
          const g = list.find((x: any) => x.id === trackingGroupId) || null
          if (g) {
            setActiveGroupProgress(g)
            if (g.status === "COMPLETED" || (g.totalChunks > 0 && g.completedChunks >= g.totalChunks)) {
              await finishDiscovery(
                `Find leads done — ${g.createdCount ?? 0} new, ${g.skippedCount ?? 0} duplicates (${g.completedChunks}/${g.totalChunks} searches).`
              )
              return
            }
          }
          const queue = await saGet("/jobs").catch(() => null)
          const c = queue?.counts || {}
          const discoverBusy = (c.discoverActive || 0) + (c.discoverWaiting || 0)
          if (discoverBusy === 0) {
            discoverIdleStreak++
            // Worker finished but group counter lagged — stop spinner after ~10s idle
            if (discoverIdleStreak >= 4) {
              await finishDiscovery(
                g
                  ? `Find leads updated — ${g.createdCount ?? 0} new so far (${g.completedChunks ?? 0}/${g.totalChunks || "?"} searches).`
                  : "Find leads updated — refresh if anything is still missing."
              )
              return
            }
          } else {
            discoverIdleStreak = 0
          }
        }

        if (analyzing && analyzeBatchIds.length) {
          const status = await saPost("/leads", {
            action: "analyze_status",
            ids: analyzeBatchIds,
          })
          if (cancelled) return
          setAnalyzeProgress({
            total: status.total,
            done: status.done,
            remaining: status.remaining,
            deleted: status.deleted || 0,
            pct: status.pct ?? 0,
          })
          const queue = await saGet("/jobs").catch(() => null)
          const c = queue?.counts || {}
          const analyzeBusy = (c.analyzeActive || 0) + (c.analyzeWaiting || 0)
          if (status.remaining === 0) {
            const removed = status.deleted ? ` · ${status.deleted} removed (no email)` : ""
            await finishAnalyze(`Analyze done — ${status.done}/${status.total} processed${removed}.`)
            return
          }
          if (analyzeBusy === 0) {
            analyzeIdleStreak++
            // No analyze jobs left but some leads unfinished — stop stuck spinner
            if (analyzeIdleStreak >= 3) {
              await finishAnalyze(
                `Analyze stopped at ${status.done}/${status.total} (queue empty). Re-select remaining and Analyze again if needed.`
              )
            }
          } else {
            analyzeIdleStreak = 0
          }
        }
      } catch {
        /* keep polling */
      }
    }

    tick()
    const t = setInterval(tick, 2500)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [
    discovering,
    analyzing,
    trackingGroupId,
    analyzeBatchIds,
    loadLeads,
    loadGroups,
    finishDiscovery,
    finishAnalyze,
  ])

  const askAI = async () => {
    if (!countries.length) {
      setMessage({ type: "error", text: "Add at least one country first" })
      return
    }
    setSuggesting(true)
    setMessage(null)
    try {
      const data = await saPost("/leads/discover", {
        action: "suggest_keywords",
        countries,
        cities,
        notes: aiNote || undefined,
      })
      if (data.keywords?.length) {
        setKeywords(Array.from(new Set([...keywords, ...data.keywords])))
      }
      if (data.cities?.length && !cities.length) {
        setCities(data.cities.slice(0, 8))
      } else if (data.cities?.length) {
        setCities(Array.from(new Set([...cities, ...data.cities])).slice(0, 20))
      }
      setMessage({
        type: "success",
        text: data.rationale || `Added ${data.keywords?.length || 0} AI keyword ideas`,
      })
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setSuggesting(false)
    }
  }

  const discover = async (useQueue = true) => {
    if (!keywords.length) {
      setMessage({ type: "error", text: "Add keywords (or use AI Suggest)" })
      return
    }
    if (!countries.length && method === "google_places") {
      setMessage({
        type: "error",
        text: "Add at least one country (or switch to Search Engine)",
      })
      return
    }
    setDiscovering(true)
    setMessage(null)
    try {
      const filters =
        method === "google_places"
          ? {
              maturity,
              website: websiteFilter,
              minRating: minRating ? Number(minRating) : undefined,
              includePureServiceArea: includeServiceArea,
            }
          : undefined
      const data = await saPost(
        "/leads/discover",
        {
          method,
          async: useQueue,
          keywords,
          countries,
          cities,
          maxResults: Number(maxResults) || 15,
          ...(filters ? { filters } : {}),
        },
        { timeout: useQueue ? 60000 : 300000 }
      )

      if (data.discoveryGroupId) {
        setGroupFilter(String(data.discoveryGroupId))
        setTrackingGroupId(Number(data.discoveryGroupId))
        setPage(1)
      }

      if (useQueue) {
        setMessage({
          type: "success",
          text:
            data.note ||
            `Started ${data.enqueued ?? data.chunks ?? 0} search(es). Results will appear here as they finish.`,
        })
        await loadGroups()
        if (!(data.enqueued > 0)) {
          setDiscovering(false)
          setTrackingGroupId(null)
          await refreshAll()
        }
      } else {
        const failed = (data.details || []).filter((d: any) => d.error)
        const errHint = failed.length
          ? ` · ${failed.length} failed${failed[0]?.error ? `: ${failed[0].error}` : ""}`
          : ""
        setMessage({
          type: failed.length && !data.created ? "error" : "success",
          text: `Group ready: ${data.created ?? 0} new, ${data.skipped ?? 0} duplicates (${data.runs ?? 0} chunks)${errHint}`,
        })
        setDiscovering(false)
        await refreshAll()
      }
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || "Search failed"
      setMessage({ type: "error", text: msg })
      setDiscovering(false)
    }
  }

  const allVisibleSelected = useMemo(
    () => leads.length > 0 && leads.every((l) => selected.includes(l.id)),
    [leads, selected]
  )

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      const visible = new Set(leads.map((l) => l.id))
      setSelected((prev) => prev.filter((id) => !visible.has(id)))
    } else {
      setSelected((prev) => Array.from(new Set([...prev, ...leads.map((l) => l.id)])))
    }
  }

  const runBulkAnalyze = async () => {
    if (!selected.length) return
    const ids = [...selected]
    setAnalyzing(true)
    setAnalyzeBatchIds(ids)
    setAnalyzeProgress({ total: ids.length, done: 0, remaining: ids.length, deleted: 0, pct: 0 })
    setMessage(null)
    try {
      const data = await saPost(
        "/leads",
        { action: "bulk_analyze", ids },
        { timeout: 180000 }
      )
      const queued = data.queued ?? ids.length
      const inline = data.ranInline ? ` · ${data.ranInline} ran immediately` : ""
      const deferred = data.deferredInline
        ? ` · ${data.deferredInline} need Redis worker (retry Analyze if stuck)`
        : ""
      setMessage({
        type: "success",
        text: `Analyzing ${ids.length} leads (${queued} queued${inline}${deferred}). Progress updates below — leads without email are removed.`,
      })
      setSelected([])
      // If everything ran inline already, poll once then finish
      if ((data.queued || 0) === 0 && (data.deferredInline || 0) === 0) {
        const status = await saPost("/leads", { action: "analyze_status", ids })
        setAnalyzeProgress({
          total: status.total,
          done: status.done,
          remaining: status.remaining,
          deleted: status.deleted || 0,
          pct: status.pct ?? 100,
        })
        if (status.remaining === 0) {
          await finishAnalyze(
            `Analyze done — ${status.done}/${status.total} processed${status.deleted ? ` · ${status.deleted} removed` : ""}.`
          )
        }
      }
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
      setAnalyzing(false)
      setAnalyzeBatchIds([])
      setAnalyzeProgress(null)
    }
  }

  const createEmptyGroup = async () => {
    const label = newGroupName.trim()
    if (!label) {
      setMessage({ type: "error", text: "Enter a group name" })
      return
    }
    try {
      const g = await saPost("/groups", { action: "create", label })
      setNewGroupName("")
      setMessage({ type: "success", text: `Group "${g.label}" created` })
      await loadGroups()
      setGroupFilter(String(g.id))
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    }
  }

  const assignSelected = async (opts?: { createNew?: boolean }) => {
    if (!selected.length) {
      setMessage({ type: "error", text: "Select leads first" })
      return
    }
    try {
      if (opts?.createNew) {
        const label = newGroupName.trim() || `Group ${new Date().toLocaleString()}`
        const data = await saPost("/groups", {
          action: "assign",
          newGroupLabel: label,
          leadIds: selected,
          move: true,
        })
        setMessage({
          type: "success",
          text: `Moved ${selected.length} lead(s) into new group (removed from previous groups)`,
        })
        setNewGroupName("")
        setSelected([])
        setShowAssignPanel(false)
        await loadGroups()
        if (data.group?.id) setGroupFilter(String(data.group.id))
        await loadLeads({ silent: true })
        return
      }
      if (!assignGroupId) {
        setMessage({ type: "error", text: "Pick a target group or create a new one" })
        return
      }
      await saPost("/groups", {
        action: "assign",
        groupId: Number(assignGroupId),
        leadIds: selected,
        move: true,
      })
      setMessage({
        type: "success",
        text: `Moved ${selected.length} lead(s) to the selected group (removed from previous groups)`,
      })
      setSelected([])
      setShowAssignPanel(false)
      await refreshAll()
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    }
  }

  const deleteGroup = async (g: any, e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    if (g.isPriority || g.method === "PRIORITY_REPLIES") {
      if (!window.confirm("Delete the High priority replies group? It will be recreated when someone replies again. Leads are kept.")) {
        return
      }
    } else if (!window.confirm(`Delete group "${g.label}"? Leads stay in the database.`)) {
      return
    }
    try {
      await saDelete("/groups", { id: g.id })
      setMessage({ type: "success", text: "Group deleted" })
      if (groupFilter === String(g.id)) setGroupFilter("")
      await refreshAll()
    } catch (err: any) {
      setMessage({ type: "error", text: err.message })
    }
  }

  const deleteLead = async (lead: any) => {
    if (!window.confirm(`Delete lead "${lead.name}"? This cannot be undone.`)) return
    try {
      await saDelete(`/leads/${lead.id}`)
      setMessage({ type: "success", text: "Lead deleted" })
      setSelected((prev) => prev.filter((id) => id !== lead.id))
      await loadLeads({ silent: true })
      await loadGroups()
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    }
  }

  const deleteSelectedLeads = async () => {
    if (!selected.length) return
    if (!window.confirm(`Delete ${selected.length} selected lead(s)? This cannot be undone.`)) return
    try {
      await saPost("/leads", { action: "bulk_delete", ids: selected })
      setMessage({ type: "success", text: `Deleted ${selected.length} leads` })
      setSelected([])
      await refreshAll()
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    }
  }

  const hasReplied = (l: any) =>
    l.status === "REPLIED" ||
    l.status === "CONVERTED" ||
    !!l.replyStatus ||
    (l._count?.replies || 0) > 0

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-6">
      <MessageBanner message={message} />

      {/* Info Banner Container */}
      <div className="rounded-xl border border-gray-200 bg-[#F8F9FC] p-5 flex gap-4 shadow-xs">
        <div className="p-2 rounded-lg bg-[#FEF3C7] text-[#D97706] h-fit">
          <Info className="w-4 h-4 shrink-0" />
        </div>
        <div className="text-xs text-[#0D1E36] space-y-1">
          <p className="font-bold uppercase tracking-wider text-[10px]">What does Analyze do?</p>
          <p className="text-slate-500 leading-relaxed font-medium text-xs">
            Analyze visits each company website, extracts contact emails/phones, and uses AI to score whether
            they need TidyFlow (ops software gaps). Use it before campaigns so you email leads that have a real
            address and a useful score — not required just to send if email is already known.
          </p>
        </div>
      </div>

      {/* Lead Discovery Engine */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
        <div className="pb-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#0D1E36]">Find cleaning companies</h2>
            <p className="text-xs text-gray-400 mt-1">
              Configure parameters to discover and organize company directories into leads groups
            </p>
          </div>
          
          {/* Segmented Controller Tab */}
          <div className="flex p-1 bg-[#EEF0F5] rounded-xl border border-gray-200 items-center h-[42px] shrink-0">
            <button
              type="button"
              onClick={() => setMethod("google_places")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all duration-150 h-full ${
                method === "google_places" 
                  ? "bg-white text-[#0D1E36] shadow-xs" 
                  : "text-slate-500 hover:text-[#0D1E36]"
              }`}
            >
              <MapPin className="w-3.5 h-3.5" /> Google Business
            </button>
            <button
              type="button"
              onClick={() => setMethod("search_engine")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all duration-150 h-full ${
                method === "search_engine" 
                  ? "bg-white text-[#0D1E36] shadow-xs" 
                  : "text-slate-500 hover:text-[#0D1E36]"
              }`}
            >
              <Globe className="w-3.5 h-3.5" /> Website search
            </button>
          </div>
        </div>

        {method === "google_places" ? (
          <p className="text-xs text-slate-500 -mt-2">
            Pulls Google Business / Maps listings (name, phone, address, website, reviews) — not website scraping.
          </p>
        ) : (
          <p className="text-xs text-slate-500 -mt-2">
            Finds company websites via search results, then you can analyze pages for contacts.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TagInput
            label="Target Countries"
            hint="Add multiple countries to look within"
            tags={countries}
            onChange={setCountries}
            placeholder="e.g. United Kingdom, UAE, Germany"
          />
          <TagInput
            label="Target Cities (Optional)"
            hint="Supports Google Business & website search"
            tags={cities}
            onChange={setCities}
            placeholder="e.g. London, Dubai, Berlin"
          />
        </div>

        <TagInput
          label="Niche Search Keywords"
          hint="Click AI Suggest Keywords to automatically build lists"
          tags={keywords}
          onChange={setKeywords}
          placeholder="e.g. Office Cleaning, Janitorial Services"
        />

        {method === "google_places" && (
          <div className="rounded-xl border border-gray-200 bg-[#F8F9FC] p-4 space-y-4">
            <div className="flex items-start gap-2">
              <Filter className="w-4 h-4 text-[#D97706] mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#0D1E36]">
                  Google Business filters
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Google does not expose company registration date. “New” / “Established” uses review volume as a proxy; “Opening soon” uses Maps future-opening listings.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#0D1E36] uppercase tracking-wider">
                  Business age
                </label>
                <select
                  className={`${inputCls} focus:border-[#D97706] text-sm h-[42px]`}
                  value={maturity}
                  onChange={(e) => setMaturity(e.target.value as BusinessMaturity)}
                >
                  <option value="any">Any</option>
                  <option value="likely_new">Likely new (≤15 reviews)</option>
                  <option value="established">Established (50+ reviews)</option>
                  <option value="opening_soon">Opening soon</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#0D1E36] uppercase tracking-wider">
                  Website on listing
                </label>
                <select
                  className={`${inputCls} focus:border-[#D97706] text-sm h-[42px]`}
                  value={websiteFilter}
                  onChange={(e) => setWebsiteFilter(e.target.value as WebsiteFilter)}
                >
                  <option value="any">Any</option>
                  <option value="with_website">Has website</option>
                  <option value="without_website">No website</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#0D1E36] uppercase tracking-wider">
                  Min rating
                </label>
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.5}
                  className={`${inputCls} focus:border-[#D97706] text-sm h-[42px]`}
                  value={minRating}
                  onChange={(e) => setMinRating(e.target.value)}
                  placeholder="e.g. 4"
                />
              </div>
              <div className="space-y-1.5 flex flex-col justify-end">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#0D1E36] cursor-pointer h-[42px]">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    checked={includeServiceArea}
                    onChange={(e) => setIncludeServiceArea(e.target.checked)}
                  />
                  Include service-area / mobile businesses
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="sm:col-span-3 space-y-2">
            <label className="block text-xs font-bold text-[#0D1E36] uppercase tracking-wider">AI Search Directives (Optional)</label>
            <input
              className={`${inputCls} focus:border-[#D97706] text-sm h-[42px]`}
              value={aiNote}
              onChange={(e) => setAiNote(e.target.value)}
              placeholder="e.g. Focus on commercial / multi-site operators..."
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-bold text-[#0D1E36] uppercase tracking-wider">Max Search Yield</label>
            <input className={`${inputCls} focus:border-[#D97706] text-sm h-[42px]`} value={maxResults} onChange={(e) => setMaxResults(e.target.value)} />
          </div>
        </div>

        {suggesting && (
          <ProgressBar label="AI suggesting keywords…" indeterminate tone="navy" />
        )}
        {discovering && (
          <ProgressBar
            label={
              activeGroupProgress
                ? `Finding leads — ${activeGroupProgress.completedChunks}/${activeGroupProgress.totalChunks} searches · ${activeGroupProgress.createdCount ?? 0} new (${activeGroupProgress.label})`
                : "Finding leads — starting searches…"
            }
            pct={
              activeGroupProgress?.totalChunks > 0
                ? Math.max(4, activeGroupProgress.progressPct || 0)
                : undefined
            }
            indeterminate={!activeGroupProgress || !(activeGroupProgress.totalChunks > 0)}
            tone="amber"
          />
        )}
        {analyzing && (
          <ProgressBar
            label={
              analyzeProgress
                ? `Analyzing leads — ${analyzeProgress.done}/${analyzeProgress.total} done${analyzeProgress.deleted ? ` · ${analyzeProgress.deleted} removed` : ""}${analyzeProgress.remaining ? ` · ${analyzeProgress.remaining} left` : ""}`
                : "Analyzing selected leads…"
            }
            pct={analyzeProgress ? Math.max(analyzeProgress.pct, analyzeProgress.done > 0 ? 4 : 0) : undefined}
            indeterminate={!analyzeProgress || analyzeProgress.pct < 1}
            tone="navy"
          />
        )}

        <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-gray-100">
          <button 
            type="button" 
            className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-[#0D1E36] border border-gray-200 px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold rounded-lg shadow-sm transition-all"
            disabled={suggesting || discovering} 
            onClick={askAI}
          >
            <Sparkles className="w-4.5 h-4.5 text-[#D97706]" />
            {suggesting ? "Analyzing Parameters..." : "AI Suggest Keywords"}
          </button>
          
          <button 
            type="button" 
            className="inline-flex items-center justify-center gap-2 bg-[#0D1E36] hover:bg-[#142944] text-white px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold rounded-lg shadow-sm transition-all"
            disabled={discovering} 
            onClick={() => discover(true)}
          >
            <Search className="w-4.5 h-4.5 text-[#D97706]" />
            {discovering ? "Processing Leads..." : "Find Leads"}
          </button>
          
          <button 
            type="button" 
            className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-[#0D1E36] border border-gray-200 px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold rounded-lg shadow-sm transition-all"
            disabled={discovering} 
            onClick={() => discover(false)}
          >
            {discovering ? "Processing..." : "Find Leads (Sync Wait)"}
          </button>
          
          <p className="w-full text-xs text-gray-400 leading-relaxed mt-1">
            Each query creates a Lead Group. The list refreshes live as searches finish — no manual refresh needed. Duplicates are skipped.
          </p>
        </div>
      </div>

      <QueuePanel
        onQueueBecameIdle={handleQueueIdle}
        onQueueUpdate={() => {
          loadGroups()
          if (discovering || analyzing) loadLeads({ silent: true })
        }}
      />

      {/* Leads Groups Directory */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#0D1E36]">Active Leads Directories</h3>
            <p className="text-xs text-gray-400 mt-1">
              Manage custom batches, priority reply categories, and discover groups
            </p>
          </div>
          <button 
            type="button" 
            className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-[#0D1E36] border border-gray-200 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-lg shadow-sm transition-all" 
            onClick={loadGroups}
          >
            <RefreshCw className="w-4 h-4 text-[#D97706]" /> Refresh Directories
          </button>
        </div>

        <div className="flex flex-wrap gap-3 items-end pt-1">
          <div className="flex-1 min-w-[220px] space-y-2">
            <label className="block text-xs font-bold text-[#0D1E36] uppercase tracking-wider">Create Empty Leads Group</label>
            <input
              className={`${inputCls} focus:border-[#D97706] text-sm h-[42px]`}
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="e.g. Q4 Outreach Segment"
            />
          </div>
          <button 
            type="button" 
            className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-[#0D1E36] border border-gray-200 px-5 py-2.5 text-xs sm:text-sm font-semibold rounded-lg shadow-sm transition-all h-[42px]" 
            onClick={createEmptyGroup}
          >
            <FolderPlus className="w-4.5 h-4.5 text-[#D97706]" /> Add Group
          </button>
        </div>

        {groups.length === 0 ? (
          <p className="text-xs text-gray-400 py-2">No directories compiled. Perform a lead lookup to initialize directories.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-56 overflow-y-auto pt-2">
            {groups.map((g) => {
              const isActive = groupFilter === String(g.id)
              return (
                <div
                  key={g.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setUngroupedOnly(false)
                    setGroupFilter(String(g.id))
                    setPage(1)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setUngroupedOnly(false)
                      setGroupFilter(String(g.id))
                      setPage(1)
                    }
                  }}
                  className={`text-left rounded-xl border p-4 transition-all duration-150 cursor-pointer flex flex-col justify-between border-l-4 ${
                    g.isPriority
                      ? isActive
                        ? "border-[#D97706] bg-[#FEF3C7]/40"
                        : "border-[#FEF3C7] bg-[#FEF3C7]/15 hover:border-[#D97706]"
                      : isActive
                        ? "border-[#0D1E36] bg-slate-50"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="text-sm font-bold text-[#0D1E36] truncate flex items-center gap-2 flex-wrap">
                        {g.label}
                        {g.isPriority && (
                          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#FEF3C7] text-[#B45309]">
                            Priority
                          </span>
                        )}
                        {(g.alreadySent || (g.emailedCount || 0) > 0) && (
                          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#E1F5E9] text-[#166534]">
                            Already sent
                            {g.emailedCount != null && g.memberCount
                              ? ` (${g.emailedCount}/${g.memberCount})`
                              : ""}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 font-medium flex flex-wrap gap-x-2">
                        <span>{g.memberCount ?? 0} direct leads</span>
                        <span>· Status: {g.status}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-[#9A2A1E] hover:bg-rose-50/50 transition-colors"
                      title="Delete group"
                      onClick={(e) => deleteGroup(g, e)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {(g.status === "RUNNING" || g.status === "QUEUED") && (
                    <div className="mt-3">
                      <ProgressBar pct={g.progressPct || 0} tone="amber" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Lead Discovery Results Grid */}
      <div className="bg-white rounded-xl border border-[#E3E7F0] shadow-[0_1px_2px_rgba(11,27,59,0.04)] overflow-hidden">
        {/* Filter toolbar */}
        <div className="border-b border-[#EEF0F5] bg-[#F8F9FC] px-4 py-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[#0D1E36]">
              <Filter className="w-4 h-4 text-[#D97706]" />
              <span className="text-xs font-bold uppercase tracking-wider">Lead filters</span>
              {activeFilterCount > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#0D1E36] text-white">
                  {activeFilterCount} active
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  className="text-[11px] font-semibold text-[#5B6478] hover:text-[#0D1E36] inline-flex items-center gap-1"
                  onClick={clearFilters}
                >
                  <X className="w-3.5 h-3.5" /> Clear filters
                </button>
              )}
              <select
                className="h-8 rounded-lg border border-[#D8DCE6] bg-white px-2 text-[11px] font-medium text-[#0D1E36]"
                value={pageSize}
                onChange={(e) => {
                  setPage(1)
                  setPageSize(Number(e.target.value))
                }}
                aria-label="Rows per page"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A6ADBD]" />
            <input
              className="w-full h-9 rounded-lg border border-[#D8DCE6] bg-white pl-9 pr-3 text-xs text-[#0D1E36] placeholder:text-[#A6ADBD] focus:outline-none focus:ring-2 focus:ring-[#D98E04]/30 focus:border-[#D98E04]"
              value={search}
              onChange={(e) => {
                setPage(1)
                setSearch(e.target.value)
              }}
              placeholder="Search name, email, phone, city, website…"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <label className="space-y-1">
              <span className="block text-[10px] font-semibold text-[#8890A0] uppercase tracking-wide">Group</span>
              <select
                className="w-full h-9 rounded-lg border border-[#D8DCE6] bg-white px-2 text-xs text-[#0D1E36]"
                value={ungroupedOnly ? "ungrouped" : groupFilter}
                onChange={(e) => {
                  setPage(1)
                  if (e.target.value === "ungrouped") {
                    setUngroupedOnly(true)
                    setGroupFilter("")
                  } else {
                    setUngroupedOnly(false)
                    setGroupFilter(e.target.value)
                  }
                }}
              >
                <option value="">All groups</option>
                <option value="ungrouped">Ungrouped</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.isPriority ? "★ " : ""}
                    {g.alreadySent || (g.emailedCount || 0) > 0 ? "✓ " : ""}
                    {g.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="block text-[10px] font-semibold text-[#8890A0] uppercase tracking-wide">Has email</span>
              <select
                className="w-full h-9 rounded-lg border border-[#D8DCE6] bg-white px-2 text-xs text-[#0D1E36]"
                value={emailFoundFilter}
                onChange={(e) => {
                  setPage(1)
                  setEmailFoundFilter(e.target.value as "" | "true" | "false")
                }}
              >
                <option value="">Any</option>
                <option value="true">With email</option>
                <option value="false">No email</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="block text-[10px] font-semibold text-[#8890A0] uppercase tracking-wide">Has phone</span>
              <select
                className="w-full h-9 rounded-lg border border-[#D8DCE6] bg-white px-2 text-xs text-[#0D1E36]"
                value={phoneFoundFilter}
                onChange={(e) => {
                  setPage(1)
                  setPhoneFoundFilter(e.target.value as "" | "true" | "false")
                }}
              >
                <option value="">Any</option>
                <option value="true">With phone</option>
                <option value="false">No phone</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="block text-[10px] font-semibold text-[#8890A0] uppercase tracking-wide">Score</span>
              <select
                className="w-full h-9 rounded-lg border border-[#D8DCE6] bg-white px-2 text-xs text-[#0D1E36]"
                value={minScoreFilter}
                onChange={(e) => {
                  setPage(1)
                  setMinScoreFilter(e.target.value as "" | "30" | "50" | "60" | "80")
                }}
              >
                <option value="">Any score</option>
                <option value="30">30+</option>
                <option value="50">50+</option>
                <option value="60">60+</option>
                <option value="80">80+</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="block text-[10px] font-semibold text-[#8890A0] uppercase tracking-wide">Analyzed</span>
              <select
                className="w-full h-9 rounded-lg border border-[#D8DCE6] bg-white px-2 text-xs text-[#0D1E36]"
                value={analyzedFilter}
                onChange={(e) => {
                  setPage(1)
                  setAnalyzedFilter(e.target.value as "" | "true" | "false")
                }}
              >
                <option value="">Any</option>
                <option value="true">Analyzed</option>
                <option value="false">Not analyzed</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="block text-[10px] font-semibold text-[#8890A0] uppercase tracking-wide">Outreach</span>
              <select
                className="w-full h-9 rounded-lg border border-[#D8DCE6] bg-white px-2 text-xs text-[#0D1E36]"
                value={emailSentFilter}
                onChange={(e) => {
                  setPage(1)
                  setEmailSentFilter(e.target.value as "" | "true" | "false")
                }}
              >
                <option value="">All</option>
                <option value="false">Not emailed</option>
                <option value="true">Emailed</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPage(1)
                setRepliedOnly(!repliedOnly)
              }}
              className={`h-8 px-3 rounded-full text-[11px] font-semibold border transition-colors ${
                repliedOnly
                  ? "bg-[#FEF3C7] border-[#F3D89B] text-[#8A5A00]"
                  : "bg-white border-[#D8DCE6] text-[#5B6478] hover:border-[#A6ADBD]"
              }`}
            >
              Replied only
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Selection action bar */}
          {selected.length > 0 && (
            <div className="sticky top-0 z-20 rounded-xl border border-[#0D1E36]/10 bg-[#0D1E36] text-white shadow-lg px-4 py-3">
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-[#D97706] px-2 text-xs font-bold tabular-nums">
                    {selected.length}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">Selected on this page</p>
                    <p className="text-[11px] text-white/60 truncate">Analyze, move to a group, or delete</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#D97706] hover:bg-[#C26405] text-xs font-semibold transition-colors disabled:opacity-50"
                    disabled={analyzing}
                    onClick={runBulkAnalyze}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {analyzing ? "Analyzing…" : "Analyze"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold transition-colors"
                    onClick={() => setShowAssignPanel((v) => !v)}
                  >
                    <FolderInput className="w-3.5 h-3.5" />
                    Move
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-rose-500/90 hover:bg-rose-500 text-xs font-semibold transition-colors"
                    onClick={deleteSelectedLeads}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-white/70 hover:text-white text-xs font-medium"
                    onClick={() => {
                      setSelected([])
                      setShowAssignPanel(false)
                    }}
                    title="Clear selection"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {showAssignPanel && (
                <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-white/50 uppercase mb-1">Existing group</label>
                    <select
                      className="w-full h-9 rounded-lg border-0 bg-white text-[#0D1E36] px-2 text-xs"
                      value={assignGroupId}
                      onChange={(e) => setAssignGroupId(e.target.value)}
                    >
                      <option value="">Select group…</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-white/50 uppercase mb-1">Or new group name</label>
                    <input
                      className="w-full h-9 rounded-lg border-0 bg-white text-[#0D1E36] px-2 text-xs"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="e.g. High score UAE"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      className="h-9 px-3 rounded-lg bg-white text-[#0D1E36] text-xs font-semibold"
                      onClick={() => assignSelected()}
                    >
                      Move to group
                    </button>
                    <button
                      type="button"
                      className="h-9 px-3 rounded-lg bg-white/10 border border-white/20 text-xs font-semibold inline-flex items-center gap-1"
                      onClick={() => assignSelected({ createNew: true })}
                    >
                      <FolderPlus className="w-3.5 h-3.5" /> New & move
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {loading ? (
            <LoadingBlock />
          ) : leads.length === 0 ? (
            <EmptyState title="No leads match these filters" description="Try clearing filters or run Find Leads to discover more companies." />
          ) : (
            <>
              <div className="border border-[#E3E7F0] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="text-[#8890A0] text-[10px] font-bold uppercase tracking-wider bg-[#F8F9FC] border-b border-[#EEF0F5]">
                        <th className="p-2.5 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={toggleSelectAll}
                            className="accent-[#0D1E36] rounded w-3.5 h-3.5 cursor-pointer"
                            title="Select all on page"
                            aria-label="Select all on page"
                          />
                        </th>
                        <th className="p-2.5">Company</th>
                        <th className="p-2.5">Location</th>
                        <th className="p-2.5">Email</th>
                        <th className="p-2.5">Phone</th>
                        <th className="p-2.5 text-center">Score</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5 text-right pr-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF0F5]">
                      {leads.map((l) => {
                        const replied = hasReplied(l)
                        return (
                          <tr
                            key={l.id}
                            className={`hover:bg-[#F8F9FC] transition-colors ${
                              replied ? "bg-[#FEF3C7]/20" : ""
                            } ${selected.includes(l.id) ? "bg-[#E9ECF3]/80" : ""}`}
                          >
                            <td className="p-2.5 text-center">
                              <input
                                type="checkbox"
                                className="accent-[#0D1E36] rounded w-3.5 h-3.5 cursor-pointer"
                                checked={selected.includes(l.id)}
                                onChange={() =>
                                  setSelected((prev) =>
                                    prev.includes(l.id) ? prev.filter((x) => x !== l.id) : [...prev, l.id]
                                  )
                                }
                              />
                            </td>
                            <td className="p-2.5">
                              <button
                                type="button"
                                className="text-left group"
                                onClick={() => openLeadDetail(l)}
                              >
                                <div className="font-semibold text-[#0D1E36] group-hover:text-[#D97706] flex flex-wrap items-center gap-1.5">
                                  {l.name}
                                  {replied && (
                                    <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#B45309]">
                                      Replied
                                    </span>
                                  )}
                                  {(l.emailSentCount || 0) > 0 && !replied && (
                                    <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-50 text-green-700">
                                      Sent
                                    </span>
                                  )}
                                </div>
                                {l.website && (
                                  <div className="text-[10px] text-[#A6ADBD] mt-0.5 truncate max-w-[220px]">{l.website}</div>
                                )}
                              </button>
                            </td>
                            <td className="p-2.5 text-[#5B6478]">
                              {[l.city, l.country].filter(Boolean).join(", ") || "—"}
                            </td>
                            <td className="p-2.5 text-[#5B6478] max-w-[160px] truncate" title={l.email || ""}>
                              {l.email || "—"}
                            </td>
                            <td className="p-2.5 text-[#5B6478] whitespace-nowrap">
                              {l.phone || "—"}
                            </td>
                            <td className="p-2.5 text-center font-semibold tabular-nums text-[#0D1E36]">
                              {l.leadScore ?? "—"}
                            </td>
                            <td className="p-2.5">
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#EEF0F5] text-[#0D1E36]">
                                {l.status}
                              </span>
                            </td>
                            <td className="p-2.5 text-right pr-4 whitespace-nowrap">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  className="text-[#0D1E36] hover:text-[#D97706] p-1.5 rounded-md hover:bg-[#F6F7FB]"
                                  title="View details"
                                  onClick={() => openLeadDetail(l)}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  className="text-[#0D1E36] hover:text-[#D97706] text-[11px] font-semibold px-2 py-1 rounded-md hover:bg-[#F6F7FB] disabled:opacity-50"
                                  disabled={analyzing}
                                  onClick={async () => {
                                    setAnalyzing(true)
                                    try {
                                      await saPost(`/leads/${l.id}`, {})
                                      setMessage({ type: "success", text: `Analysis started for ${l.name}` })
                                    } catch (e: any) {
                                      setMessage({ type: "error", text: e.message })
                                      setAnalyzing(false)
                                    }
                                  }}
                                >
                                  Analyze
                                </button>
                                <button
                                  type="button"
                                  className="text-rose-600 hover:text-rose-800 text-[11px] font-semibold px-2 py-1 rounded-md hover:bg-rose-50"
                                  onClick={() => deleteLead(l)}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#5B6478]">
                <span>
                  <strong className="text-[#0D1E36]">{total}</strong> leads · page{" "}
                  <strong className="text-[#0D1E36]">{page}</strong> of {totalPages}
                  {selected.length > 0 ? ` · ${selected.length} selected` : ""}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={btnSecondary}
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className={btnSecondary}
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Lead detail modal */}
      {detailLead && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setDetailLead(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Lead details"
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-xl border border-[#E3E7F0]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-start justify-between gap-3 px-5 py-4 border-b border-[#EEF0F5] bg-white">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#D97706]">Lead details</p>
                <h3 className="text-base font-semibold text-[#0D1E36] truncate">{detailLead.name}</h3>
              </div>
              <button
                type="button"
                className="p-1.5 rounded-lg text-[#8890A0] hover:bg-[#F6F7FB] hover:text-[#0D1E36]"
                onClick={() => setDetailLead(null)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {detailLoading ? (
              <div className="p-8"><LoadingBlock /></div>
            ) : (
              <div className="p-5 space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-[#F8F9FC] border border-[#EEF0F5] p-3">
                    <p className="text-[10px] font-semibold text-[#8890A0] uppercase mb-1">Status</p>
                    <p className="font-semibold text-[#0D1E36]">{detailLead.status || "—"}</p>
                  </div>
                  <div className="rounded-lg bg-[#F8F9FC] border border-[#EEF0F5] p-3">
                    <p className="text-[10px] font-semibold text-[#8890A0] uppercase mb-1">Score</p>
                    <p className="font-semibold text-[#0D1E36] tabular-nums">{detailLead.leadScore ?? "—"}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Mail className="w-3.5 h-3.5 text-[#D97706] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-[#8890A0] uppercase">Email</p>
                      <p className="font-medium text-[#0D1E36] break-all">{detailLead.email || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Phone className="w-3.5 h-3.5 text-[#D97706] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-[#8890A0] uppercase">Phone</p>
                      <p className="font-medium text-[#0D1E36]">{detailLead.phone || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-[#D97706] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-[#8890A0] uppercase">Location</p>
                      <p className="font-medium text-[#0D1E36]">
                        {[detailLead.address, detailLead.city, detailLead.state, detailLead.country]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Globe className="w-3.5 h-3.5 text-[#D97706] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-[#8890A0] uppercase">Website</p>
                      {detailLead.website ? (
                        <a
                          href={detailLead.website.startsWith("http") ? detailLead.website : `https://${detailLead.website}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-[#0D1E36] hover:text-[#D97706] break-all underline-offset-2 hover:underline"
                        >
                          {detailLead.website}
                        </a>
                      ) : (
                        <p className="font-medium text-[#0D1E36]">—</p>
                      )}
                    </div>
                  </div>
                </div>

                {detailLead.aboutSnippet && (
                  <div>
                    <p className="text-[10px] font-semibold text-[#8890A0] uppercase mb-1">About</p>
                    <p className="text-[#5B6478] leading-relaxed line-clamp-6">{detailLead.aboutSnippet}</p>
                  </div>
                )}

                {detailLead.analyses?.[0] && (
                  <div className="rounded-lg border border-[#EEF0F5] p-3 space-y-1.5">
                    <p className="text-[10px] font-semibold text-[#8890A0] uppercase">Latest analysis</p>
                    <p className="text-[#5B6478] leading-relaxed">
                      {detailLead.analyses[0].scoreReason || detailLead.analyses[0].personalizedIntro || "—"}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={analyzing}
                    onClick={async () => {
                      setAnalyzing(true)
                      try {
                        await saPost(`/leads/${detailLead.id}`, {})
                        setMessage({ type: "success", text: `Analysis started for ${detailLead.name}` })
                      } catch (e: any) {
                        setMessage({ type: "error", text: e.message })
                        setAnalyzing(false)
                      }
                    }}
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Analyze
                  </button>
                  <button type="button" className={btnSecondary} onClick={() => setDetailLead(null)}>
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
