
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
import { Search, Sparkles, RefreshCw, X, Plus, Info, Trash2, FolderPlus, FolderInput, MapPin, Globe } from "lucide-react"
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

export default function LeadDiscoveryTab() {
  const [method, setMethod] = useState<"google_places" | "search_engine">("google_places")
  const [countries, setCountries] = useState<string[]>([])
  const [cities, setCities] = useState<string[]>([])
  const [keywords, setKeywords] = useState<string[]>(["Cleaning Company", "Commercial Cleaning"])
  const [maxResults, setMaxResults] = useState("15")
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
  const [groups, setGroups] = useState<any[]>([])
  const [groupFilter, setGroupFilter] = useState<string>("")
  const [ungroupedOnly, setUngroupedOnly] = useState(false)
  const [repliedOnly, setRepliedOnly] = useState(false)
  const [activeGroupProgress, setActiveGroupProgress] = useState<any | null>(null)
  const [newGroupName, setNewGroupName] = useState("")
  const [assignGroupId, setAssignGroupId] = useState("")
  const [showAssignPanel, setShowAssignPanel] = useState(false)

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
  }, [page, pageSize, search, emailSentFilter, groupFilter, ungroupedOnly, repliedOnly])

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

  const handleQueueIdle = useCallback(() => {
    setMessage({ type: "success", text: "Finished — leads and groups updated." })
    setDiscovering(false)
    setAnalyzing(false)
    refreshAll()
  }, [refreshAll])

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
      const data = await saPost(
        "/leads/discover",
        {
          method,
          async: useQueue,
          keywords,
          countries,
          cities,
          maxResults: Number(maxResults) || 15,
        },
        { timeout: useQueue ? 60000 : 300000 }
      )

      if (data.discoveryGroupId) {
        setGroupFilter(String(data.discoveryGroupId))
        setPage(1)
      }

      if (useQueue) {
        setMessage({
          type: "success",
          text:
            data.note ||
            `Started ${data.enqueued ?? data.chunks ?? 0} search(es). Results will appear here when ready.`,
        })
        await loadGroups()
        if (!(data.enqueued > 0)) {
          setDiscovering(false)
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
    setAnalyzing(true)
    setMessage(null)
    try {
      await saPost("/leads", { action: "bulk_analyze", ids: selected })
      setMessage({
        type: "success",
        text: `Analyzing ${selected.length} leads… results update when each finishes.`,
      })
      setSelected([])
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
      setAnalyzing(false)
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

  const assignSelected = async (opts?: { createNew?: boolean; move?: boolean }) => {
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
          move: !!opts.move,
        })
        setMessage({ type: "success", text: `Created group and assigned ${selected.length} leads` })
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
        move: !!opts?.move,
      })
      setMessage({
        type: "success",
        text: opts?.move
          ? `Moved ${selected.length} leads to group`
          : `Added ${selected.length} leads to group`,
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
              <MapPin className="w-3.5 h-3.5" /> Google Places
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
              <Globe className="w-3.5 h-3.5" /> Search Engine
            </button>
          </div>
        </div>

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
            hint="Supports Places & Search Engine contexts"
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
                ? `Finding leads — ${activeGroupProgress.completedChunks}/${activeGroupProgress.totalChunks} chunks (${activeGroupProgress.label})`
                : "Finding leads…"
            }
            pct={activeGroupProgress?.progressPct}
            indeterminate={!activeGroupProgress || activeGroupProgress.progressPct < 1}
            tone="amber"
          />
        )}
        {analyzing && <ProgressBar label="Analyzing selected leads…" indeterminate tone="navy" />}

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
            Each query initializes a fresh Lead Group. Duplicates are bypassed dynamically. Output tables refresh on runtime completion.
          </p>
        </div>
      </div>

      <QueuePanel onQueueBecameIdle={handleQueueIdle} onQueueUpdate={() => loadGroups()} />

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
                      <div className="text-sm font-bold text-[#0D1E36] truncate flex items-center gap-2">
                        {g.label}
                        {g.isPriority && (
                          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#FEF3C7] text-[#B45309]">
                            Priority
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
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
          <div className="space-y-1.5 md:col-span-1">
            <label className="block text-xs font-bold text-[#0D1E36] uppercase tracking-wider">Search Leads</label>
            <input
              className={`${inputCls} focus:border-[#D97706] text-sm h-[40px]`}
              value={search}
              onChange={(e) => {
                setPage(1)
                setSearch(e.target.value)
              }}
              placeholder="Search by name, city..."
            />
          </div>
          
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#0D1E36] uppercase tracking-wider">Leads Directory</label>
            <select
              className={`${inputCls} focus:border-[#D97706] text-sm h-[40px]`}
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
              <option value="ungrouped">Ungrouped leads</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.isPriority ? "⭐ " : ""}
                  {g.label} ({g.memberCount ?? 0})
                </option>
              ))}
            </select>
          </div>
          
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#0D1E36] uppercase tracking-wider">Email status</label>
            <select
              className={`${inputCls} focus:border-[#D97706] text-sm h-[40px]`}
              value={emailSentFilter}
              onChange={(e) => {
                setPage(1)
                setEmailSentFilter(e.target.value as "" | "true" | "false")
              }}
            >
              <option value="false">Not emailed yet</option>
              <option value="true">Email sent</option>
              <option value="">All</option>
            </select>
          </div>
          
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#0D1E36] uppercase tracking-wider">Responses</label>
            <select
              className={`${inputCls} focus:border-[#D97706] text-sm h-[40px]`}
              value={repliedOnly ? "true" : ""}
              onChange={(e) => {
                setPage(1)
                setRepliedOnly(e.target.value === "true")
              }}
            >
              <option value="">All leads</option>
              <option value="true">Replied only</option>
            </select>
          </div>
          
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#0D1E36] uppercase tracking-wider">Rows Display</label>
            <select
              className={`${inputCls} focus:border-[#D97706] text-sm h-[40px]`}
              value={pageSize}
              onChange={(e) => {
                setPage(1)
                setPageSize(Number(e.target.value))
              }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} per page
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Floating Bulk Actions Panel */}
        {selected.length > 0 && (
          <div className="rounded-xl border border-l-4 border-l-[#D97706] border-gray-200 bg-[#F8F9FC] p-4.5 space-y-4 transition-all">
            <div className="flex flex-wrap gap-3 items-center">
              <span className="text-sm font-bold text-[#0D1E36]">{selected.length} record(s) selected</span>
              
              <button 
                type="button" 
                className="inline-flex items-center justify-center gap-1.5 bg-[#0D1E36] hover:bg-[#142944] text-white px-5 py-2.5 text-xs sm:text-sm font-semibold rounded-lg shadow-sm transition-all"
                disabled={analyzing} 
                onClick={runBulkAnalyze}
              >
                <Sparkles className="w-4 h-4 text-[#D97706]" /> Bulk Analyze
              </button>
              
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 text-[#0D1E36] border border-gray-200 px-5 py-2.5 text-xs sm:text-sm font-semibold rounded-lg shadow-sm transition-all"
                onClick={() => setShowAssignPanel((v) => !v)}
              >
                <FolderInput className="w-4 h-4 text-[#0D1E36]" /> Assign to directory
              </button>
              
              <button 
                type="button" 
                className="inline-flex items-center justify-center gap-1.5 bg-white hover:bg-rose-50/50 text-rose-700 hover:text-rose-800 border border-rose-100 px-5 py-2.5 text-xs sm:text-sm font-semibold rounded-lg shadow-sm transition-all"
                onClick={deleteSelectedLeads}
              >
                <Trash2 className="w-4 h-4" /> Bulk Delete
              </button>
            </div>
            
            {showAssignPanel && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white rounded-xl border border-gray-100 p-5 shadow-inner">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Target Existing Group</label>
                  <select
                    className={`${inputCls} focus:border-[#D97706] text-sm h-[40px] bg-slate-50`}
                    value={assignGroupId}
                    onChange={(e) => setAssignGroupId(e.target.value)}
                  >
                    <option value="">Select target...</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Or Set New Directory Title</label>
                  <input
                    className={`${inputCls} focus:border-[#D97706] text-sm h-[40px] bg-slate-50`}
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Create segment..."
                  />
                </div>
                
                <div className="flex flex-wrap items-end gap-2 justify-end">
                  <button type="button" className="inline-flex items-center justify-center bg-[#0D1E36] hover:bg-[#142944] text-white px-5 py-2.5 text-xs font-semibold rounded-lg shadow-sm transition-all h-[40px]" onClick={() => assignSelected()}>
                    Add to group
                  </button>
                  <button type="button" className="inline-flex items-center justify-center bg-white hover:bg-slate-50 text-[#0D1E36] border border-gray-200 px-5 py-2.5 text-xs font-semibold rounded-lg shadow-sm transition-all h-[40px]" onClick={() => assignSelected({ move: true })}>
                    Move to group
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 text-[#0D1E36] border border-gray-200 px-5 py-2.5 text-xs font-semibold rounded-lg shadow-sm transition-all h-[40px]"
                    onClick={() => assignSelected({ createNew: true })}
                  >
                    <FolderPlus className="w-4 h-4 text-[#D97706]" /> New & Assign
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <LoadingBlock />
        ) : leads.length === 0 ? (
          <EmptyState title="Directories empty" description="Target target zones and query keywords to find potential leads." />
        ) : (
          <>
            <div className="border border-gray-200 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="text-gray-500 text-[10px] font-bold uppercase tracking-wider bg-slate-50 border-b border-gray-200">
                      <th className="p-3 w-12 text-center">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleSelectAll}
                          className="accent-[#0D1E36] rounded border-gray-300 w-4 h-4 cursor-pointer"
                          title="Select all on page"
                          aria-label="Select all on page"
                        />
                      </th>
                      <th className="p-3.5 pl-4">Company Entity</th>
                      <th className="p-3.5">Geographic Location</th>
                      <th className="p-3.5">Primary Email Address</th>
                      <th className="p-3.5 text-center">Lead Score</th>
                      <th className="p-3.5">Ingest Status</th>
                      <th className="p-3.5 text-right pr-6">Inline Controls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {leads.map((l) => {
                      const replied = hasReplied(l)
                      return (
                        <tr
                          key={l.id}
                          className={`hover:bg-[#F8F9FC] transition-colors duration-100 ${
                            replied ? "bg-[#FEF3C7]/15 hover:bg-[#FEF3C7]/25" : ""
                          }`}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              className="accent-[#0D1E36] rounded border-gray-300 w-4 h-4 cursor-pointer"
                              checked={selected.includes(l.id)}
                              onChange={() =>
                                setSelected((prev) =>
                                  prev.includes(l.id) ? prev.filter((x) => x !== l.id) : [...prev, l.id]
                                )
                              }
                            />
                          </td>
                          <td className="p-3 pl-4">
                            <div className="font-bold text-[#0D1E36] flex flex-wrap items-center gap-1.5 text-xs">
                              {l.name}
                              {replied && (
                                <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#FEF3C7] text-[#B45309] border border-[#FEF3C7]">
                                  Replied {l.replyStatus ? `· ${l.replyStatus}` : ""}
                                </span>
                              )}
                              {(l.emailSentCount || 0) > 0 && !replied && (
                                <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-100">
                                  Outbound sent
                                </span>
                              )}
                            </div>
                            {l.website && (
                              <div className="text-[10px] text-gray-400 mt-1 truncate max-w-[200px]">{l.website}</div>
                            )}
                            {l.groupMembers?.length > 0 && (
                              <div className="text-[9px] font-mono text-gray-400 mt-1 truncate max-w-[240px]">
                                {l.groupMembers.map((m: any) => m.group?.label).filter(Boolean).join(" · ")}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-slate-500 font-semibold text-xs">
                            {[l.city, l.country].filter(Boolean).join(", ") || "—"}
                          </td>
                          <td className="p-3 text-slate-600 font-semibold text-xs">{l.email || "—"}</td>
                          <td className="p-3 text-center font-mono font-bold text-[#0D1E36] text-xs">{l.leadScore ?? "—"}</td>
                          <td className="p-3">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-gray-100">
                              {l.status}
                            </span>
                          </td>
                          <td className="p-3 text-right pr-6 whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                className="text-[#0D1E36] hover:text-[#D97706] hover:bg-slate-50 border border-transparent hover:border-gray-100 font-semibold text-xs px-3 py-1.5 rounded-md transition-all disabled:opacity-50"
                                disabled={analyzing}
                                onClick={async () => {
                                  setAnalyzing(true)
                                  try {
                                    await saPost(`/leads/${l.id}`, {})
                                    setMessage({ type: "success", text: `AI analysis dispatched for ${l.name}.` })
                                  } catch (e: any) {
                                    setMessage({ type: "error", text: e.message })
                                    setAnalyzing(false)
                                  }
                                }}
                              >
                                {analyzing ? "..." : "Analyze"}
                              </button>
                              <button
                                type="button"
                                className="text-[#9A2A1E] hover:text-[#7A1F16] hover:bg-rose-50 border border-transparent hover:border-rose-100 font-semibold text-xs px-3 py-1.5 rounded-md transition-all"
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
            
            {/* Grid Pagination Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 pt-2">
              <span className="text-xs">
                Total records: <strong className="text-[#0D1E36]">{total}</strong> leads · Page <strong className="text-[#0D1E36]">{page}</strong> of {totalPages}
                {selected.length > 0 ? ` · ${selected.length} selected` : ""}
              </span>
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center justify-center bg-white hover:bg-slate-50 text-[#0D1E36] border border-gray-200 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-lg shadow-sm transition-all"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center bg-white hover:bg-slate-50 text-[#0D1E36] border border-gray-200 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-lg shadow-sm transition-all"
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
  )
}
