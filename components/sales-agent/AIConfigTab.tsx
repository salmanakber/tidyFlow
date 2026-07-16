"use client"

import { useEffect, useState } from "react"
import {
  saGet,
  saPut,
  LoadingBlock,
  MessageBanner,
  StatCard,
  btnPrimary,
  inputCls,
} from "./shared"

export default function AIConfigTab() {
  const [data, setData] = useState<any>(null)
  const [form, setForm] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    saGet("/config")
      .then((d) => {
        setData(d)
        setForm({
          groqApiKey: "",
          groqModel: d.config.groqModel,
          groqTemperature: d.config.groqTemperature,
          groqMaxTokens: d.config.groqMaxTokens,
          geminiApiKey: "",
          geminiModel: d.config.geminiModel,
          geminiTemperature: d.config.geminiTemperature,
          geminiMaxTokens: d.config.geminiMaxTokens,
          leadScoreThreshold: d.config.leadScoreThreshold,
          autoAnalyze: d.config.autoAnalyze,
          autoEmailGeneration: d.config.autoEmailGeneration,
          autoFollowUp: d.config.autoFollowUp,
          aiRetryCount: d.config.aiRetryCount,
          aiTimeoutMs: d.config.aiTimeoutMs,
          dailyAiLimit: d.config.dailyAiLimit,
        })
      })
      .catch((e) => setMessage({ type: "error", text: e.message }))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const payload: any = { ...form }
      if (!payload.groqApiKey || payload.groqApiKey.startsWith("••")) delete payload.groqApiKey
      if (!payload.geminiApiKey || payload.geminiApiKey.startsWith("••")) delete payload.geminiApiKey
      await saPut("/config", payload)
      setMessage({ type: "success", text: "AI configuration saved" })
      const d = await saGet("/config")
      setData(d)
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingBlock />

  return (
    <div className="space-y-6">
      <MessageBanner message={message} />

      {data?.usage && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="AI Calls Today" value={data.usage.today} />
          <StatCard label="AI Calls This Month" value={data.usage.month} />
          <StatCard label="Daily Limit" value={data.usage.dailyLimit} />
          <StatCard
            label="By Provider"
            value={(data.usage.byProvider || []).map((p: any) => `${p.provider}: ${p.count}`).join(" · ") || "—"}
          />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-6">
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Groq (Primary)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-gray-600">
                API Key {data?.config?.hasGroqKey ? "(configured)" : "(not set)"}
              </label>
              <input
                type="password"
                className={inputCls}
                placeholder={data?.config?.hasGroqKey ? "•••••••• (leave blank to keep)" : "gsk_…"}
                value={form.groqApiKey}
                onChange={(e) => setForm({ ...form, groqApiKey: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Model</label>
              <input className={inputCls} value={form.groqModel} onChange={(e) => setForm({ ...form, groqModel: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Temperature</label>
              <input className={inputCls} type="number" step="0.1" value={form.groqTemperature} onChange={(e) => setForm({ ...form, groqTemperature: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Max Tokens</label>
              <input className={inputCls} type="number" value={form.groqMaxTokens} onChange={(e) => setForm({ ...form, groqMaxTokens: e.target.value })} />
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Google Gemini (Fallback)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-gray-600">
                API Key {data?.config?.hasGeminiKey ? "(configured)" : "(not set)"}
              </label>
              <input
                type="password"
                className={inputCls}
                placeholder={data?.config?.hasGeminiKey ? "•••••••• (leave blank to keep)" : "AIza…"}
                value={form.geminiApiKey}
                onChange={(e) => setForm({ ...form, geminiApiKey: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Model</label>
              <input className={inputCls} value={form.geminiModel} onChange={(e) => setForm({ ...form, geminiModel: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Temperature</label>
              <input className={inputCls} type="number" step="0.1" value={form.geminiTemperature} onChange={(e) => setForm({ ...form, geminiTemperature: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Max Tokens</label>
              <input className={inputCls} type="number" value={form.geminiMaxTokens} onChange={(e) => setForm({ ...form, geminiMaxTokens: e.target.value })} />
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">AI Behaviour</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Lead Score Threshold</label>
              <input className={inputCls} type="number" value={form.leadScoreThreshold} onChange={(e) => setForm({ ...form, leadScoreThreshold: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">AI Retry Count</label>
              <input className={inputCls} type="number" value={form.aiRetryCount} onChange={(e) => setForm({ ...form, aiRetryCount: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">AI Timeout (ms)</label>
              <input className={inputCls} type="number" value={form.aiTimeoutMs} onChange={(e) => setForm({ ...form, aiTimeoutMs: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Daily AI Limit</label>
              <input className={inputCls} type="number" value={form.dailyAiLimit} onChange={(e) => setForm({ ...form, dailyAiLimit: e.target.value })} />
            </div>
            {(["autoAnalyze", "autoEmailGeneration", "autoFollowUp"] as const).map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={!!form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                />
                {key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
              </label>
            ))}
          </div>
        </section>

        <button type="button" className={btnPrimary} disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save AI Configuration"}
        </button>
      </div>
    </div>
  )
}
