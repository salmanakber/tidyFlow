"use client"

import { useState, useEffect } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import {
  Sparkles,
  Settings,
  Lightbulb,
  RefreshCw,
  X,
  CheckCircle,
  AlertTriangle,
  Users,
  TrendingUp,
} from "lucide-react"

type AIProviderId = "openai" | "groq" | "google"

const PROVIDER_OPTIONS: { id: AIProviderId; label: string }[] = [
  { id: "openai", label: "OpenAI" },
  { id: "groq", label: "Groq" },
  { id: "google", label: "Google" },
]

const DEFAULT_PRIORITY: AIProviderId[] = ["groq", "google", "openai"]

interface AIConfig {
  enabled: boolean
  provider: string
  model: string
  visionModel: string
  photoVerification: boolean
  assignmentRecommend: boolean
  insightsEnabled: boolean
  minPhotoScore: number
  googleModel?: string
  googleVisionModel?: string
  openaiModel?: string
  openaiVisionModel?: string
  providerPriority?: AIProviderId[]
  hasGroqKey?: boolean
  hasGoogleKey?: boolean
  hasOpenaiKey?: boolean
  groqKeySource?: "database" | "environment" | null
  googleKeySource?: "database" | "environment" | null
  openaiKeySource?: "database" | "environment" | null
  providers?: {
    openai?: boolean
    groq: boolean
    google: boolean
    anyAvailable: boolean
    openaiKeySource?: string | null
    groqKeySource?: string | null
    googleKeySource?: string | null
    providerPriority?: AIProviderId[]
  }
}

interface AIInsight {
  id: number
  type: string
  severity: string
  title: string
  message: string
  createdAt: string
}

function normalizePriority(raw?: AIProviderId[] | null): AIProviderId[] {
  const base = Array.isArray(raw) && raw.length ? raw : DEFAULT_PRIORITY
  const seen = new Set<AIProviderId>()
  const ordered: AIProviderId[] = []
  for (const p of base) {
    if (PROVIDER_OPTIONS.some((o) => o.id === p) && !seen.has(p)) {
      seen.add(p)
      ordered.push(p)
    }
  }
  for (const o of PROVIDER_OPTIONS) {
    if (!seen.has(o.id)) ordered.push(o.id)
  }
  return ordered
}

export default function TidyFlowAIPage() {
  const [config, setConfig] = useState<AIConfig | null>(null)
  const [insights, setInsights] = useState<AIInsight[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [activeTab, setActiveTab] = useState<"insights" | "settings">("insights")
  const [groqApiKeyInput, setGroqApiKeyInput] = useState("")
  const [googleApiKeyInput, setGoogleApiKeyInput] = useState("")
  const [openaiApiKeyInput, setOpenaiApiKeyInput] = useState("")

  useEffect(() => {
    loadAll()
  }, [])

  const getToken = () =>
    localStorage.getItem("authToken") || sessionStorage.getItem("authToken")

  const getSelectedCompanyId = () => {
    const stored = localStorage.getItem("selectedCompanyId")
    return stored ? parseInt(stored, 10) : null
  }

  const companyQuery = () => {
    const id = getSelectedCompanyId()
    return id ? `?companyId=${id}` : ""
  }

  const loadAll = async () => {
    setLoading(true)
    try {
      const token = getToken()
      const cq = companyQuery()
      const [configRes, insightsRes] = await Promise.all([
        axios.get(`/api/ai/config`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`/api/ai/insights${cq}`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (configRes.data.success) {
        const data = configRes.data.data
        setConfig({
          ...data,
          providerPriority: normalizePriority(data.providerPriority),
        })
        setGroqApiKeyInput("")
        setGoogleApiKeyInput("")
        setOpenaiApiKeyInput("")
      }
      if (insightsRes.data.success) setInsights(insightsRes.data.data)
    } catch (error) {
      console.error("Error loading AI data:", error)
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    if (!config) return
    setSaving(true)
    setMessage(null)
    try {
      const token = getToken()
      const payload: Record<string, unknown> = {
        enabled: config.enabled,
        model: config.model,
        visionModel: config.visionModel,
        photoVerification: config.photoVerification,
        assignmentRecommend: config.assignmentRecommend,
        insightsEnabled: config.insightsEnabled,
        minPhotoScore: config.minPhotoScore,
        googleModel: config.googleModel,
        googleVisionModel: config.googleVisionModel,
        openaiModel: config.openaiModel,
        openaiVisionModel: config.openaiVisionModel,
        providerPriority: normalizePriority(config.providerPriority),
      }
      if (groqApiKeyInput.trim()) payload.groqApiKey = groqApiKeyInput.trim()
      if (googleApiKeyInput.trim()) payload.googleApiKey = googleApiKeyInput.trim()
      if (openaiApiKeyInput.trim()) payload.openaiApiKey = openaiApiKeyInput.trim()

      const res = await axios.patch(
        `/api/ai/config`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.data.success) {
        setMessage({ type: "success", text: "AI configuration saved." })
        setGroqApiKeyInput("")
        setGoogleApiKeyInput("")
        setOpenaiApiKeyInput("")
        loadAll()
      }
    } catch (error: any) {
      setMessage({
        type: "error",
        text: error.response?.data?.message || "Failed to save",
      })
    } finally {
      setSaving(false)
    }
  }

  const setPrioritySlot = (slotIndex: number, provider: AIProviderId) => {
    if (!config) return
    const current = normalizePriority(config.providerPriority)
    const next = [...current]
    const swapWith = next.indexOf(provider)
    if (swapWith === slotIndex) return
    // Swap so every provider stays unique
    const displaced = next[slotIndex]
    next[slotIndex] = provider
    if (swapWith >= 0) next[swapWith] = displaced
    setConfig({ ...config, providerPriority: next })
  }

  const generateInsights = async () => {
    setGenerating(true)
    try {
      const token = getToken()
      await axios.post(`/api/ai/insights${companyQuery()}`, {}, { headers: { Authorization: `Bearer ${token}` } })
      const res = await axios.get(`/api/ai/insights${companyQuery()}`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.data.success) setInsights(res.data.data)
      setMessage({ type: "success", text: "Insights generated." })
    } catch (error: any) {
      setMessage({ type: "error", text: error.response?.data?.message || "Generation failed" })
    } finally {
      setGenerating(false)
    }
  }

  const dismissInsight = async (id: number) => {
    try {
      const token = getToken()
      await axios.patch(`/api/ai/insights/${id}${companyQuery()}`, {}, { headers: { Authorization: `Bearer ${token}` } })
      setInsights((prev) => prev.filter((i) => i.id !== id))
    } catch (error) {
      console.error("Dismiss failed:", error)
    }
  }

  const severityIcon = (severity: string) => {
    if (severity === "critical" || severity === "high")
      return <AlertTriangle className="w-4 h-4 text-red-500" />
    if (severity === "medium") return <Users className="w-4 h-4 text-amber-500" />
    return <TrendingUp className="w-4 h-4 text-teal-500" />
  }

  const priority = config ? normalizePriority(config.providerPriority) : DEFAULT_PRIORITY
  const priorityLabel = priority
    .map((p) => PROVIDER_OPTIONS.find((o) => o.id === p)?.label || p)
    .join(" → ")

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex justify-center items-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-100 rounded-xl">
              <Sparkles className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">TidyFlow AI</h1>
              <p className="text-gray-600 mt-1">
                OpenAI, Groq, and Google Gemini with configurable priority — recommends, never decides
              </p>
            </div>
          </div>
          {config && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
                  config.providers?.openai || config.hasOpenaiKey
                    ? "bg-green-100 text-green-800"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {config.providers?.openai || config.hasOpenaiKey ? (
                  <><CheckCircle className="w-3 h-3" /> OpenAI ({config.openaiKeySource || "none"})</>
                ) : (
                  <>OpenAI not configured</>
                )}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
                  config.providers?.groq || config.hasGroqKey
                    ? "bg-green-100 text-green-800"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {config.providers?.groq || config.hasGroqKey ? (
                  <><CheckCircle className="w-3 h-3" /> Groq ({config.groqKeySource || "none"})</>
                ) : (
                  <>Groq not configured</>
                )}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
                  config.providers?.google || config.hasGoogleKey
                    ? "bg-green-100 text-green-800"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {config.providers?.google || config.hasGoogleKey ? (
                  <><CheckCircle className="w-3 h-3" /> Google Gemini ({config.googleKeySource || "none"})</>
                ) : (
                  <>Google AI not configured</>
                )}
              </span>
              <span className="text-xs text-gray-500">
                Priority: {priorityLabel}
              </span>
            </div>
          )}
        </div>

        {message && (
          <div
            className={`mb-4 p-3 rounded-lg text-sm ${
              message.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="flex gap-2 mb-6 border-b border-gray-200">
          {(["insights", "settings"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                activeTab === tab
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "insights" ? (
                <span className="flex items-center gap-1">
                  <Lightbulb className="w-4 h-4" /> Insights ({insights.length})
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Settings className="w-4 h-4" /> Settings
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === "insights" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                onClick={generateInsights}
                disabled={generating}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 text-sm"
              >
                <RefreshCw className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} />
                Generate Insights
              </button>
            </div>

            {insights.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
                No active insights. Click Generate to analyze your operations.
              </div>
            ) : (
              insights.map((insight) => (
                <div
                  key={insight.id}
                  className="bg-white rounded-xl border border-gray-200 p-4 flex gap-3"
                >
                  <div className="mt-0.5">{severityIcon(insight.severity)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs uppercase tracking-wide text-gray-400">
                          {insight.type.replace("_", " ")}
                        </span>
                        <h3 className="font-semibold text-gray-900">{insight.title}</h3>
                      </div>
                      <button
                        onClick={() => dismissInsight(insight.id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{insight.message}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        {activeTab === "settings" && config && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
            {/* API Keys */}
            <div className="border border-teal-100 rounded-xl p-5 bg-teal-50/30 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">API Keys</h3>
                <p className="text-xs text-gray-600 mt-1">
                  Platform-wide keys used for all companies. Server environment variables are fallback when not saved here.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    OpenAI API Key
                  </label>
                  <input
                    type="password"
                    value={openaiApiKeyInput}
                    onChange={(e) => setOpenaiApiKeyInput(e.target.value)}
                    placeholder={config.hasOpenaiKey ? "•••••••• (leave blank to keep current)" : "sk-..."}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    autoComplete="off"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {config.hasOpenaiKey
                      ? `Active: ${config.openaiKeySource === "database" ? "saved in settings" : "from server env"}`
                      : "Not set — add a key or set OPENAI_API_KEY in server env"}
                  </p>
                  {config.openaiKeySource === "database" && (
                    <button
                      type="button"
                      onClick={async () => {
                        const token = getToken()
                        await axios.patch(
                          `/api/ai/config`,
                          { clearOpenaiApiKey: true },
                          { headers: { Authorization: `Bearer ${token}` } }
                        )
                        setOpenaiApiKeyInput("")
                        loadAll()
                        setMessage({ type: "success", text: "OpenAI key removed. Using env fallback if set." })
                      }}
                      className="text-xs text-red-600 mt-1 hover:underline"
                    >
                      Remove saved OpenAI key
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Groq API Key
                  </label>
                  <input
                    type="password"
                    value={groqApiKeyInput}
                    onChange={(e) => setGroqApiKeyInput(e.target.value)}
                    placeholder={config.hasGroqKey ? "•••••••• (leave blank to keep current)" : "gsk_..."}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    autoComplete="off"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {config.hasGroqKey
                      ? `Active: ${config.groqKeySource === "database" ? "saved in settings" : "from server env"}`
                      : "Not set — add a key or set GROQ_API_KEY in server env"}
                  </p>
                  {config.groqKeySource === "database" && (
                    <button
                      type="button"
                      onClick={async () => {
                        const token = getToken()
                        await axios.patch(
                          `/api/ai/config`,
                          { clearGroqApiKey: true },
                          { headers: { Authorization: `Bearer ${token}` } }
                        )
                        setGroqApiKeyInput("")
                        loadAll()
                        setMessage({ type: "success", text: "Groq key removed. Using env fallback if set." })
                      }}
                      className="text-xs text-red-600 mt-1 hover:underline"
                    >
                      Remove saved Groq key
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Google AI Studio API Key
                  </label>
                  <input
                    type="password"
                    value={googleApiKeyInput}
                    onChange={(e) => setGoogleApiKeyInput(e.target.value)}
                    placeholder={config.hasGoogleKey ? "•••••••• (leave blank to keep current)" : "AIza..."}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    autoComplete="off"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {config.hasGoogleKey
                      ? `Active: ${config.googleKeySource === "database" ? "saved in settings" : "from server env"}`
                      : "Not set — add a key or set GOOGLE_AI_API_KEY in server env"}
                  </p>
                  {config.googleKeySource === "database" && (
                    <button
                      type="button"
                      onClick={async () => {
                        const token = getToken()
                        await axios.patch(
                          `/api/ai/config`,
                          { clearGoogleApiKey: true },
                          { headers: { Authorization: `Bearer ${token}` } }
                        )
                        setGoogleApiKeyInput("")
                        loadAll()
                        setMessage({ type: "success", text: "Google key removed. Using env fallback if set." })
                      }}
                      className="text-xs text-red-600 mt-1 hover:underline"
                    >
                      Remove saved Google key
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Provider priority */}
            <div className="border border-gray-200 rounded-xl p-5 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Provider Priority</h3>
                <p className="text-xs text-gray-600 mt-1">
                  Chat and vision try providers in this order, skipping any that are not configured.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(["1st", "2nd", "3rd"] as const).map((label, index) => (
                  <div key={label}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {label} priority
                    </label>
                    <select
                      value={priority[index]}
                      onChange={(e) => setPrioritySlot(index, e.target.value as AIProviderId)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                    >
                      {PROVIDER_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500">Order: {priorityLabel}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                  className="rounded border-gray-300 text-teal-600"
                />
                <span className="text-sm font-medium">AI Enabled</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={config.photoVerification}
                  onChange={(e) =>
                    setConfig({ ...config, photoVerification: e.target.checked })
                  }
                  className="rounded border-gray-300 text-teal-600"
                />
                <span className="text-sm font-medium">Photo Verification</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={config.assignmentRecommend}
                  onChange={(e) =>
                    setConfig({ ...config, assignmentRecommend: e.target.checked })
                  }
                  className="rounded border-gray-300 text-teal-600"
                />
                <span className="text-sm font-medium">Assignment Recommendations</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={config.insightsEnabled}
                  onChange={(e) =>
                    setConfig({ ...config, insightsEnabled: e.target.checked })
                  }
                  className="rounded border-gray-300 text-teal-600"
                />
                <span className="text-sm font-medium">Business Insights</span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Chat Model (OpenAI)
                </label>
                <input
                  type="text"
                  value={config.openaiModel || "gpt-4o-mini"}
                  onChange={(e) => setConfig({ ...config, openaiModel: e.target.value })}
                  placeholder="gpt-4o-mini"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vision Model (OpenAI)
                </label>
                <input
                  type="text"
                  value={config.openaiVisionModel || "gpt-4o"}
                  onChange={(e) => setConfig({ ...config, openaiVisionModel: e.target.value })}
                  placeholder="gpt-4o"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Chat Model (Groq)
                </label>
                <input
                  type="text"
                  value={config.model}
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vision Model (Groq) — photo verification
                </label>
                <input
                  type="text"
                  value={config.visionModel}
                  onChange={(e) => setConfig({ ...config, visionModel: e.target.value })}
                  placeholder="meta-llama/llama-4-scout-17b-16e-instruct"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Chat Model (Google Gemini)
                </label>
                <input
                  type="text"
                  value={config.googleModel || "gemini-2.0-flash"}
                  onChange={(e) => setConfig({ ...config, googleModel: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vision Model (Google Gemini)
                </label>
                <input
                  type="text"
                  value={config.googleVisionModel || "gemini-2.0-flash"}
                  onChange={(e) => setConfig({ ...config, googleVisionModel: e.target.value })}
                  placeholder="gemini-2.0-flash"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Photo Score (flag below)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={config.minPhotoScore}
                  onChange={(e) =>
                    setConfig({ ...config, minPhotoScore: parseInt(e.target.value) || 60 })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>

            <button
              onClick={saveConfig}
              disabled={saving}
              className="px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 font-medium"
            >
              {saving ? "Saving..." : "Save Configuration"}
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
