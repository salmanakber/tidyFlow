
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
  const [preview, setPreview] = useState<any | null>(null)
  const [testTo, setTestTo] = useState("")
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [copiedVar, setCopiedVar] = useState<string | null>(null)

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
      name: "Outreach v1",
      subject: "Quick idea for {{company_name}}",
      htmlBody: DEFAULT_HTML,
      textBody: "Hi {{contact_name}},\n\n{{personalized_intro}}\n\nBook a demo: {{booking_link}}\n\n{{sender_name}}",
      status: "DRAFT",
    })
    setPreview(null)
  }

  const save = async () => {
    setSaving(true)
    try {
      if (editing.id) {
        await saPatch(`/templates/${editing.id}`, editing)
      } else {
        await saPost("/templates", editing)
      }
      setMessage({ type: "success", text: "Template saved successfully" })
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
    try {
      setPreview(await saPost(`/templates/${id}`, { action: "preview" }))
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setBusyId(null)
    }
  }

  const copyVariable = (v: string) => {
    navigator.clipboard.writeText(`{{${v}}}`)
    setCopiedVar(v)
    setTimeout(() => setCopiedVar(null), 2000)
  }

  if (loading) return <LoadingBlock />

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
          <button 
            type="button" 
            className="inline-flex items-center gap-1.5 bg-[#D97706] hover:bg-[#C26405] text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-sm transition-all duration-150 shrink-0" 
            onClick={startNew}
          >
            <Plus className="w-4 h-4" /> New Template
          </button>
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

            {/* Action Bar */}
            <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
              <button 
                type="button" 
                className="inline-flex items-center gap-1.5 bg-[#0D1E36] hover:bg-[#142944] text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-sm transition-all" 
                onClick={save} 
                disabled={saving}
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D97706]" />}
                {saving ? "Saving Changes..." : "Save Template"}
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

      {preview && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Mock Inbox Header */}
          <div className="bg-slate-50 border-b border-gray-100 px-5 py-3.5 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
            <span className="text-[11px] font-medium text-gray-400 ml-2 font-mono">Outbound Message Preview</span>
          </div>
          
          <div className="p-5 space-y-4">
            <div className="space-y-1 text-xs border-b border-gray-100 pb-3">
              <div><span className="text-gray-400 font-medium">From:</span> Sales Agent &lt;system@tidyflow.ai&gt;</div>
              <div><span className="text-gray-400 font-medium">To:</span> Target Prospect &lt;lead@destination.com&gt;</div>
              <div><span className="text-gray-900 font-semibold">Subject:</span> {preview.subject}</div>
            </div>
            
            <div 
              className="prose prose-sm max-w-none border border-gray-100 rounded-lg p-5 bg-white shadow-inner min-h-[150px]" 
              dangerouslySetInnerHTML={{ __html: preview.htmlBody || preview.textBody || "" }} 
            />
          </div>
        </div>
      )}

      {items.length === 0 && !editing ? (
        <EmptyState title="No templates" description="Create an HTML or plain-text outreach template." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="text-gray-500 text-[10px] font-bold uppercase tracking-wider bg-slate-50 border-b border-gray-200">
                  <th className="p-4 pl-5">Template Name</th>
                  <th className="p-4">Subject</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Revision</th>
                  <th className="p-4 text-right pr-5">Control Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 transition-colors duration-100">
                    <td className="p-4 pl-5 font-semibold text-[#0D1E36]">{t.name}</td>
                    <td className="p-4 text-gray-500 max-w-xs truncate">{t.subject}</td>
                    <td className="p-4">
                      <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        t.status === "PUBLISHED" 
                          ? "bg-green-50 text-green-700 border border-green-100" 
                          : t.status === "DRAFT"
                          ? "bg-amber-50 text-[#D97706] border border-[#FEF3C7]"
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-gray-400">v{t.version}</td>
                    <td className="p-4 text-right pr-5">
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        <button 
                          type="button" 
                          className="text-[#0D1E36] hover:text-[#D97706] font-semibold text-[11px] inline-flex items-center gap-1 transition-colors" 
                          onClick={() => setEditing(t)}
                        >
                          Edit
                        </button>
                        
                        <button 
                          type="button" 
                          className="text-[#0D1E36] hover:text-[#D97706] font-semibold text-[11px] inline-flex items-center gap-1 disabled:opacity-50 transition-colors" 
                          disabled={busyId === t.id} 
                          onClick={() => doPreview(t.id)}
                        >
                          {busyId === t.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )} 
                          Preview
                        </button>
                        
                        <button 
                          type="button" 
                          className="text-[#0D1E36] hover:text-[#D97706] font-semibold text-[11px] inline-flex items-center gap-1 transition-colors" 
                          onClick={async () => { 
                            await saPost("/templates", { action: "duplicate", id: t.id }); 
                            load(); 
                          }}
                        >
                          <Copy className="w-3.5 h-3.5" /> Duplicate
                        </button>

                        <button
                          type="button"
                          className="text-rose-600 hover:text-rose-800 font-semibold text-[11px] inline-flex items-center gap-1 transition-colors disabled:opacity-50"
                          disabled={busyId === t.id}
                          onClick={async () => {
                            if (!window.confirm(`Delete template "${t.name}"? Campaigns keep their history.`)) return
                            setBusyId(t.id)
                            try {
                              await saDelete(`/templates/${t.id}`)
                              setMessage({ type: "success", text: "Template deleted" })
                              if (editing?.id === t.id) setEditing(null)
                              if (preview) setPreview(null)
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

                        {/* Direct Test Email Dispatched */}
                        <div className="inline-flex items-center gap-1 pl-2 border-l border-gray-200">
                          <input 
                            className="text-[11px] border border-gray-200 rounded px-2 py-1 w-32 focus:border-[#D97706] focus:outline-none bg-slate-50" 
                            placeholder="test@email.com" 
                            value={testTo} 
                            onChange={(e) => setTestTo(e.target.value)} 
                          />
                          <button 
                            type="button" 
                            className="bg-[#0D1E36] text-white hover:bg-[#D97706] p-1.5 rounded transition-all flex items-center justify-center" 
                            onClick={async () => {
                              try {
                                await saPost(`/templates/${t.id}`, { action: "test_email", to: testTo })
                                setMessage({ type: "success", text: "Test email sent" })
                              } catch (e: any) {
                                setMessage({ type: "error", text: e.message })
                              }
                            }}
                          >
                            <Send className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
