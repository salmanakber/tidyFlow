"use client"

import { useState } from "react"
import axios from "axios"
import { Sparkles, User, ChevronRight, Loader2 } from "lucide-react"

export interface CleanerRecommendation {
  userId: number
  name: string
  score: number
  reason: string
  distance?: number
  qualityScore?: number
  tasksCompleted?: number
}

interface AIRecommendationsPanelProps {
  taskId?: number
  propertyId?: number | string
  scheduledDate?: string
  onAssign?: (cleanerId: number) => void
  compact?: boolean
}

export default function AIRecommendationsPanel({
  taskId,
  propertyId,
  scheduledDate,
  onAssign,
  compact = false,
}: AIRecommendationsPanelProps) {
  const [loading, setLoading] = useState(false)
  const [recommended, setRecommended] = useState<CleanerRecommendation | null>(null)
  const [alternatives, setAlternatives] = useState<CleanerRecommendation[]>([])
  const [aiGenerated, setAiGenerated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const loadRecommendations = async () => {
    if (!taskId && !propertyId) {
      setError("Select a property first")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const res = await axios.post(
        "/api/ai/recommend-cleaners",
        {
          ...(taskId ? { taskId } : {}),
          ...(propertyId ? { propertyId: Number(propertyId) } : {}),
          ...(scheduledDate ? { scheduledDate } : {}),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.data.success) {
        setRecommended(res.data.data.recommended)
        setAlternatives(res.data.data.alternatives || [])
        setAiGenerated(res.data.data.aiGenerated)
        setLoaded(true)
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to load recommendations")
    } finally {
      setLoading(false)
    }
  }

  const renderRec = (rec: CleanerRecommendation, isPrimary: boolean) => (
    <div
      key={rec.userId}
      className={`rounded-lg border p-3 ${
        isPrimary
          ? "border-teal-300 bg-teal-50"
          : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
              isPrimary ? "bg-teal-600 text-white" : "bg-gray-200 text-gray-700"
            }`}
          >
            <User className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{rec.name}</p>
            <p className="text-xs text-gray-600 mt-0.5">{rec.reason}</p>
            <p className="text-xs text-teal-700 mt-1 font-medium">Score: {rec.score}</p>
          </div>
        </div>
        {onAssign && (
          <button
            onClick={() => onAssign(rec.userId)}
            className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700"
          >
            Assign
          </button>
        )}
      </div>
    </div>
  )

  if (!loaded && !loading) {
    return (
      <div className={`${compact ? "" : "bg-gradient-to-br from-teal-50 to-indigo-50 rounded-xl border border-teal-200 p-4"}`}>
        <button
          onClick={loadRecommendations}
          className="flex items-center gap-2 w-full px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition text-sm font-medium"
        >
          <Sparkles className="w-4 h-4" />
          TidyFlow AI — Recommend Cleaners
        </button>
      </div>
    )
  }

  return (
    <div className={`${compact ? "space-y-2" : "bg-gradient-to-br from-teal-50 to-indigo-50 rounded-xl border border-teal-200 p-4 space-y-3"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-teal-600" />
          <span className="font-semibold text-gray-900 text-sm">
            TidyFlow AI Recommendations
          </span>
          {aiGenerated && (
            <span className="text-xs bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full">
              Groq
            </span>
          )}
        </div>
        <button
          onClick={loadRecommendations}
          disabled={loading}
          className="text-xs text-teal-600 hover:text-teal-800"
        >
          Refresh
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-600 py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Analyzing cleaners...
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && recommended && (
        <>
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
            Recommended
          </p>
          {renderRec(recommended, true)}
        </>
      )}

      {!loading && alternatives.length > 0 && (
        <>
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium flex items-center gap-1">
            Alternatives <ChevronRight className="w-3 h-3" />
          </p>
          <div className="space-y-2">
            {alternatives.map((alt) => renderRec(alt, false))}
          </div>
        </>
      )}

      {!loading && loaded && !recommended && !error && (
        <p className="text-sm text-gray-500">No suitable cleaners found for this task.</p>
      )}

      <p className="text-xs text-gray-400 italic">
        AI recommends — you decide. Assignments are never forced.
      </p>
    </div>
  )
}
