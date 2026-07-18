
"use client"

import { useEffect, useState } from "react"
import {
  saGet,
  saPut,
  saPost,
  LoadingBlock,
  MessageBanner,
  StatCard,
  SavedSecretField,
  inputCls,
  btnSecondary,
} from "./shared"
import { Cpu, Sparkles, CheckCircle, AlertCircle, ToggleLeft, Loader2, X } from "lucide-react"

export default function AIConfigTab() {
  const [data, setData] = useState<any>(null)
  const [form, setForm] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [editSecrets, setEditSecrets] = useState<Record<string, boolean>>({})
  const [testing, setTesting] = useState<string | null>(null)
  const [testModal, setTestModal] = useState<any>(null)

  const load = async () => {
    const d = await saGet("/config")
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
    setEditSecrets({})
  }

  useEffect(() => {
    load()
      .catch((e) => setMessage({ type: "error", text: e.message }))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const payload: any = { ...form }
      if (!editSecrets.groqApiKey || !payload.groqApiKey || payload.groqApiKey.startsWith("••")) {
        delete payload.groqApiKey
      }
      if (!editSecrets.geminiApiKey || !payload.geminiApiKey || payload.geminiApiKey.startsWith("••")) {
        delete payload.geminiApiKey
      }
      // First-time save: allow key when not previously saved
      if (!data?.config?.hasGroqKey && form.groqApiKey) payload.groqApiKey = form.groqApiKey
      if (!data?.config?.hasGeminiKey && form.geminiApiKey) payload.geminiApiKey = form.geminiApiKey
      if (data?.config?.hasGroqKey && editSecrets.groqApiKey && form.groqApiKey) {
        payload.groqApiKey = form.groqApiKey
      }
      if (data?.config?.hasGeminiKey && editSecrets.geminiApiKey && form.geminiApiKey) {
        payload.geminiApiKey = form.geminiApiKey
      }

      await saPut("/config", payload)
      setMessage({ type: "success", text: "AI configuration saved successfully" })
      await load()
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setSaving(false)
    }
  }

  const runTest = async (provider: "groq" | "gemini") => {
    setTesting(provider)
    setTestModal(null)
    try {
      const result = await saPost(
        "/config",
        { action: provider === "groq" ? "test_groq" : "test_gemini" },
        { timeout: 25000 }
      )
      setTestModal(result)
      setMessage({
        type: result.ok ? "success" : "error",
        text: result.message || result.error || "Test finished",
      })
    } catch (e: any) {
      const err = { ok: false, provider, error: e.message }
      setTestModal(err)
      setMessage({ type: "error", text: e.message })
    } finally {
      setTesting(null)
    }
  }

  if (loading) return <LoadingBlock />

  return (
    <div className="space-y-6">
      <MessageBanner message={message} />

      {data?.usage && (
        <div className="p-4 bg-slate-50 border border-gray-200 rounded-xl shadow-inner space-y-3">
          <div className="flex items-center gap-1.5 px-1">
            <span className="w-2 h-2 rounded-full bg-[#D97706]" />
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#0D1E36]">Current Usage Telemetry</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="AI Calls Today" value={data.usage.today} />
            <StatCard label="Calls This Month" value={data.usage.month} />
            <StatCard label="Daily Call Budget" value={data.usage.dailyLimit} />
            <StatCard
              label="Provider Split"
              value={(data.usage.byProvider || []).map((p: any) => `${p.provider}: ${p.count}`).join(" · ") || "None"}
            />
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden space-y-6 p-6">
        {/* Groq */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#D97706]" />
              <h3 className="text-xs font-bold text-[#0D1E36] uppercase tracking-wider">Groq (Primary)</h3>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  data?.config?.hasGroqKey
                    ? "bg-green-50 text-green-700 border border-green-100"
                    : "bg-amber-50 text-[#D97706] border border-[#FEF3C7]"
                }`}
              >
                {data?.config?.hasGroqKey ? (
                  <>
                    <CheckCircle className="w-3 h-3" /> Key saved
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3" /> Unconfigured
                  </>
                )}
              </span>
              <button
                type="button"
                className={`${btnSecondary} text-xs py-1.5`}
                disabled={!!testing || !data?.config?.hasGroqKey}
                onClick={() => runTest("groq")}
              >
                {testing === "groq" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Test Groq
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-3">
              <SavedSecretField
                label="API Authorization Key"
                hasSaved={!!data?.config?.hasGroqKey}
                editing={!!editSecrets.groqApiKey || !data?.config?.hasGroqKey}
                onEdit={() => {
                  setEditSecrets((p) => ({ ...p, groqApiKey: true }))
                  setForm((f: any) => ({ ...f, groqApiKey: "" }))
                }}
                onCancel={() => {
                  setEditSecrets((p) => ({ ...p, groqApiKey: false }))
                  setForm((f: any) => ({ ...f, groqApiKey: "" }))
                }}
                value={form.groqApiKey || ""}
                onChange={(v) => setForm({ ...form, groqApiKey: v })}
                placeholder="gsk_..."
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Model</label>
              <input className={`${inputCls} focus:border-[#D97706]`} value={form.groqModel} onChange={(e) => setForm({ ...form, groqModel: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Temperature</label>
              <input className={`${inputCls} focus:border-[#D97706]`} type="number" step="0.1" value={form.groqTemperature} onChange={(e) => setForm({ ...form, groqTemperature: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Max tokens</label>
              <input className={`${inputCls} focus:border-[#D97706]`} type="number" value={form.groqMaxTokens} onChange={(e) => setForm({ ...form, groqMaxTokens: e.target.value })} />
            </div>
          </div>
        </section>

        {/* Gemini */}
        <section className="space-y-4 pt-4 border-t border-gray-100">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#D97706]" />
              <h3 className="text-xs font-bold text-[#0D1E36] uppercase tracking-wider">Google Gemini (Fallback)</h3>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  data?.config?.hasGeminiKey
                    ? "bg-green-50 text-green-700 border border-green-100"
                    : "bg-amber-50 text-[#D97706] border border-[#FEF3C7]"
                }`}
              >
                {data?.config?.hasGeminiKey ? (
                  <>
                    <CheckCircle className="w-3 h-3" /> Key saved
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3" /> Unconfigured
                  </>
                )}
              </span>
              <button
                type="button"
                className={`${btnSecondary} text-xs py-1.5`}
                disabled={!!testing || !data?.config?.hasGeminiKey}
                onClick={() => runTest("gemini")}
              >
                {testing === "gemini" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Test Gemini
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-3">
              <SavedSecretField
                label="API Authorization Key"
                hasSaved={!!data?.config?.hasGeminiKey}
                editing={!!editSecrets.geminiApiKey || !data?.config?.hasGeminiKey}
                onEdit={() => {
                  setEditSecrets((p) => ({ ...p, geminiApiKey: true }))
                  setForm((f: any) => ({ ...f, geminiApiKey: "" }))
                }}
                onCancel={() => {
                  setEditSecrets((p) => ({ ...p, geminiApiKey: false }))
                  setForm((f: any) => ({ ...f, geminiApiKey: "" }))
                }}
                value={form.geminiApiKey || ""}
                onChange={(v) => setForm({ ...form, geminiApiKey: v })}
                placeholder="AIza..."
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Model</label>
              <input className={`${inputCls} focus:border-[#D97706]`} value={form.geminiModel} onChange={(e) => setForm({ ...form, geminiModel: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Temperature</label>
              <input className={`${inputCls} focus:border-[#D97706]`} type="number" step="0.1" value={form.geminiTemperature} onChange={(e) => setForm({ ...form, geminiTemperature: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Max tokens</label>
              <input className={`${inputCls} focus:border-[#D97706]`} type="number" value={form.geminiMaxTokens} onChange={(e) => setForm({ ...form, geminiMaxTokens: e.target.value })} />
            </div>
          </div>
        </section>

        {/* Behaviour */}
        <section className="space-y-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <ToggleLeft className="w-4 h-4 text-[#D97706]" />
            <h3 className="text-xs font-bold text-[#0D1E36] uppercase tracking-wider">Operational Directives & Limits</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Lead Validation Threshold</label>
              <input className={`${inputCls} focus:border-[#D97706]`} type="number" value={form.leadScoreThreshold} onChange={(e) => setForm({ ...form, leadScoreThreshold: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Dispatch Retry Threshold</label>
              <input className={`${inputCls} focus:border-[#D97706]`} type="number" value={form.aiRetryCount} onChange={(e) => setForm({ ...form, aiRetryCount: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Request Timeout (ms)</label>
              <input className={`${inputCls} focus:border-[#D97706]`} type="number" value={form.aiTimeoutMs} onChange={(e) => setForm({ ...form, aiTimeoutMs: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Daily Cap</label>
              <input className={`${inputCls} focus:border-[#D97706]`} type="number" value={form.dailyAiLimit} onChange={(e) => setForm({ ...form, dailyAiLimit: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3">
            {(["autoAnalyze", "autoEmailGeneration", "autoFollowUp"] as const).map((key) => (
              <label
                key={key}
                className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-[#F8F9FC] hover:bg-[#EEF0F5] transition-colors duration-150 cursor-pointer text-xs font-semibold text-[#0D1E36] select-none"
              >
                <input
                  type="checkbox"
                  className="accent-[#0D1E36] rounded border-gray-300 w-4 h-4 cursor-pointer shrink-0"
                  checked={!!form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                />
                <span>{key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</span>
              </label>
            ))}
          </div>
        </section>

        <div className="pt-4 border-t border-gray-100">
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 bg-[#0D1E36] hover:bg-[#142944] text-white text-xs font-semibold px-5 py-3 rounded-lg shadow-sm transition-all duration-150 disabled:opacity-50"
            disabled={saving}
            onClick={save}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin text-[#D97706]" />}
            {saving ? "Storing configurations..." : "Save AI configurations"}
          </button>
        </div>
      </div>

      {/* Test result popup */}
      {testModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setTestModal(null)}>
          <div
            className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-md w-full p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  {String(testModal.provider || "AI").toUpperCase()} connection test
                </p>
                <h3 className={`text-sm font-semibold mt-1 ${testModal.ok ? "text-green-700" : "text-rose-700"}`}>
                  {testModal.ok ? "Provider reachable" : "Test failed"}
                </h3>
              </div>
              <button type="button" className="p-1 rounded hover:bg-slate-100" onClick={() => setTestModal(null)}>
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              {testModal.message || testModal.error || "No details"}
            </p>
            {testModal.model && (
              <p className="text-[11px] font-mono text-gray-500">
                Model: {testModal.model}
                {testModal.latencyMs != null ? ` · ${testModal.latencyMs}ms` : ""}
              </p>
            )}
            <button type="button" className={`${btnSecondary} text-xs w-full`} onClick={() => setTestModal(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
