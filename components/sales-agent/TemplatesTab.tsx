"use client"

import { useEffect, useState } from "react"
import {
  saGet,
  saPost,
  saPatch,
  LoadingBlock,
  MessageBanner,
  EmptyState,
  btnPrimary,
  btnSecondary,
  inputCls,
} from "./shared"
import { Copy, Eye, Plus, Send } from "lucide-react"

const DEFAULT_HTML = `<p>Hi {{contact_name}},</p>
<p>{{personalized_intro}}</p>
<p>TidyFlow helps cleaning companies like <strong>{{company_name}}</strong> in {{city}} manage scheduling, staff, inspections, and client communication in one place.</p>
<p>Would you be open to a quick demo? Book here: <a href="{{booking_link}}">{{booking_link}}</a></p>
<p>Best,<br/>{{sender_name}}</p>`

export default function TemplatesTab() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [editing, setEditing] = useState<any | null>(null)
  const [preview, setPreview] = useState<any | null>(null)
  const [testTo, setTestTo] = useState("")

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
    try {
      if (editing.id) {
        await saPatch(`/templates/${editing.id}`, editing)
      } else {
        await saPost("/templates", editing)
      }
      setMessage({ type: "success", text: "Template saved" })
      setEditing(null)
      load()
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    }
  }

  const doPreview = async (id: number) => {
    try {
      setPreview(await saPost(`/templates/${id}`, { action: "preview" }))
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    }
  }

  if (loading) return <LoadingBlock />

  return (
    <div className="space-y-4">
      <MessageBanner message={message} />
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">
          Variables: {"{{company_name}} {{contact_name}} {{website}} {{city}} {{services}} {{personalized_intro}} {{sender_name}} {{booking_link}}"}
        </p>
        <button type="button" className={btnPrimary} onClick={startNew}>
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {editing && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Name</label>
              <input className={inputCls} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Status</label>
              <select className={inputCls} value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-gray-600">Subject</label>
              <input className={inputCls} value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-gray-600">HTML Body</label>
              <textarea className={inputCls} rows={8} value={editing.htmlBody || ""} onChange={(e) => setEditing({ ...editing, htmlBody: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-gray-600">Plain Text Body</label>
              <textarea className={inputCls} rows={4} value={editing.textBody || ""} onChange={(e) => setEditing({ ...editing, textBody: e.target.value })} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} onClick={save}>Save</button>
            <button type="button" className={btnSecondary} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      {preview && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h4 className="font-medium text-gray-900 mb-2">Preview</h4>
          <p className="text-sm font-medium mb-2">Subject: {preview.subject}</p>
          <div className="prose prose-sm max-w-none border rounded-lg p-4 bg-gray-50" dangerouslySetInnerHTML={{ __html: preview.htmlBody || preview.textBody || "" }} />
        </div>
      )}

      {items.length === 0 && !editing ? (
        <EmptyState title="No templates" description="Create an HTML or plain-text outreach template." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50">
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Subject</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Version</th>
                <th className="p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className="border-b border-gray-100">
                  <td className="p-3 font-medium text-gray-900">{t.name}</td>
                  <td className="p-3 text-gray-600 max-w-xs truncate">{t.subject}</td>
                  <td className="p-3"><span className="text-xs px-2 py-0.5 rounded-full bg-gray-100">{t.status}</span></td>
                  <td className="p-3">v{t.version}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="text-indigo-600 text-xs inline-flex items-center gap-1" onClick={() => setEditing(t)}>Edit</button>
                      <button type="button" className="text-indigo-600 text-xs inline-flex items-center gap-1" onClick={() => doPreview(t.id)}><Eye className="w-3 h-3" /> Preview</button>
                      <button type="button" className="text-indigo-600 text-xs inline-flex items-center gap-1" onClick={async () => { await saPost("/templates", { action: "duplicate", id: t.id }); load() }}><Copy className="w-3 h-3" /> Duplicate</button>
                      <div className="flex items-center gap-1">
                        <input className="text-xs border rounded px-2 py-1 w-36" placeholder="test@email.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                        <button type="button" className="text-indigo-600 text-xs inline-flex items-center gap-1" onClick={async () => {
                          try {
                            await saPost(`/templates/${t.id}`, { action: "test_email", to: testTo })
                            setMessage({ type: "success", text: "Test email sent" })
                          } catch (e: any) {
                            setMessage({ type: "error", text: e.message })
                          }
                        }}><Send className="w-3 h-3" /> Test</button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
