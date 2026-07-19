
"use client"

import { useEffect, useState, useCallback } from "react"
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
import { Play, Pause, Plus, Pencil, Trash2, Loader2, Settings, Users, CalendarDays, LayoutDashboard, X } from "lucide-react"
import { SA_COUNTRIES, SA_LANGUAGES, formatAudienceTag, languageLabel } from "@/lib/sales-agent/taxonomy"
import { parseCampaignSequence } from "@/lib/sales-agent/campaign-sequence"

type FormStep = {
  templateId: string
  delayDays: string
  sendAt: string
  label: string
  scheduleMode: "delay" | "date"
}

const emptyStep = (): FormStep => ({
  templateId: "",
  delayDays: "0",
  sendAt: "",
  label: "",
  scheduleMode: "delay",
})

const emptyForm = {
  name: "",
  language: "",
  country: "",
  aiPrompt: "",
  delayBetweenEmails: "60",
  maxEmailsPerDay: "50",
  skipIfReplied: true,
  steps: [{ ...emptyStep(), delayDays: "0", label: "Initial outreach" }] as FormStep[],
  selectedLeadIds: [] as number[],
  leadFilter: "not_sent" as "not_sent" | "sent" | "all",
}

function statusCls(status: string) {
  if (status === "RUNNING") return "bg-[#E1F5E9] text-[#166534] ring-1 ring-[#166534]/10"
  if (status === "PAUSED") return "bg-[#FCEACB] text-[#8A5A00] ring-1 ring-[#8A5A00]/10"
  return "bg-[#EEF0F5] text-[#5B6478] ring-1 ring-[#5B6478]/10"
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
  const [actionId, setActionId] = useState<number | null>(null)
  const [leadSearch, setLeadSearch] = useState("")
  const [leadsLoading, setLeadsLoading] = useState(false)
  const [filterLanguage, setFilterLanguage] = useState("")
  const [filterCountry, setFilterCountry] = useState("")
  const [details, setDetails] = useState<any | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)

  const openDetails = async (c: any) => {
    setDetailsLoading(true)
    setDetails({ ...c, _loading: true })
    try {
      const full = await saGet(`/campaigns/${c.id}`)
      setDetails(full)
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
      setDetails(null)
    } finally {
      setDetailsLoading(false)
    }
  }

  const loadCore = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [campaigns, tpls, grp] = await Promise.all([
        saGet("/campaigns"),
        saGet("/templates"),
        saGet("/groups"),
      ])
      setItems(Array.isArray(campaigns) ? campaigns : [])
      setTemplates(
        (Array.isArray(tpls) ? tpls : []).filter(
          (t: any) => t.status === "PUBLISHED" || t.status === "DRAFT"
        )
      )
      setGroups(Array.isArray(grp) ? grp : [])
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  const loadLeads = async () => {
    setLeadsLoading(true)
    try {
      const leads = await saGet("/leads", {
        page: 1,
        pageSize: 200,
        emailFound: "true",
        light: "true",
        discoveryGroupId: groupFilter || undefined,
      })
      setAllLeads(leads.items || [])
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setLeadsLoading(false)
    }
  }

  useEffect(() => {
    loadCore()
  }, [loadCore])

  // Live refresh while any campaign is running/paused (round status + counts)
  useEffect(() => {
    const active = items.some((c) => c.status === "RUNNING" || c.status === "PAUSED")
    if (!active) return
    const t = setInterval(async () => {
      try {
        const campaigns = await saGet("/campaigns")
        setItems(Array.isArray(campaigns) ? campaigns : [])
      } catch {
        /* ignore */
      }
    }, 4000)
    return () => clearInterval(t)
    // Only re-bind when active state flips, not on every items change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.some((c) => c.status === "RUNNING" || c.status === "PAUSED")])

  // Only fetch lead picker data when the create/edit form is open
  useEffect(() => {
    if (showForm) loadLeads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, groupFilter])

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

    const seq = parseCampaignSequence(c.followUpSchedule)
    let steps: FormStep[] =
      seq.steps.length > 0
        ? seq.steps.map((s) => ({
            templateId: String(s.templateId),
            delayDays: String(s.delayDays ?? 0),
            sendAt: s.sendAt
              ? new Date(s.sendAt).toISOString().slice(0, 16)
              : "",
            label: s.label || "",
            scheduleMode: s.sendAt ? "date" : "delay",
          }))
        : [
            {
              ...emptyStep(),
              templateId: c.templateId ? String(c.templateId) : "",
              label: "Initial outreach",
            },
          ]

    setEditingId(c.id)
    setForm({
      name: c.name || "",
      language: c.language || "",
      country: c.country || "",
      aiPrompt: c.aiPrompt || "",
      delayBetweenEmails: String(c.delayBetweenEmails ?? 60),
      maxEmailsPerDay: String(c.maxEmailsPerDay ?? 50),
      skipIfReplied: seq.skipIfReplied !== false,
      steps,
      selectedLeadIds,
      leadFilter: "not_sent",
    })
    setShowForm(true)
  }

  const payload = () => ({
    name: form.name,
    language: form.language || null,
    country: form.country || null,
    aiPrompt: form.aiPrompt || null,
    delayBetweenEmails: Number(form.delayBetweenEmails),
    maxEmailsPerDay: Number(form.maxEmailsPerDay),
    skipIfReplied: !!form.skipIfReplied,
    templateId: form.steps[0]?.templateId ? Number(form.steps[0].templateId) : null,
    steps: form.steps
      .filter((s) => s.templateId)
      .map((s, idx) => ({
        step: idx + 1,
        templateId: Number(s.templateId),
        delayDays: s.scheduleMode === "date" ? 0 : Number(s.delayDays) || 0,
        sendAt:
          s.scheduleMode === "date" && s.sendAt
            ? new Date(s.sendAt).toISOString()
            : null,
        label: s.label || `Email ${idx + 1}`,
      })),
    discoveryMethod: null,
    discoveryConfig: {
      audience: "selected_leads",
      selectedLeadIds: form.selectedLeadIds,
      skipDiscovery: true,
    },
  })

  const save = async () => {
    if (!form.name.trim()) return
    const validSteps = form.steps.filter((s) => s.templateId)
    if (!validSteps.length) {
      setMessage({ type: "error", text: "Add at least one segment with an email template" })
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
      loadCore()
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (id: number, status: string) => {
    setActionId(id)
    try {
      await saPatch(`/campaigns/${id}`, { status })
      setMessage({
        type: "success",
        text:
          status === "RUNNING"
            ? "Campaign started — remaining leads are queued (already-sent skipped). Brevo first, Resend if Brevo is limited."
            : `Campaign ${status.toLowerCase()}`,
      })
      await loadCore()
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setActionId(null)
    }
  }

  const remove = async (c: any) => {
    if (c.status === "RUNNING") {
      setMessage({ type: "error", text: "Pause the campaign before deleting" })
      return
    }
    if (!window.confirm(`Delete "${c.name}"? Sent emails & leads are kept.`)) return
    try {
      await axios.delete(`/api/admin/sales-agent/campaigns/${c.id}?hard=1`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      setMessage({ type: "success", text: "Campaign deleted" })
      if (editingId === c.id) {
        setShowForm(false)
        setEditingId(null)
      }
      loadCore()
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
    <div className="space-y-6">
      <MessageBanner message={message} />
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-[#F6F7FB] rounded-xl border border-[#E3E7F0]">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-[#0B1B3B]">Outreach Campaigns</h2>
          <p className="text-xs text-[#5B6478] max-w-2xl leading-relaxed">
            Target specific leads, select your template, and activate outreach scheduling. 
            Leads automatically flag as <span className="font-semibold text-[#0B1B3B]">Email sent</span> upon dispatch.
          </p>
        </div>
        <button 
          type="button" 
          className={`${btnPrimary} shrink-0 shadow-sm transition-all duration-150 hover:brightness-95 active:scale-95`} 
          onClick={openCreate}
        >
          <Plus className="w-4 h-4 mr-1.5" /> New Campaign
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-[#E3E7F0] shadow-sm overflow-hidden transition-all duration-200">
          {/* Form Header */}
          <div className="border-b border-[#E3E7F0] bg-[#F6F7FB] px-5 py-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#0B1B3B]">
                {editingId ? "Modify Existing Campaign" : "Configure New Campaign"}
              </h3>
              <p className="text-xs text-[#8890A0]">Define parameters, pacing, and audience scope</p>
            </div>
            <span className="text-[10px] font-semibold tracking-wider text-[#5B6478] bg-[#EEF0F5] px-2.5 py-1 rounded-full uppercase">
              Draft Configuration
            </span>
          </div>

          <div className="p-5 space-y-6">
            {/* Section 1: Campaign Profile & Details */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-1.5 border-b border-[#EEF0F5]">
                <Settings className="w-4 h-4 text-[#5B6478]" />
                <h4 className="text-xs font-semibold text-[#0B1B3B] uppercase tracking-wider">Campaign Profile</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-xs font-medium text-[#5B6478]">Campaign Name</label>
                  <input
                    className={`${inputCls} transition-all duration-150 focus:border-[#0B1B3B]`}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g., UAE drip — intro + follow-ups"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#5B6478]">
                    Language <span className="text-[#8890A0] font-normal">(optional)</span>
                  </label>
                  <select
                    className={`${inputCls} transition-all duration-150 focus:border-[#0B1B3B]`}
                    value={form.language}
                    onChange={(e) => setForm({ ...form, language: e.target.value })}
                  >
                    <option value="">Any / not set</option>
                    {SA_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#5B6478]">
                    Country <span className="text-[#8890A0] font-normal">(optional)</span>
                  </label>
                  <select
                    className={`${inputCls} transition-all duration-150 focus:border-[#0B1B3B]`}
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                  >
                    <option value="">Any / not set</option>
                    {SA_COUNTRIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-[#8890A0]">
                    Tags who this campaign is for — does not auto-filter leads.
                  </p>
                </div>
              </div>
            </div>

            {/* Section 2: Email segments / sequence */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-1.5 border-b border-[#EEF0F5]">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-[#5B6478]" />
                  <h4 className="text-xs font-semibold text-[#0B1B3B] uppercase tracking-wider">
                    Email segments &amp; schedule
                  </h4>
                </div>
                <button
                  type="button"
                  className={`${btnSecondary} text-xs py-1.5`}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      steps: [
                        ...prev.steps,
                        {
                          ...emptyStep(),
                          delayDays: String(Math.max(1, prev.steps.length)),
                          label: `Follow-up ${prev.steps.length}`,
                        },
                      ],
                    }))
                  }
                >
                  <Plus className="w-3.5 h-3.5" /> Add segment
                </button>
              </div>

              <p className="text-[11px] text-[#8890A0] leading-relaxed">
                Same leads get each segment in order. Step 1 sends now (with stagger). Later steps use
                days-after-start or a custom date via the automation worker.
              </p>

              <div className="space-y-3">
                {form.steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-[#E3E7F0] bg-[#F8F9FC] p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#0B1B3B] bg-white border border-[#E3E7F0] px-2 py-0.5 rounded-full">
                        Segment {idx + 1}
                        {idx === 0 ? " · First email" : " · Follow-up"}
                      </span>
                      {form.steps.length > 1 && (
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-[#9A2A1E] hover:underline"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              steps: prev.steps.filter((_, i) => i !== idx),
                            }))
                          }
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="md:col-span-2 space-y-1.5">
                        <label className="text-xs font-medium text-[#5B6478]">Email template</label>
                        <select
                          className={`${inputCls} bg-white`}
                          value={step.templateId}
                          onChange={(e) => {
                            const steps = [...form.steps]
                            steps[idx] = { ...steps[idx], templateId: e.target.value }
                            setForm({ ...form, steps })
                          }}
                        >
                          <option value="">Select template</option>
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                              {(t._count?.children > 0 || (t.children || []).length > 0)
                                ? ` · Pack (${(t._count?.children ?? t.children.length) + 1})`
                                : ""}
                              {formatAudienceTag({ language: t.language, country: t.country })
                                ? ` · ${formatAudienceTag({ language: t.language, country: t.country })}`
                                : ""}
                            </option>
                          ))}
                        </select>
                        {idx === 0 &&
                          step.templateId &&
                          (() => {
                            const pack = templates.find((t) => String(t.id) === String(step.templateId))
                            const childCount = pack?._count?.children ?? pack?.children?.length ?? 0
                            if (!childCount) return null
                            return (
                              <button
                                type="button"
                                className={`${btnSecondary} text-[11px] py-1.5 mt-1`}
                                onClick={async () => {
                                  try {
                                    const res = await saPost("/templates", {
                                      action: "expand_pack",
                                      id: Number(step.templateId),
                                    })
                                    const nextSteps = (res.steps || []).map((s: any) => ({
                                      templateId: String(s.templateId),
                                      delayDays: String(s.delayDays ?? 0),
                                      sendAt: "",
                                      label: s.label || "",
                                      scheduleMode: "delay" as const,
                                    }))
                                    if (!nextSteps.length) {
                                      setMessage({ type: "error", text: "Pack has no steps" })
                                      return
                                    }
                                    setForm((prev) => ({ ...prev, steps: nextSteps }))
                                    setMessage({
                                      type: "success",
                                      text: `Applied pack — ${nextSteps.length} segments (day 0 + follow-ups)`,
                                    })
                                  } catch (e: any) {
                                    setMessage({ type: "error", text: e.message })
                                  }
                                }}
                              >
                                Apply pack schedule ({childCount + 1} emails)
                              </button>
                            )
                          })()}
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-[#5B6478]">Label (optional)</label>
                        <input
                          className={`${inputCls} bg-white`}
                          value={step.label}
                          onChange={(e) => {
                            const steps = [...form.steps]
                            steps[idx] = { ...steps[idx], label: e.target.value }
                            setForm({ ...form, steps })
                          }}
                          placeholder={idx === 0 ? "Initial outreach" : `Follow-up ${idx}`}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-[#5B6478]">When to send</label>
                        <select
                          className={`${inputCls} bg-white`}
                          value={step.scheduleMode}
                          onChange={(e) => {
                            const mode = e.target.value as "delay" | "date"
                            const steps = [...form.steps]
                            steps[idx] = {
                              ...steps[idx],
                              scheduleMode: mode,
                              delayDays: mode === "delay" && idx > 0 && !steps[idx].delayDays ? String(idx) : steps[idx].delayDays,
                            }
                            setForm({ ...form, steps })
                          }}
                          disabled={idx === 0}
                        >
                          <option value="delay">{idx === 0 ? "At campaign start" : "Days after start"}</option>
                          <option value="date">Custom date &amp; time</option>
                        </select>
                      </div>
                      {step.scheduleMode === "delay" ? (
                        <div className="space-y-1.5 md:col-span-2">
                          <label className="text-xs font-medium text-[#5B6478]">
                            Days after campaign start
                          </label>
                          <input
                            type="number"
                            min={0}
                            className={`${inputCls} bg-white max-w-[160px]`}
                            value={idx === 0 ? "0" : step.delayDays}
                            disabled={idx === 0}
                            onChange={(e) => {
                              const steps = [...form.steps]
                              steps[idx] = { ...steps[idx], delayDays: e.target.value }
                              setForm({ ...form, steps })
                            }}
                          />
                          <p className="text-[10px] text-[#8890A0]">
                            {idx === 0
                              ? "First email sends when you click Start (staggered per lead)."
                              : `Sends ${Number(step.delayDays) || 0} day(s) after Start for each selected lead.`}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1.5 md:col-span-2">
                          <label className="text-xs font-medium text-[#5B6478]">Send at</label>
                          <input
                            type="datetime-local"
                            className={`${inputCls} bg-white max-w-xs`}
                            value={step.sendAt}
                            onChange={(e) => {
                              const steps = [...form.steps]
                              steps[idx] = { ...steps[idx], sendAt: e.target.value }
                              setForm({ ...form, steps })
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#5B6478]">Stagger between leads (seconds)</label>
                  <input
                    type="number"
                    className={`${inputCls}`}
                    value={form.delayBetweenEmails}
                    onChange={(e) => setForm({ ...form, delayBetweenEmails: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#5B6478]">
                    Pace — max leads / day
                  </label>
                  <input
                    type="number"
                    min={1}
                    className={`${inputCls}`}
                    value={form.maxEmailsPerDay}
                    onChange={(e) => setForm({ ...form, maxEmailsPerDay: e.target.value })}
                  />
                  <p className="text-[10px] text-[#8890A0] leading-snug">
                    Does not cap total leads. Extra leads are scheduled on the next day(s). Start again queues anyone still missing.
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#0B1B3B] cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-[#0B1B3B] rounded border-gray-300 w-4 h-4"
                      checked={!!form.skipIfReplied}
                      onChange={(e) => setForm({ ...form, skipIfReplied: e.target.checked })}
                    />
                    Skip later segments if the lead already replied
                  </label>
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-xs font-medium text-[#5B6478]">AI Prompt Enrichment (Optional)</label>
                  <textarea
                    className={`${inputCls} resize-y min-h-[70px]`}
                    rows={2}
                    value={form.aiPrompt}
                    onChange={(e) => setForm({ ...form, aiPrompt: e.target.value })}
                    placeholder="Tone directives for this campaign"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Target Audience */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-1.5 border-b border-[#EEF0F5]">
                <Users className="w-4 h-4 text-[#5B6478]" />
                <h4 className="text-xs font-semibold text-[#0B1B3B] uppercase tracking-wider">Audience Selector</h4>
              </div>

              <div className="border border-[#E3E7F0] rounded-xl p-4 bg-[#F8F9FC] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h5 className="text-xs font-semibold text-[#0B1B3B]">Selected Recipients</h5>
                    <p className="text-[11px] text-[#8890A0]">
                      <strong className="text-[#0B1B3B]">{form.selectedLeadIds.length}</strong> active selection(s) 
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" className={`${btnSecondary} text-xs py-1 px-2.5`} onClick={selectAllVisible}>
                      Select all visible
                    </button>
                    {groupFilter && (
                      <button type="button" className={`${btnSecondary} text-xs py-1 px-2.5`} onClick={selectEntireGroup}>
                        Select group
                      </button>
                    )}
                    <button type="button" className={`${btnSecondary} text-xs py-1 px-2.5 text-[#9A2A1E] border-red-100 hover:bg-red-50`} onClick={clearSelection}>
                      Clear selection
                    </button>
                  </div>
                </div>

                {/* Filter Controls Bar */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#8890A0] uppercase">Lead Group</label>
                    <select
                      className={`${inputCls} bg-white`}
                      value={groupFilter}
                      onChange={(e) => setGroupFilter(e.target.value)}
                    >
                      <option value="">All leads</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.alreadySent || (g.emailedCount || 0) > 0 ? "✓ Already sent · " : ""}
                          {g.label} ({g.memberCount ?? 0})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#8890A0] uppercase">Outreach Filter</label>
                    <div className="flex p-0.5 bg-[#EEF0F5] rounded-lg border border-[#E3E7F0] h-[36px] items-center">
                      {(
                        [
                          ["not_sent", "Pending"],
                          ["sent", "Emailed"],
                          ["all", "Show All"],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setForm({ ...form, leadFilter: id })}
                          className={`flex-1 text-center py-1 rounded-md text-[11px] font-medium transition-all duration-150 ${
                            form.leadFilter === id
                              ? "bg-white text-[#0B1B3B] shadow-xs font-semibold"
                              : "text-[#5B6478] hover:text-[#0B1B3B]"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#8890A0] uppercase">Search Context</label>
                    <input
                      className={`${inputCls} bg-white`}
                      value={leadSearch}
                      onChange={(e) => setLeadSearch(e.target.value)}
                      placeholder="Name, email, location..."
                    />
                  </div>
                </div>

                {/* Leads Scrollable Area */}
                <div className="max-h-56 overflow-y-auto border border-[#E3E7F0] rounded-lg bg-white shadow-inner">
                  {leadsLoading ? (
                    <div className="text-center py-10 px-4 text-xs text-[#8890A0]">Loading leads…</div>
                  ) : filteredLeads.length === 0 ? (
                    <div className="text-center py-10 px-4">
                      <p className="text-xs text-[#8890A0]">
                        No matching leads identified. Navigate to <span className="font-semibold text-[#5B6478]">Find Leads</span> to ingest contacts.
                      </p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-[#F6F7FB] border-b border-[#E3E7F0] z-10">
                        <tr className="text-[#8890A0] text-[10px] font-bold uppercase tracking-wider">
                          <th className="p-3 w-10 text-center" />
                          <th className="p-3">Company Name</th>
                          <th className="p-3">Email Address</th>
                          <th className="p-3">Location</th>
                          <th className="p-3 text-right pr-4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EEF0F5]">
                        {filteredLeads.map((l) => (
                          <tr key={l.id} className="hover:bg-[#F8F9FC] transition-colors duration-100 text-xs">
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                className="accent-[#0B1B3B] rounded border-gray-300 w-3.5 h-3.5 cursor-pointer"
                                checked={form.selectedLeadIds.includes(l.id)}
                                onChange={() => toggleLead(l.id)}
                              />
                            </td>
                            <td className="p-3 font-semibold text-[#0B1B3B]">{l.name}</td>
                            <td className="p-3 text-[#5B6478]">{l.email}</td>
                            <td className="p-3 text-[#8890A0]">
                              {[l.city, l.country].filter(Boolean).join(", ") || "—"}
                            </td>
                            <td className="p-3 text-right pr-4 w-[120px]">
                              {(l.emailSentCount || 0) > 0 ? (
                                <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-[#E1F5E9] text-[#166534] font-medium">
                                  Sent ({l.emailSentCount})
                                </span>
                              ) : (
                                <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-[#EEF0F5] text-[#5B6478] font-medium">
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
            </div>
          </div>

          {/* Form Actions Footer */}
          <div className="bg-[#F6F7FB] border-t border-[#E3E7F0] px-5 py-4 flex items-center gap-3">
            <button
              type="button"
              className={`${btnPrimary} min-w-[120px] transition-all`}
              onClick={save}
              disabled={!form.name || saving}
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Saving...
                </>
              ) : editingId ? (
                "Save changes"
              ) : (
                "Create campaign"
              )}
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

      {details && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 bg-[#0B1B3B] text-white flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-300 font-bold">Campaign dashboard</p>
                <h3 className="text-sm font-semibold mt-0.5">{details.name}</h3>
                <p className="text-[11px] text-slate-400 mt-1">
                  {details.status}
                  {details.sequenceProgress?.headline ? ` · ${details.sequenceProgress.headline}` : ""}
                </p>
              </div>
              <button type="button" className="text-slate-300 hover:text-white" onClick={() => setDetails(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#F8F9FC]">
              {detailsLoading || details._loading ? (
                <LoadingBlock />
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      ["Selected leads", details.selectedLeadCount ?? "—"],
                      ["Emails tracked", details.dashboard?.totalEmails ?? 0],
                      ["Sent", details.dashboard?.sent ?? 0],
                      ["Queued", details.dashboard?.queued ?? 0],
                      ["Failed", details.dashboard?.failed ?? 0],
                      ["Canceled", details.dashboard?.canceled ?? 0],
                    ].map(([label, val]) => (
                      <div key={String(label)} className="bg-white rounded-xl border border-gray-200 p-3.5">
                        <div className="text-xl font-bold text-[#0B1B3B] tabular-nums">{val}</div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-1">{label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#0B1B3B]">Rounds</h4>
                    <div className="space-y-2">
                      {(details.sequenceProgress?.rounds || []).map((r: any) => (
                        <div key={r.step} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 bg-[#F8F9FC] px-3 py-2.5">
                          <div>
                            <p className="text-xs font-semibold text-[#0B1B3B]">
                              Round {r.step} · {r.label}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5">{r.summary}</p>
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">
                            sent {r.sent} · queued {r.queued} · failed {r.failed}
                          </div>
                        </div>
                      ))}
                      {!details.sequenceProgress?.rounds?.length && (
                        <p className="text-xs text-gray-400">No segment schedule yet.</p>
                      )}
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#0B1B3B]">Recent sends</h4>
                    <div className="max-h-56 overflow-y-auto divide-y divide-gray-100">
                      {(details.dashboard?.recent || []).map((e: any) => (
                        <div key={e.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <p className="font-semibold text-[#0B1B3B] truncate">{e.company?.name || e.recipientEmail}</p>
                            <p className="text-[10px] text-gray-400">{e.recipientEmail}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100">{e.deliveryStatus}</span>
                            <p className="text-[10px] text-gray-400 mt-1">Round {e.sequenceStep || 1}</p>
                          </div>
                        </div>
                      ))}
                      {!details.dashboard?.recent?.length && (
                        <p className="text-xs text-gray-400 py-2">No emails queued yet.</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="No campaigns configured"
          description="Build custom campaigns, populate lead lists from Find Leads, then initiate sending operations."
        />
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-[#E3E7F0] shadow-sm p-4 flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#8890A0]">Filter language</label>
              <select
                className={`${inputCls} min-w-[160px] text-xs py-1.5`}
                value={filterLanguage}
                onChange={(e) => setFilterLanguage(e.target.value)}
              >
                <option value="">All languages</option>
                {SA_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#8890A0]">Filter country</label>
              <select
                className={`${inputCls} min-w-[180px] text-xs py-1.5`}
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
              >
                <option value="">All countries</option>
                {SA_COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {items
              .filter((c) => {
                if (filterLanguage && c.language !== filterLanguage) return false
                if (filterCountry && c.country !== filterCountry) return false
                return true
              })
              .map((c) => {
                let selectedCount = 0
                try {
                  const cfg = c.discoveryConfig ? JSON.parse(c.discoveryConfig) : {}
                  selectedCount = Array.isArray(cfg.selectedLeadIds) ? cfg.selectedLeadIds.length : 0
                } catch {
                  /* ignore */
                }
                const seq = parseCampaignSequence(c.followUpSchedule)
                const stepCount = seq.steps.length || (c.templateId ? 1 : 0)
                return (
                  <div
                    key={c.id}
                    className="bg-white rounded-xl border border-[#E3E7F0] shadow-sm hover:border-[#D98E04]/35 transition-colors overflow-hidden"
                  >
                    <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-start gap-4">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-bold text-[#0B1B3B]">{c.name}</h4>
                          <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold ${statusCls(c.status)}`}>
                            {c.status}
                          </span>
                          {c.language ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#EEF0F5] font-medium">{languageLabel(c.language)}</span>
                          ) : null}
                          {c.country ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#8A5A00] font-medium">{c.country}</span>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Template: <span className="font-medium text-[#0B1B3B]">{c.template?.name || "—"}</span>
                          {" · "}
                          {selectedCount} leads selected · {c.emailsSent ?? c._count?.sentEmails ?? 0} delivered
                          {stepCount ? ` · ${stepCount} round${stepCount === 1 ? "" : "s"}` : ""}
                        </p>
                        {c.sequenceProgress?.headline && (
                          <p className="text-[11px] font-medium text-[#0B1B3B] bg-[#F8F9FC] border border-gray-100 rounded-lg px-3 py-2">
                            {c.sequenceProgress.headline}
                          </p>
                        )}
                        {c.sequenceProgress?.rounds?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {c.sequenceProgress.rounds.map((r: any) => (
                              <span
                                key={r.step}
                                className={`text-[10px] px-2 py-1 rounded-md border font-medium ${
                                  r.status === "sent"
                                    ? "bg-green-50 text-green-800 border-green-100"
                                    : r.status === "sending"
                                      ? "bg-amber-50 text-amber-800 border-amber-100"
                                      : "bg-slate-50 text-slate-600 border-slate-200"
                                }`}
                              >
                                R{r.step} {r.status}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 lg:justify-end shrink-0">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#0B1B3B] border border-gray-200 bg-white hover:bg-slate-50 px-3 py-2 rounded-lg"
                          onClick={() => openDetails(c)}
                        >
                          <LayoutDashboard className="w-3.5 h-3.5 text-[#D98E04]" /> Details
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#0B1B3B] border border-gray-200 bg-white hover:bg-slate-50 px-3 py-2 rounded-lg"
                          onClick={() => openEdit(c)}
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                        {(c.status === "DRAFT" || c.status === "PAUSED" || c.status === "COMPLETED") && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#166534] border border-green-100 bg-green-50 hover:bg-green-100 px-3 py-2 rounded-lg disabled:opacity-50"
                            disabled={actionId === c.id}
                            onClick={() => setStatus(c.id, "RUNNING")}
                          >
                            {actionId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                            {(c.emailsSent ?? 0) > 0 ? "Continue" : "Start"}
                          </button>
                        )}
                        {c.status === "RUNNING" && (
                          <>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#166534] border border-green-100 bg-green-50 px-3 py-2 rounded-lg disabled:opacity-50"
                              disabled={actionId === c.id}
                              onClick={() => setStatus(c.id, "RUNNING")}
                            >
                              {actionId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                              Queue remaining
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#8A5A00] border border-amber-100 bg-amber-50 px-3 py-2 rounded-lg disabled:opacity-50"
                              disabled={actionId === c.id}
                              onClick={() => setStatus(c.id, "PAUSED")}
                            >
                              {actionId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
                              Pause
                            </button>
                          </>
                        )}
                        {c.status !== "RUNNING" && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#9A2A1E] border border-rose-100 bg-rose-50 px-3 py-2 rounded-lg"
                            onClick={() => remove(c)}
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
