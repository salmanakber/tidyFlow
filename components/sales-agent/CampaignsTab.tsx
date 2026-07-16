"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import {
  saGet,
  saPost,
  saPatch,
  getToken,
  LoadingBlock,
  MessageBanner,
  EmptyState,
  btnPrimary,
  btnSecondary,
  inputCls,
} from "./shared"
import { Play, Pause, Plus, Pencil, Trash2 } from "lucide-react"

const emptyForm = {
  name: "",
  templateId: "",
  aiPrompt: "",
  delayBetweenEmails: "60",
  maxEmailsPerDay: "50",
  selectedLeadIds: [] as number[],
  leadFilter: "not_sent" as "not_sent" | "sent" | "all",
}

export default function CampaignsTab() {
  const [items, setItems] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [allLeads, setAllLeads] = useState<any[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [groupFilter, setGroupFilter] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [leadSearch, setLeadSearch] = useState("")

  const load = async () => {
    setLoading(true)
    try {
      const [campaigns, tpls, leads, grp] = await Promise.all([
        saGet("/campaigns"),
        saGet("/templates"),
        saGet("/leads", {
          page: 1,
          pageSize: 500,
          emailFound: "true",
          discoveryGroupId: groupFilter || undefined,
        }),
        saGet("/groups"),
      ])
      setItems(campaigns)
      setTemplates(tpls.filter((t: any) => t.status === "PUBLISHED" || t.status === "DRAFT"))
      setAllLeads(leads.items || [])
      setGroups(Array.isArray(grp) ? grp : [])
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupFilter])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const openEdit = (c: any) => {
    let selectedLeadIds: number[] = []
    try {
      const cfg = c.discoveryConfig ? JSON.parse(c.discoveryConfig) : {}
      selectedLeadIds = Array.isArray(cfg.selectedLeadIds) ? cfg.selectedLeadIds.map(Number) : []
    } catch {
      /* ignore */
    }
    setEditingId(c.id)
    setForm({
      name: c.name || "",
      templateId: c.templateId ? String(c.templateId) : "",
      aiPrompt: c.aiPrompt || "",
      delayBetweenEmails: String(c.delayBetweenEmails ?? 60),
      maxEmailsPerDay: String(c.maxEmailsPerDay ?? 50),
      selectedLeadIds,
      leadFilter: "not_sent",
    })
    setShowForm(true)
  }

  const payload = () => ({
    name: form.name,
    templateId: form.templateId || null,
    aiPrompt: form.aiPrompt || null,
    delayBetweenEmails: Number(form.delayBetweenEmails),
    maxEmailsPerDay: Number(form.maxEmailsPerDay),
    // No auto-discovery — you pick leads from Find Leads
    discoveryMethod: null,
    discoveryConfig: {
      audience: "selected_leads",
      selectedLeadIds: form.selectedLeadIds,
      skipDiscovery: true,
    },
  })

  const save = async () => {
    if (!form.name.trim()) return
    if (!form.templateId) {
      setMessage({ type: "error", text: "Pick an email template" })
      return
    }
    if (!form.selectedLeadIds.length) {
      setMessage({ type: "error", text: "Select at least one lead to email" })
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        await saPatch(`/campaigns/${editingId}`, payload())
        setMessage({ type: "success", text: "Campaign updated" })
      } else {
        await saPost("/campaigns", payload())
        setMessage({ type: "success", text: "Campaign created — click Start to send" })
      }
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm)
      load()
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (id: number, status: string) => {
    try {
      await saPatch(`/campaigns/${id}`, { status })
      setMessage({
        type: "success",
        text:
          status === "RUNNING"
            ? "Campaign started — emails queued for your selected leads"
            : `Campaign ${status.toLowerCase()}`,
      })
      load()
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    }
  }

  const remove = async (c: any) => {
    if (c.status === "RUNNING") {
      setMessage({ type: "error", text: "Pause the campaign before deleting" })
      return
    }
    if (!window.confirm(`Delete “${c.name}”? Sent emails & leads are kept.`)) return
    try {
      await axios.delete(`/api/admin/sales-agent/campaigns/${c.id}?hard=1`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      setMessage({ type: "success", text: "Campaign deleted" })
      if (editingId === c.id) {
        setShowForm(false)
        setEditingId(null)
      }
      load()
    } catch (e: any) {
      setMessage({ type: "error", text: e.response?.data?.message || e.message })
    }
  }

  const filteredLeads = allLeads.filter((l) => {
    if (!l.email) return false
    if (form.leadFilter === "not_sent" && (l.emailSentCount || 0) > 0) return false
    if (form.leadFilter === "sent" && (l.emailSentCount || 0) === 0) return false
    if (leadSearch) {
      const q = leadSearch.toLowerCase()
      const hay = `${l.name} ${l.email} ${l.city || ""} ${l.country || ""}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const toggleLead = (id: number) => {
    setForm((prev) => ({
      ...prev,
      selectedLeadIds: prev.selectedLeadIds.includes(id)
        ? prev.selectedLeadIds.filter((x) => x !== id)
        : [...prev.selectedLeadIds, id],
    }))
  }

  const selectAllVisible = () => {
    const ids = filteredLeads.map((l) => l.id)
    setForm((prev) => ({
      ...prev,
      selectedLeadIds: Array.from(new Set([...prev.selectedLeadIds, ...ids])),
    }))
  }

  const selectEntireGroup = async () => {
    if (!groupFilter) {
      setMessage({ type: "error", text: "Pick a lead group first" })
      return
    }
    try {
      const g = await saGet("/groups", { id: groupFilter })
      const ids: number[] = g.leadIds || []
      const withEmail = allLeads.filter((l) => ids.includes(l.id) && l.email).map((l) => l.id)
      // Also fetch any group members that might not be in the current page
      const more = await saGet("/leads", {
        page: 1,
        pageSize: 500,
        emailFound: "true",
        discoveryGroupId: groupFilter,
      })
      const fromApi = (more.items || []).map((l: any) => l.id)
      setForm((prev) => ({
        ...prev,
        selectedLeadIds: Array.from(new Set([...prev.selectedLeadIds, ...withEmail, ...fromApi])),
      }))
      setMessage({ type: "success", text: `Selected leads from group (${fromApi.length} with email)` })
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    }
  }

  const clearSelection = () => setForm((prev) => ({ ...prev, selectedLeadIds: [] }))

  if (loading) return <LoadingBlock />

  return (
    <div className="space-y-4">
      <MessageBanner message={message} />
      <div className="flex justify-between items-center gap-3">
        <p className="text-sm text-gray-600">
          Pick leads you already found → choose a template → Start. Each lead is marked <strong>Email sent</strong> after delivery. Repeat later for the rest.
        </p>
        <button type="button" className={btnPrimary} onClick={openCreate}>
          <Plus className="w-4 h-4" /> New Campaign
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">
            {editingId ? "Edit campaign" : "New campaign"}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Campaign Name</label>
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. First outreach — batch 1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Email Template</label>
              <select
                className={inputCls}
                value={form.templateId}
                onChange={(e) => setForm({ ...form, templateId: e.target.value })}
              >
                <option value="">Select template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Delay between emails (sec)</label>
              <input
                className={inputCls}
                value={form.delayBetweenEmails}
                onChange={(e) => setForm({ ...form, delayBetweenEmails: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Max emails this run</label>
              <input
                className={inputCls}
                value={form.maxEmailsPerDay}
                onChange={(e) => setForm({ ...form, maxEmailsPerDay: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-gray-600">AI Prompt (optional)</label>
              <textarea
                className={inputCls}
                rows={2}
                value={form.aiPrompt}
                onChange={(e) => setForm({ ...form, aiPrompt: e.target.value })}
              />
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">Select leads</h4>
                <p className="text-xs text-gray-500">
                  {form.selectedLeadIds.length} selected · Prefer a lead group from Find Leads
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="text-xs font-medium text-gray-600">Lead group</label>
                <select
                  className={inputCls}
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value)}
                >
                  <option value="">All leads</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label} ({g.memberCount ?? 0})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-1">
                {(
                  [
                    ["not_sent", "Not emailed yet"],
                    ["sent", "Already emailed"],
                    ["all", "All with email"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setForm({ ...form, leadFilter: id })}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                      form.leadFilter === id
                        ? "bg-slate-900 text-white"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex-1 min-w-[160px]">
                <input
                  className={inputCls}
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  placeholder="Search leads…"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnSecondary} onClick={selectAllVisible}>
                Select all visible
              </button>
              {groupFilter && (
                <button type="button" className={btnSecondary} onClick={selectEntireGroup}>
                  Select entire group
                </button>
              )}
              <button type="button" className={btnSecondary} onClick={clearSelection}>
                Clear
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-lg">
              {filteredLeads.length === 0 ? (
                <p className="text-sm text-gray-500 p-4 text-center">
                  No leads here. Go to Find Leads, discover companies, then come back.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="text-left text-gray-500 text-xs">
                      <th className="p-2 w-8" />
                      <th className="p-2">Company</th>
                      <th className="p-2">Email</th>
                      <th className="p-2">Location</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((l) => (
                      <tr key={l.id} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={form.selectedLeadIds.includes(l.id)}
                            onChange={() => toggleLead(l.id)}
                          />
                        </td>
                        <td className="p-2 font-medium text-gray-900">{l.name}</td>
                        <td className="p-2 text-gray-600">{l.email}</td>
                        <td className="p-2 text-gray-500 text-xs">
                          {[l.city, l.country].filter(Boolean).join(", ") || "—"}
                        </td>
                        <td className="p-2">
                          {(l.emailSentCount || 0) > 0 ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                              Email sent ({l.emailSentCount})
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                              Not sent
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button type="button" className={btnPrimary} onClick={save} disabled={!form.name || saving}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Create campaign"}
            </button>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => {
                setShowForm(false)
                setEditingId(null)
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="No campaigns"
          description="Create a campaign, select leads from Find Leads, then Start."
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50">
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Template</th>
                <th className="p-3 font-medium">Selected leads</th>
                <th className="p-3 font-medium">Emails sent</th>
                <th className="p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                let selectedCount = 0
                try {
                  const cfg = c.discoveryConfig ? JSON.parse(c.discoveryConfig) : {}
                  selectedCount = Array.isArray(cfg.selectedLeadIds) ? cfg.selectedLeadIds.length : 0
                } catch {
                  /* ignore */
                }
                return (
                  <tr key={c.id} className="border-b border-gray-100">
                    <td className="p-3 font-medium text-gray-900">{c.name}</td>
                    <td className="p-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          c.status === "RUNNING"
                            ? "bg-green-100 text-green-800"
                            : c.status === "PAUSED"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="p-3 text-gray-600">{c.template?.name || "—"}</td>
                    <td className="p-3">{selectedCount}</td>
                    <td className="p-3">{c.emailsSent ?? c._count?.sentEmails ?? 0}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="text-indigo-600 text-xs font-medium inline-flex items-center gap-1"
                          onClick={() => openEdit(c)}
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                        {(c.status === "DRAFT" || c.status === "PAUSED" || c.status === "COMPLETED") && (
                          <button
                            type="button"
                            className="text-green-600 text-xs font-medium inline-flex items-center gap-1"
                            onClick={() => setStatus(c.id, "RUNNING")}
                          >
                            <Play className="w-3 h-3" /> Start
                          </button>
                        )}
                        {c.status === "RUNNING" && (
                          <button
                            type="button"
                            className="text-amber-600 text-xs font-medium inline-flex items-center gap-1"
                            onClick={() => setStatus(c.id, "PAUSED")}
                          >
                            <Pause className="w-3 h-3" /> Pause
                          </button>
                        )}
                        {c.status !== "RUNNING" && (
                          <button
                            type="button"
                            className="text-red-600 text-xs font-medium inline-flex items-center gap-1"
                            onClick={() => remove(c)}
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
