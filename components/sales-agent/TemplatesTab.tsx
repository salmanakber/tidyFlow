
"use client"

import { useEffect, useState } from "react"
import {
  saGet,
  saPost,
  saPatch,
  saDelete,
  LoadingBlock,
  MessageBanner,
  EmptyState,
  btnPrimary,
  btnSecondary,
  inputCls,
} from "./shared"
import { Copy, Eye, Plus, Send, Loader2, Sparkles, FileText, Check, Trash2 } from "lucide-react"
import { SA_COUNTRIES, SA_LANGUAGES, languageLabel } from "@/lib/sales-agent/taxonomy"

const DEFAULT_HTML = `<p>Hi {{contact_name}},</p>
<p>{{personalized_intro}}</p>
<p>TidyFlow helps cleaning companies like <strong>{{company_name}}</strong> in {{city}} manage scheduling, staff, inspections, and client communication in one place.</p>
<p>Would you be open to a quick demo? Book here: <a href="{{booking_link}}">{{booking_link}}</a></p>
<p>Best,<br/>{{sender_name}}</p>`

const VARIABLES = [
  "company_name",
  "contact_name",
  "city",
  "website",
  "services",
  "personalized_intro",
  "sender_name",
  "booking_link"
]

export default function TemplatesTab() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [editing, setEditing] = useState<any | null>(null)
  const [packPreview, setPackPreview] = useState<any | null>(null)
  const [previewStep, setPreviewStep] = useState(0)
  const [testTo, setTestTo] = useState("")
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [copiedVar, setCopiedVar] = useState<string | null>(null)
  const [filterLanguage, setFilterLanguage] = useState("")
  const [filterCountry, setFilterCountry] = useState("")
  const [showAi, setShowAi] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [aiForm, setAiForm] = useState({
    brief: "",
    htmlStyle: "",
    followUpCount: "2",
    language: "",
    country: "",
    cta: "Soft ask for a short demo using {{booking_link}}",
  })

  const load = async () => {
    setLoading(true)
    try {
      setItems(await saGet("/templates"))
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const startNew = () => {
    setEditing({
      id: null,
      name: "Outreach pack",
      language: "",
      country: "",
      subject: "Quick idea for {{company_name}}",
      htmlBody: DEFAULT_HTML,
      textBody: "Hi {{contact_name}},\n\n{{personalized_intro}}\n\nBook a demo: {{booking_link}}\n\n{{sender_name}}",
      status: "DRAFT",
      delayDays: 0,
      stepLabel: "Day 0 · Initial",
      parentId: null,
      children: [],
    })
    setPackPreview(null)
  }

  const addChildDraft = () => {
    if (!editing) return
    const day = Math.max(1, (editing.children?.length || 0) + 1)
    setEditing({
      ...editing,
      children: [
        ...(editing.children || []),
        {
          id: null,
          _draft: true,
          name: `${editing.name || "Pack"} · Day ${day}`,
          subject: `Following up — {{company_name}}`,
          htmlBody: DEFAULT_HTML,
          textBody: `Hi {{contact_name}},\n\nJust following up on my previous note.\n\n{{sender_name}}`,
          delayDays: day === 1 ? 1 : day === 2 ? 3 : day * 2,
          stepLabel: `Day ${day === 1 ? 1 : day === 2 ? 3 : day * 2} follow-up`,
          status: "DRAFT",
          language: editing.language || "",
          country: editing.country || "",
        },
      ],
    })
  }

  const save = async () => {
    setSaving(true)
    try {
      let parentId = editing.id
      const parentPayload = {
        name: editing.name,
        subject: editing.subject,
        htmlBody: editing.htmlBody,
        textBody: editing.textBody,
        language: editing.language || null,
        country: editing.country || null,
        status: editing.status,
        delayDays: 0,
        stepLabel: editing.stepLabel || "Initial outreach",
        parentId: null,
      }

      if (editing.id) {
        await saPatch(`/templates/${editing.id}`, parentPayload)
      } else {
        const created = await saPost("/templates", parentPayload)
        parentId = created.id
      }

      for (const child of editing.children || []) {
        const childPayload = {
          name: child.name,
          subject: child.subject,
          htmlBody: child.htmlBody,
          textBody: child.textBody,
          language: child.language || editing.language || null,
          country: child.country || editing.country || null,
          status: child.status || "DRAFT",
          delayDays: Number(child.delayDays) || 1,
          stepLabel: child.stepLabel || null,
          parentId,
        }
        if (child.id && !child._draft) {
          await saPatch(`/templates/${child.id}`, childPayload)
        } else {
          await saPost("/templates", childPayload)
        }
      }

      setMessage({ type: "success", text: "Template pack saved" })
      setEditing(null)
      load()
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setSaving(false)
    }
  }

  const doPreview = async (id: number) => {
    setBusyId(id)
    setPreviewStep(0)
    try {
      const data = await saPost(`/templates/${id}`, { action: "preview", includePack: true })
      setPackPreview(data)
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setBusyId(null)
    }
  }

  const runAiGenerate = async () => {
    setGenerating(true)
    setMessage(null)
    try {
      const data = await saPost(
        "/templates",
        {
          action: "generate",
          brief: aiForm.brief,
          htmlStyle: aiForm.htmlStyle,
          followUpCount: Number(aiForm.followUpCount) || 0,
          language: aiForm.language || undefined,
          country: aiForm.country || undefined,
          cta: aiForm.cta || undefined,
        },
        { timeout: 120000 }
      )
      setEditing(data.draft)
      setShowAi(false)
      setPackPreview(null)
      setMessage({
        type: "success",
        text: `AI draft ready via ${data.provider || "AI"} — review HTML, then Save.`,
      })
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setGenerating(false)
    }
  }

  const copyVariable = (v: string) => {
    navigator.clipboard.writeText(`{{${v}}}`)
    setCopiedVar(v)
    setTimeout(() => setCopiedVar(null), 2000)
  }

  if (loading) return <LoadingBlock />

  const filtered = items.filter((t) => {
    if (filterLanguage && t.language !== filterLanguage) return false
    if (filterCountry && t.country !== filterCountry) return false
    return true
  })

  const activePreviewStep = packPreview?.steps?.[previewStep] || null

  return (
    <div className="space-y-6">
      <MessageBanner message={message} />
      
      {/* Information Header Block */}
      <div className="bg-[#0D1E36] text-white rounded-xl p-5 border border-[#1A314F] shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#D97706] animate-pulse" />
              <h2 className="text-sm font-semibold tracking-wider uppercase text-slate-200">Outreach Variables</h2>
            </div>
            <p className="text-xs text-slate-300 max-w-xl">
              Customize dynamic messages. Click any indicator to copy its template tag, and configure defaults under Setup.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold px-4 py-2.5 rounded-lg border border-white/15 transition-all"
              onClick={() => setShowAi(true)}
            >
              <Sparkles className="w-4 h-4 text-[#D97706]" /> AI Generate
            </button>
            <button 
              type="button" 
              className="inline-flex items-center gap-1.5 bg-[#D97706] hover:bg-[#C26405] text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-sm transition-all duration-150" 
              onClick={startNew}
            >
              <Plus className="w-4 h-4" /> New Template
            </button>
          </div>
        </div>

        {/* Dynamic Variables Grid */}
        <div className="flex flex-wrap gap-2 pt-3 border-t border-[#1A314F]">
          {VARIABLES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => copyVariable(v)}
              className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono bg-[#1E2D4A] hover:bg-[#25395C] border border-[#1E2D4A] hover:border-[#D97706] text-slate-200 transition-all duration-150"
            >
              <span className="text-[#D97706] font-bold">{"{{"}</span>
              <span>{v}</span>
              <span className="text-[#D97706] font-bold">{"}}"}</span>
              {copiedVar === v ? (
                <Check className="w-3 h-3 text-[#10B981] ml-0.5" />
              ) : (
                <Copy className="w-3 h-3 text-slate-400 opacity-40 group-hover:opacity-100 ml-0.5 transition-opacity" />
              )}
            </button>
          ))}
        </div>
      </div>

      {editing && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-200">
          {/* Editor Header */}
          <div className="border-b border-[#EEF0F5] bg-[#F8F9FC] px-5 py-4 flex items-center gap-2.5">
            <div className="p-1.5 rounded bg-[#FEF3C7] text-[#D97706]">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#0D1E36]">Template Composer</h3>
              <p className="text-xs text-gray-500">Edit raw HTML or plain text copy variants</p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-xs font-semibold text-[#0D1E36]">Internal Name</label>
                <input 
                  className={`${inputCls} transition-all duration-150 focus:border-[#D97706]`} 
                  value={editing.name} 
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })} 
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#0D1E36]">Delivery Status</label>
                <select 
                  className={`${inputCls} transition-all duration-150 focus:border-[#D97706]`} 
                  value={editing.status} 
                  onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                >
                  <option value="DRAFT">Draft Mode</option>
                  <option value="PUBLISHED">Published (Active)</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#0D1E36]">
                  Language <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <select
                  className={`${inputCls} transition-all duration-150 focus:border-[#D97706]`}
                  value={editing.language || ""}
                  onChange={(e) => setEditing({ ...editing, language: e.target.value })}
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
                <label className="text-xs font-semibold text-[#0D1E36]">
                  Country <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <select
                  className={`${inputCls} transition-all duration-150 focus:border-[#D97706]`}
                  value={editing.country || ""}
                  onChange={(e) => setEditing({ ...editing, country: e.target.value })}
                >
                  <option value="">Any / not set</option>
                  {SA_COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 flex items-end">
                <p className="text-[10px] text-gray-400 leading-relaxed pb-2">
                  Tags who this template is written for. Add follow-up children below for day 1 / day 3 campaign packs.
                </p>
              </div>
              <div className="md:col-span-3 space-y-1.5">
                <label className="text-xs font-semibold text-[#0D1E36]">Subject Line</label>
                <input 
                  className={`${inputCls} transition-all duration-150 focus:border-[#D97706]`} 
                  value={editing.subject} 
                  onChange={(e) => setEditing({ ...editing, subject: e.target.value })} 
                />
              </div>
              <div className="md:col-span-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#0D1E36]">HTML Rich Format</label>
                  <span className="text-[10px] text-slate-400 font-mono">Rendered for modern clients</span>
                </div>
                <textarea 
                  className={`${inputCls} font-mono text-xs focus:border-[#D97706]`} 
                  rows={8} 
                  value={editing.htmlBody || ""} 
                  onChange={(e) => setEditing({ ...editing, htmlBody: e.target.value })} 
                />
              </div>
              <div className="md:col-span-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#0D1E36]">Plain Text Alternative</label>
                  <span className="text-[10px] text-slate-400 font-mono">Used as spam backup format</span>
                </div>
                <textarea 
                  className={`${inputCls} font-mono text-xs focus:border-[#D97706]`} 
                  rows={4} 
                  value={editing.textBody || ""} 
                  onChange={(e) => setEditing({ ...editing, textBody: e.target.value })} 
                />
              </div>
            </div>

            {/* Follow-up children (template pack) */}
            {!editing.parentId && (
              <div className="space-y-3 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-[#0D1E36] uppercase tracking-wider">
                      Follow-up children (campaign pack)
                    </h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Day 1 / day 3 (or custom) emails for the same leads. Campaigns can apply this pack in one click.
                    </p>
                  </div>
                  <button type="button" className={`${btnSecondary} text-xs py-1.5`} onClick={addChildDraft}>
                    <Plus className="w-3.5 h-3.5" /> Add follow-up
                  </button>
                </div>

                {(editing.children || []).length === 0 ? (
                  <p className="text-[11px] text-gray-400 rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center">
                    No follow-ups yet — add Day 1, Day 3, etc. for drip campaigns.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {(editing.children || []).map((child: any, idx: number) => (
                      <div key={child.id || `draft-${idx}`} className="rounded-xl border border-[#E3E7F0] bg-[#F8F9FC] p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#0D1E36] bg-white border px-2 py-0.5 rounded-full">
                            Child {idx + 1}
                            {child.delayDays != null ? ` · Day ${child.delayDays}` : ""}
                          </span>
                          <button
                            type="button"
                            className="text-[11px] font-semibold text-rose-600"
                            onClick={async () => {
                              if (child.id && !child._draft) {
                                if (!window.confirm(`Delete follow-up "${child.name}"?`)) return
                                await saDelete(`/templates/${child.id}`)
                              }
                              setEditing({
                                ...editing,
                                children: (editing.children || []).filter((_: any, i: number) => i !== idx),
                              })
                            }}
                          >
                            Remove
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="md:col-span-2 space-y-1">
                            <label className="text-[10px] font-bold uppercase text-gray-500">Name</label>
                            <input
                              className={`${inputCls} bg-white text-xs`}
                              value={child.name || ""}
                              onChange={(e) => {
                                const children = [...(editing.children || [])]
                                children[idx] = { ...children[idx], name: e.target.value }
                                setEditing({ ...editing, children })
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-gray-500">Send after (days)</label>
                            <input
                              type="number"
                              min={1}
                              className={`${inputCls} bg-white text-xs`}
                              value={child.delayDays ?? 1}
                              onChange={(e) => {
                                const children = [...(editing.children || [])]
                                children[idx] = { ...children[idx], delayDays: e.target.value }
                                setEditing({ ...editing, children })
                              }}
                            />
                          </div>
                          <div className="md:col-span-3 space-y-1">
                            <label className="text-[10px] font-bold uppercase text-gray-500">Step label</label>
                            <input
                              className={`${inputCls} bg-white text-xs`}
                              value={child.stepLabel || ""}
                              onChange={(e) => {
                                const children = [...(editing.children || [])]
                                children[idx] = { ...children[idx], stepLabel: e.target.value }
                                setEditing({ ...editing, children })
                              }}
                              placeholder="e.g. Day 3 follow-up"
                            />
                          </div>
                          <div className="md:col-span-3 space-y-1">
                            <label className="text-[10px] font-bold uppercase text-gray-500">Subject</label>
                            <input
                              className={`${inputCls} bg-white text-xs`}
                              value={child.subject || ""}
                              onChange={(e) => {
                                const children = [...(editing.children || [])]
                                children[idx] = { ...children[idx], subject: e.target.value }
                                setEditing({ ...editing, children })
                              }}
                            />
                          </div>
                          <div className="md:col-span-3 space-y-1">
                            <label className="text-[10px] font-bold uppercase text-gray-500">HTML body</label>
                            <textarea
                              className={`${inputCls} bg-white font-mono text-xs`}
                              rows={4}
                              value={child.htmlBody || ""}
                              onChange={(e) => {
                                const children = [...(editing.children || [])]
                                children[idx] = { ...children[idx], htmlBody: e.target.value }
                                setEditing({ ...editing, children })
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Action Bar */}
            <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
              <button 
                type="button" 
                className="inline-flex items-center gap-1.5 bg-[#0D1E36] hover:bg-[#142944] text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-sm transition-all" 
                onClick={save} 
                disabled={saving}
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D97706]" />}
                {saving ? "Saving Changes..." : "Save Template Pack"}
              </button>
              <button 
                type="button" 
                className={btnSecondary} 
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showAi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-[#F8F9FC]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#D97706]" />
                <div>
                  <h3 className="text-sm font-bold text-[#0D1E36]">Generate template with AI</h3>
                  <p className="text-[11px] text-gray-500">Tell us the message and the HTML look — not a generic template.</p>
                </div>
              </div>
              <button type="button" className="text-gray-400 hover:text-[#0D1E36] text-xs font-semibold" onClick={() => setShowAi(false)}>
                Close
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#0D1E36] uppercase tracking-wider">What should the email say?</label>
                <textarea
                  className={`${inputCls} min-h-[88px]`}
                  value={aiForm.brief}
                  onChange={(e) => setAiForm({ ...aiForm, brief: e.target.value })}
                  placeholder="e.g. Short cold intro for commercial cleaning owners who still use WhatsApp + spreadsheets — mention ops chaos, offer a 15-min demo."
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#0D1E36] uppercase tracking-wider">HTML design you want</label>
                <textarea
                  className={`${inputCls} min-h-[100px]`}
                  value={aiForm.htmlStyle}
                  onChange={(e) => setAiForm({ ...aiForm, htmlStyle: e.target.value })}
                  placeholder="e.g. Minimal single-column, navy (#0D1E36) header bar with brand name, body in system-friendly sans, one amber (#D97706) CTA button, no cards, no purple gradients, generous whitespace, works in Gmail."
                />
                <p className="text-[10px] text-gray-400">Be specific: layout, colors, typography, CTA style. Generic “make a nice email” will be rejected.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-gray-400">Follow-ups</label>
                  <select
                    className={inputCls}
                    value={aiForm.followUpCount}
                    onChange={(e) => setAiForm({ ...aiForm, followUpCount: e.target.value })}
                  >
                    <option value="0">None (1 email)</option>
                    <option value="1">+1 follow-up</option>
                    <option value="2">+2 follow-ups</option>
                    <option value="3">+3 follow-ups</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-gray-400">Language</label>
                  <select
                    className={inputCls}
                    value={aiForm.language}
                    onChange={(e) => setAiForm({ ...aiForm, language: e.target.value })}
                  >
                    <option value="">Any / English</option>
                    {SA_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-gray-400">Country</label>
                  <select
                    className={inputCls}
                    value={aiForm.country}
                    onChange={(e) => setAiForm({ ...aiForm, country: e.target.value })}
                  >
                    <option value="">Any</option>
                    {SA_COUNTRIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-gray-400">CTA preference</label>
                <input
                  className={inputCls}
                  value={aiForm.cta}
                  onChange={(e) => setAiForm({ ...aiForm, cta: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className={btnSecondary} onClick={() => setShowAi(false)}>Cancel</button>
                <button
                  type="button"
                  className={`${btnPrimary} inline-flex items-center gap-2`}
                  disabled={generating}
                  onClick={runAiGenerate}
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generating ? "Generating…" : "Generate draft"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {packPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 bg-[#0D1E36] text-white flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-300 font-bold">Pack preview</p>
                <h3 className="text-sm font-semibold mt-0.5">{packPreview.packName}</h3>
                <p className="text-[11px] text-slate-400 mt-1">
                  {packPreview.stepCount} email{(packPreview.stepCount || 0) === 1 ? "" : "s"} — switch tabs to view each child
                </p>
              </div>
              <button
                type="button"
                className="text-xs font-semibold text-slate-300 hover:text-white"
                onClick={() => setPackPreview(null)}
              >
                Close
              </button>
            </div>

            <div className="px-4 pt-3 flex flex-wrap gap-2 border-b border-gray-100 bg-[#F8F9FC]">
              {(packPreview.steps || []).map((s: any, idx: number) => (
                <button
                  key={s.id || idx}
                  type="button"
                  onClick={() => setPreviewStep(idx)}
                  className={`px-3 py-2 rounded-t-lg text-[11px] font-semibold border-b-2 transition-colors ${
                    previewStep === idx
                      ? "bg-white text-[#0D1E36] border-[#D97706]"
                      : "text-slate-500 border-transparent hover:text-[#0D1E36]"
                  }`}
                >
                  Round {idx + 1}
                  <span className="block text-[9px] font-medium text-slate-400 normal-case">
                    {s.stepLabel || s.name || (idx === 0 ? "Initial" : `Day ${s.delayDays}`)}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#F6F7FB]">
              {activePreviewStep && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="bg-slate-50 border-b border-gray-100 px-4 py-3 flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                    <span className="text-[10px] font-mono text-gray-400 ml-2">
                      {activePreviewStep.name || `Email ${previewStep + 1}`}
                    </span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="text-xs space-y-1 border-b border-gray-100 pb-3">
                      <div><span className="text-gray-400">Subject:</span> <span className="font-semibold text-[#0D1E36]">{activePreviewStep.subject}</span></div>
                      {activePreviewStep.delayDays > 0 && (
                        <div className="text-gray-400">Sends after {activePreviewStep.delayDays} day(s)</div>
                      )}
                    </div>
                    <div
                      className="rounded-lg border border-gray-100 bg-white p-5 min-h-[200px] prose prose-sm max-w-none shadow-inner"
                      dangerouslySetInnerHTML={{
                        __html: activePreviewStep.htmlBody || `<pre>${activePreviewStep.textBody || ""}</pre>`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {items.length === 0 && !editing ? (
        <EmptyState title="No templates" description="Create a pack manually or generate one with AI (describe the HTML look you want)." />
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Language</label>
              <select className={`${inputCls} min-w-[160px] text-xs py-1.5`} value={filterLanguage} onChange={(e) => setFilterLanguage(e.target.value)}>
                <option value="">All languages</option>
                {SA_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Country</label>
              <select className={`${inputCls} min-w-[180px] text-xs py-1.5`} value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)}>
                <option value="">All countries</option>
                {SA_COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-gray-400 ml-auto">{filtered.length} pack{filtered.length === 1 ? "" : "s"}</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.map((t) => {
              const childCount = t._count?.children ?? t.children?.length ?? 0
              return (
                <div key={t.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:border-[#D97706]/40 transition-colors">
                  <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-[#0D1E36] truncate">{t.name}</h4>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{t.subject}</p>
                      </div>
                      <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        t.status === "PUBLISHED"
                          ? "bg-green-50 text-green-700 border border-green-100"
                          : "bg-amber-50 text-[#D97706] border border-[#FEF3C7]"
                      }`}>
                        {t.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#F8F9FC] text-[#0D1E36] font-semibold border border-gray-100">
                        Pack · {childCount + 1} email{childCount + 1 === 1 ? "" : "s"}
                      </span>
                      {t.language ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">{languageLabel(t.language)}</span>
                      ) : null}
                      {t.country ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-medium">{t.country}</span>
                      ) : null}
                      <span className="text-[10px] px-2 py-0.5 rounded-md text-gray-400 font-mono">v{t.version}</span>
                    </div>

                    {childCount > 0 && (
                      <ul className="text-[11px] text-slate-500 space-y-1 border-t border-gray-100 pt-3">
                        <li className="font-semibold text-[#0D1E36]">1. {t.stepLabel || "Initial"} — {t.subject}</li>
                        {(t.children || []).map((c: any, idx: number) => (
                          <li key={c.id}>
                            {idx + 2}. {c.stepLabel || c.name} · day {c.delayDays ?? "?"} — {c.subject}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="px-5 py-3 bg-[#F8F9FC] border-t border-gray-100 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-[#0D1E36] hover:text-[#D97706] inline-flex items-center gap-1"
                      disabled={busyId === t.id}
                      onClick={async () => {
                        setBusyId(t.id)
                        try {
                          const full = await saGet(`/templates/${t.id}`)
                          setEditing({ ...full, children: full.children || [] })
                          setPackPreview(null)
                        } catch (e: any) {
                          setMessage({ type: "error", text: e.message })
                        } finally {
                          setBusyId(null)
                        }
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-[#0D1E36] hover:text-[#D97706] inline-flex items-center gap-1 disabled:opacity-50"
                      disabled={busyId === t.id}
                      onClick={() => doPreview(t.id)}
                    >
                      {busyId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                      View pack
                    </button>
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-[#0D1E36] hover:text-[#D97706] inline-flex items-center gap-1"
                      onClick={async () => {
                        await saPost("/templates", { action: "duplicate", id: t.id })
                        load()
                      }}
                    >
                      <Copy className="w-3.5 h-3.5" /> Duplicate
                    </button>
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 inline-flex items-center gap-1"
                      disabled={busyId === t.id}
                      onClick={async () => {
                        if (!window.confirm(`Delete template "${t.name}"?`)) return
                        setBusyId(t.id)
                        try {
                          await saDelete(`/templates/${t.id}`)
                          setMessage({ type: "success", text: "Template deleted" })
                          if (editing?.id === t.id) setEditing(null)
                          setPackPreview(null)
                          await load()
                        } catch (e: any) {
                          setMessage({ type: "error", text: e.message })
                        } finally {
                          setBusyId(null)
                        }
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                    <div className="ml-auto inline-flex items-center gap-1">
                      <input
                        className="text-[11px] border border-gray-200 rounded px-2 py-1 w-32 focus:border-[#D97706] focus:outline-none bg-white"
                        placeholder="test@email.com"
                        value={testTo}
                        onChange={(e) => setTestTo(e.target.value)}
                      />
                      <button
                        type="button"
                        className="bg-[#0D1E36] text-white hover:bg-[#D97706] p-1.5 rounded"
                        onClick={async () => {
                          try {
                            await saPost(`/templates/${t.id}`, { action: "test_email", to: testTo })
                            setMessage({ type: "success", text: "Test email sent (round 1)" })
                          } catch (e: any) {
                            setMessage({ type: "error", text: e.message })
                          }
                        }}
                      >
                        <Send className="w-3 h-3" />
                      </button>
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
