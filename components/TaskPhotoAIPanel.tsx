"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import { Camera, Sparkles, AlertTriangle, CheckCircle, XCircle } from "lucide-react"

interface PhotoScore {
  id: number
  photoId: number
  score: number
  summary?: string
  reviewStatus?: string
  photo?: { id: number; url: string; photoType: string; caption?: string }
}

export default function TaskPhotoAIPanel({ taskId }: { taskId: number }) {
  const [scores, setScores] = useState<PhotoScore[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewingId, setReviewingId] = useState<number | null>(null)

  const getToken = () =>
    localStorage.getItem("authToken") || sessionStorage.getItem("authToken")

  const load = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`/api/ai/photo-scores?taskId=${taskId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (res.data.success) setScores(res.data.data || [])
    } catch {
      setScores([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!taskId) return
    load()
  }, [taskId])

  const review = async (id: number, reviewStatus: "approved" | "rejected") => {
    setReviewingId(id)
    try {
      await axios.patch(
        `/api/ai/photo-scores/${id}`,
        { reviewStatus },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      )
      load()
    } finally {
      setReviewingId(null)
    }
  }

  if (loading) {
    return (
      <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 animate-pulse h-24" />
    )
  }

  if (scores.length === 0) {
    return (
      <div className="p-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Camera size={16} />
          <span>No photos scored yet. Upload before/after photos — AI scores them automatically.</span>
        </div>
      </div>
    )
  }

  const avg = Math.round(scores.reduce((a, s) => a + s.score, 0) / scores.length)
  const flagged = scores.filter((s) => s.score < 60)
  const pending = scores.filter((s) => !s.reviewStatus || s.reviewStatus === "pending")

  return (
    <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/30 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-teal-600" />
            <h3 className="text-sm font-semibold text-teal-900">AI Photo QA Review</h3>
          </div>
          <p className="text-xs text-teal-700 mt-1">
            Avg score <strong>{avg}/100</strong> · {scores.length} photo(s)
            {pending.length > 0 && (
              <span className="text-teal-800"> · {pending.length} awaiting review</span>
            )}
          </p>
        </div>
        <div
          className={`px-3 py-1 rounded-lg text-sm font-bold ${
            avg >= 70 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
          }`}
        >
          {avg}
        </div>
      </div>

      {pending.length > 0 && (
        <p className="text-xs text-teal-800 bg-white/70 border border-teal-100 rounded-lg px-3 py-2">
          Review each photo below — approve quality evidence or reject for re-upload.
        </p>
      )}

      {flagged.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle size={14} />
          {flagged.length} photo(s) scored below quality threshold.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
        {scores.map((item) => (
          <div
            key={item.id}
            className="bg-white rounded-lg border border-gray-200 overflow-hidden"
          >
            {item.photo?.url && (
              <img src={item.photo.url} alt="" className="w-full h-28 object-cover" />
            )}
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase text-gray-500">
                  {item.photo?.photoType || "photo"}
                </span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded ${
                    item.score < 60
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {item.score}/100
                </span>
              </div>
              {item.summary && (
                <p className="text-[11px] text-gray-600 line-clamp-2">{item.summary}</p>
              )}

              {item.reviewStatus === "approved" && (
                <div className="flex items-center gap-1 text-xs text-emerald-700 font-semibold">
                  <CheckCircle size={14} /> Approved
                </div>
              )}
              {item.reviewStatus === "rejected" && (
                <div className="flex items-center gap-1 text-xs text-red-700 font-semibold">
                  <XCircle size={14} /> Rejected
                </div>
              )}

              {(!item.reviewStatus || item.reviewStatus === "pending") && (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={reviewingId === item.id}
                    onClick={() => review(item.id, "approved")}
                    className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={reviewingId === item.id}
                    onClick={() => review(item.id, "rejected")}
                    className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
