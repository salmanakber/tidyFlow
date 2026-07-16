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
import { Search, Sparkles, RefreshCw, X, Plus, Info, Trash2, FolderPlus, FolderInput } from "lucide-react"
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
    <div>
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {hint && <p className="text-xs text-gray-400 mb-1">{hint}</p>}
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-800 text-xs px-2.5 py-1"
          >
            {t}
            <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className={inputCls}
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
        <button type="button" className={btnSecondary} onClick={add}>
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250] as const

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
    setMessage({ type: "success", text: "Queue finished — leads & groups updated automatically." })
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
            `Queued ${data.enqueued ?? data.chunks ?? 0} search chunk(s) as a lead group. UI will refresh when Redis finishes.`,
        })
        await loadGroups()
        // Keep discovering=true while queue works; cleared on idle
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
        text: `Analyzing ${selected.length} leads in the queue (crawl website → find email → score). UI updates when done.`,
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
      setMessage({ type: "success", text: `Group “${g.label}” created` })
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
    } else if (!window.confirm(`Delete group “${g.label}”? Leads stay in the database.`)) {
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
    if (!window.confirm(`Delete lead “${lead.name}”? This cannot be undone.`)) return
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

      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 flex gap-3">
        <Info className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" />
        <div className="text-sm text-sky-900 space-y-1">
          <p className="font-semibold">What does Analyze do?</p>
          <p>
            Analyze visits each company website, extracts contact emails/phones, and uses AI to score whether
            they need TidyFlow (ops software gaps). Use it before campaigns so you email leads that have a real
            address and a useful score — not required just to send if email is already known.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Find cleaning companies</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Each search creates a <strong>lead group</strong> (e.g. United States batch) so you can pick the
            whole set when sending a campaign.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMethod("google_places")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              method === "google_places" ? "bg-slate-900 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            Google Places
          </button>
          <button
            type="button"
            onClick={() => setMethod("search_engine")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              method === "search_engine" ? "bg-slate-900 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            Search Engine
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TagInput
            label="Countries"
            hint="Search many countries at once"
            tags={countries}
            onChange={setCountries}
            placeholder="e.g. United Kingdom, UAE, Germany"
          />
          <TagInput
            label="Cities (optional)"
            hint="Same filter for Places and Search Engine"
            tags={cities}
            onChange={setCities}
            placeholder="e.g. London, Dubai, Berlin"
          />
        </div>

        <TagInput
          label="Keywords"
          hint="Or click AI Suggest after adding countries"
          tags={keywords}
          onChange={setKeywords}
          placeholder="e.g. Office Cleaning, Janitorial Services"
        />

        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-600">Notes for AI (optional)</label>
            <input
              className={inputCls}
              value={aiNote}
              onChange={(e) => setAiNote(e.target.value)}
              placeholder="Focus on commercial / multi-site operators…"
            />
          </div>
          <div className="w-28">
            <label className="text-xs font-medium text-gray-600">Max / search</label>
            <input className={inputCls} value={maxResults} onChange={(e) => setMaxResults(e.target.value)} />
          </div>
        </div>

        {suggesting && (
          <ProgressBar label="AI suggesting keywords…" indeterminate tone="indigo" />
        )}
        {discovering && (
          <ProgressBar
            label={
              activeGroupProgress
                ? `Finding leads — ${activeGroupProgress.completedChunks}/${activeGroupProgress.totalChunks} chunks (${activeGroupProgress.label})`
                : "Finding leads — waiting on Redis queue…"
            }
            pct={activeGroupProgress?.progressPct}
            indeterminate={!activeGroupProgress || activeGroupProgress.progressPct < 1}
            tone="amber"
          />
        )}
        {analyzing && <ProgressBar label="Analyzing selected leads…" indeterminate tone="indigo" />}

        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnSecondary} disabled={suggesting || discovering} onClick={askAI}>
            <Sparkles className="w-4 h-4" />
            {suggesting ? "Asking AI…" : "AI Suggest Keywords"}
          </button>
          <button type="button" className={btnPrimary} disabled={discovering} onClick={() => discover(true)}>
            <Search className="w-4 h-4" />
            {discovering ? "Searching…" : "Find Leads (queue)"}
          </button>
          <button type="button" className={btnSecondary} disabled={discovering} onClick={() => discover(false)}>
            {discovering ? "Searching…" : "Run now (wait)"}
          </button>
          <p className="w-full text-xs text-gray-500">
            Live: use queue — results land in a named group. When Redis finishes, this page refreshes automatically.
          </p>
        </div>
      </div>

      <QueuePanel onQueueBecameIdle={handleQueueIdle} onQueueUpdate={() => loadGroups()} />

      {/* Lead groups */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Lead groups</h3>
            <p className="text-xs text-gray-500">
              Organize searches, move ungrouped leads, and use the high-priority replies group for follow-up.
            </p>
          </div>
          <button type="button" className={btnSecondary} onClick={loadGroups}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs font-medium text-gray-600">New group name</label>
            <input
              className={inputCls}
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="e.g. US batch 2 — follow up"
            />
          </div>
          <button type="button" className={btnSecondary} onClick={createEmptyGroup}>
            <FolderPlus className="w-4 h-4" /> Create group
          </button>
        </div>

        {groups.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">No groups yet — run Find Leads or create one above.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-56 overflow-y-auto">
            {groups.map((g) => (
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
                className={`text-left rounded-lg border p-3 transition cursor-pointer ${
                  g.isPriority
                    ? groupFilter === String(g.id)
                      ? "border-amber-500 bg-amber-50"
                      : "border-amber-300 bg-amber-50/60 hover:border-amber-400"
                    : groupFilter === String(g.id)
                      ? "border-indigo-400 bg-indigo-50"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
                      {g.label}
                      {g.isPriority && (
                        <span className="shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">
                          Priority
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-2">
                      <span>{g.memberCount ?? 0} leads</span>
                      <span>· {g.status}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                    title="Delete group"
                    onClick={(e) => deleteGroup(g, e)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {(g.status === "RUNNING" || g.status === "QUEUED") && (
                  <div className="mt-2">
                    <ProgressBar pct={g.progressPct || 0} tone="amber" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex flex-wrap gap-2 items-end mb-4">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs font-medium text-gray-600">Search leads</label>
            <input
              className={inputCls}
              value={search}
              onChange={(e) => {
                setPage(1)
                setSearch(e.target.value)
              }}
              placeholder="Name, email, city…"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Group</label>
            <select
              className={inputCls}
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
              <option value="ungrouped">Ungrouped only</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.isPriority ? "⭐ " : ""}
                  {g.label} ({g.memberCount ?? 0})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Email status</label>
            <select
              className={inputCls}
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
          <div>
            <label className="text-xs font-medium text-gray-600">Replies</label>
            <select
              className={inputCls}
              value={repliedOnly ? "true" : ""}
              onChange={(e) => {
                setPage(1)
                setRepliedOnly(e.target.value === "true")
              }}
            >
              <option value="">All</option>
              <option value="true">Replied only</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Rows</label>
            <select
              className={inputCls}
              value={pageSize}
              onChange={(e) => {
                setPage(1)
                setPageSize(Number(e.target.value))
              }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
          </div>
          <button type="button" className={btnSecondary} onClick={() => refreshAll()}>
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {selected.length > 0 && (
          <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm font-medium text-indigo-900">{selected.length} selected</span>
              <button type="button" className={btnPrimary} disabled={analyzing} onClick={runBulkAnalyze}>
                <Sparkles className="w-4 h-4" /> Analyze
              </button>
              <button
                type="button"
                className={btnSecondary}
                onClick={() => setShowAssignPanel((v) => !v)}
              >
                <FolderInput className="w-4 h-4" /> Assign to group
              </button>
              <button type="button" className={btnSecondary} onClick={deleteSelectedLeads}>
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </div>
            {showAssignPanel && (
              <div className="flex flex-wrap gap-2 items-end bg-white rounded-lg border border-indigo-100 p-3">
                <div className="min-w-[160px] flex-1">
                  <label className="text-xs font-medium text-gray-600">Existing group</label>
                  <select
                    className={inputCls}
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
                <div className="min-w-[160px] flex-1">
                  <label className="text-xs font-medium text-gray-600">Or new group name</label>
                  <input
                    className={inputCls}
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Create & assign…"
                  />
                </div>
                <button type="button" className={btnPrimary} onClick={() => assignSelected()}>
                  Add to group
                </button>
                <button type="button" className={btnSecondary} onClick={() => assignSelected({ move: true })}>
                  Move to group
                </button>
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => assignSelected({ createNew: true })}
                >
                  <FolderPlus className="w-4 h-4" /> Create new & assign
                </button>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <LoadingBlock />
        ) : leads.length === 0 ? (
          <EmptyState title="No leads yet" description="Add countries and click Find Leads." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b bg-gray-50">
                    <th className="p-2 w-10">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAll}
                        title="Select all on this page"
                        aria-label="Select all on this page"
                      />
                    </th>
                    <th className="p-2 font-medium">Company</th>
                    <th className="p-2 font-medium">Location</th>
                    <th className="p-2 font-medium">Email</th>
                    <th className="p-2 font-medium">Score</th>
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr
                      key={l.id}
                      className={`border-b border-gray-100 hover:bg-gray-50/80 ${
                        hasReplied(l) ? "bg-amber-50/40" : ""
                      }`}
                    >
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selected.includes(l.id)}
                          onChange={() =>
                            setSelected((prev) =>
                              prev.includes(l.id) ? prev.filter((x) => x !== l.id) : [...prev, l.id]
                            )
                          }
                        />
                      </td>
                      <td className="p-2">
                        <div className="font-medium text-gray-900 flex flex-wrap items-center gap-1.5">
                          {l.name}
                          {hasReplied(l) && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-950">
                              Replied
                              {l.replyStatus ? ` · ${l.replyStatus}` : ""}
                            </span>
                          )}
                          {(l.emailSentCount || 0) > 0 && !hasReplied(l) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-800">
                              Sent
                            </span>
                          )}
                        </div>
                        {l.website && (
                          <div className="text-xs text-gray-400 truncate max-w-[200px]">{l.website}</div>
                        )}
                        {l.groupMembers?.length > 0 && (
                          <div className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[240px]">
                            {l.groupMembers.map((m: any) => m.group?.label).filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-gray-600">
                        {[l.city, l.country].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="p-2 text-gray-600">{l.email || "—"}</td>
                      <td className="p-2">{l.leadScore ?? "—"}</td>
                      <td className="p-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100">{l.status}</span>
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        <button
                          type="button"
                          className="text-indigo-600 text-xs font-medium mr-2"
                          onClick={async () => {
                            setAnalyzing(true)
                            await saPost(`/leads/${l.id}`, {})
                            setMessage({ type: "success", text: `Analysis queued for ${l.name}` })
                          }}
                        >
                          Analyze
                        </button>
                        <button
                          type="button"
                          className="text-red-600 text-xs font-medium"
                          onClick={() => deleteLead(l)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap justify-between items-center gap-2 mt-3 text-sm text-gray-600">
              <span>
                {total} leads · page {page} of {totalPages}
                {selected.length > 0 ? ` · ${selected.length} selected` : ""}
              </span>
              <div className="flex gap-2">
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
  )
}
