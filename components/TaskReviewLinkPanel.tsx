"use client"

import { useEffect, useRef, useState } from "react"
import axios from "axios"
import { Link2, Copy, Share2, MessageSquare, Star, Users, Mail } from "lucide-react"

interface ReviewData {
  reviewLink: string | null
  submitted: boolean
  clientPhone?: string | null
  clientEmail?: string | null
  clientName?: string | null
  assignedCleaners: Array<{ id: number; name: string }>
  clientFeedback: Array<{ id: number; rating: number; createdAt: string }>
}

const REVIEW_ELIGIBLE = ["SUBMITTED", "QA_REVIEW", "APPROVED", "COMPLETED", "ARCHIVED"]

export default function TaskReviewLinkPanel({
  taskId,
  taskStatus,
}: {
  taskId: number
  taskStatus?: string
}) {
  const [data, setData] = useState<ReviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [googleUrl, setGoogleUrl] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const prefillsApplied = useRef(false)

  const getToken = () =>
    localStorage.getItem("authToken") || sessionStorage.getItem("authToken")

  const load = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`/api/reviews/request?taskId=${taskId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (res.data.success) {
        const info = res.data.data as ReviewData
        setData(info)
        if (!prefillsApplied.current) {
          if (info.clientPhone) setPhone(info.clientPhone)
          if (info.clientEmail) setEmail(info.clientEmail)
          prefillsApplied.current = true
        }
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    prefillsApplied.current = false
    if (taskId) load()
  }, [taskId])

  const canInvite =
    !!taskStatus && REVIEW_ELIGIBLE.includes(String(taskStatus).toUpperCase())
  const hasFeedback = (data?.clientFeedback?.length || 0) > 0

  const generate = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setGenerating(true)
    setMessage(null)
    try {
      const res = await axios.post(
        "/api/reviews/request",
        {
          taskId,
          clientPhone: phone.trim() || undefined,
          clientEmail: email.trim() || undefined,
          redirectUrl: googleUrl.trim() || undefined,
        },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      )
      if (res.data.success) {
        setMessage(
          res.data.data.reused
            ? "Existing link loaded — email/SMS resent when configured."
            : "Review link created — email/SMS sent when configured."
        )
        load()
      }
    } catch (err: any) {
      setMessage(err?.response?.data?.message || "Failed to generate link.")
    } finally {
      setGenerating(false)
    }
  }

  const link = data?.reviewLink

  const copyLink = async () => {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setMessage("Link copied to clipboard.")
  }

  const shareLink = async () => {
    if (!link) return
    if (navigator.share) {
      await navigator.share({
        title: "Rate your cleaning",
        text: "Please share your feedback about our cleaning service:",
        url: link,
      })
    } else {
      copyLink()
    }
  }

  if (loading) {
    return <div className="h-24 rounded-xl bg-teal-50/50 animate-pulse border border-teal-100" />
  }

  // Mirror mobile: keep panel invisible until actionable (parent should also gate)
  if (!canInvite && !hasFeedback) {
    return null
  }

  return (
    <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/50 space-y-3">
      <div>
        <div className="flex items-center gap-2">
          <Link2 size={16} className="text-teal-700" />
          <h3 className="text-sm font-semibold text-teal-900">Share Client Review Link</h3>
        </div>
        <p className="text-xs text-teal-700 mt-1">
          Send this link after the job. Feedback is assigned to the cleaner(s) on this task.
          4–5★ can go public; lower ratings stay private.
        </p>
      </div>

      {data?.clientName ? (
        <div className="flex items-start gap-2 text-xs text-teal-800 bg-white/70 rounded-lg px-3 py-2 border border-teal-100">
          <Users size={14} className="mt-0.5 shrink-0" />
          <span>
            Client: <strong>{data.clientName}</strong>
          </span>
        </div>
      ) : null}

      {data?.assignedCleaners && data.assignedCleaners.length > 0 ? (
        <div className="flex items-start gap-2 text-xs text-teal-800 bg-white/70 rounded-lg px-3 py-2 border border-teal-100">
          <Users size={14} className="mt-0.5 shrink-0" />
          <span>
            Reviews will be credited to:{" "}
            <strong>{data.assignedCleaners.map((c) => c.name).join(", ")}</strong>
          </span>
        </div>
      ) : (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Assign a cleaner first so client feedback counts toward their performance.
        </p>
      )}

      {hasFeedback && (
        <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <Star size={14} className="fill-amber-400 text-amber-400" />
          Client submitted {data!.clientFeedback[0].rating}/5 — assigned to cleaner(s).
        </div>
      )}

      {canInvite && (
        <form onSubmit={generate} className="space-y-2">
          <input
            type="url"
            value={googleUrl}
            onChange={(e) => setGoogleUrl(e.target.value)}
            placeholder="Google review URL (optional, for 4–5★ redirect)"
            className="w-full px-3 py-2 border border-teal-200 rounded-lg text-sm bg-white"
          />
          <div className="relative">
            <Mail
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-teal-500"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Client email (optional — sends email with link)"
              autoComplete="email"
              className="w-full pl-9 pr-3 py-2 border border-teal-200 rounded-lg text-sm bg-white"
            />
          </div>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Client phone (optional — sends SMS with link)"
            autoComplete="tel"
            className="w-full px-3 py-2 border border-teal-200 rounded-lg text-sm bg-white"
          />

          <button
            type="submit"
            disabled={generating}
            className="w-full py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
          >
            {generating
              ? "Working..."
              : link
                ? "Refresh / Resend"
                : "Generate Review Link"}
          </button>
        </form>
      )}

      {link && (
        <div className="space-y-2">
          <div className="text-xs bg-white border border-teal-200 rounded-lg p-2 break-all">
            <span className="font-medium text-teal-800">Link: </span>
            <a href={link} target="_blank" rel="noreferrer" className="text-teal-600 underline">
              {link}
            </a>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-semibold rounded-lg border border-teal-200 bg-white text-teal-800 hover:bg-teal-50"
            >
              <Copy size={14} /> Copy
            </button>
            <button
              type="button"
              onClick={shareLink}
              className="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-semibold rounded-lg border border-teal-200 bg-white text-teal-800 hover:bg-teal-50"
            >
              <Share2 size={14} /> Share
            </button>
            {(phone || email) && canInvite && (
              <button
                type="button"
                onClick={() => generate()}
                className="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-semibold rounded-lg bg-teal-600 text-white"
              >
                <MessageSquare size={14} /> Resend
              </button>
            )}
          </div>
        </div>
      )}

      {message && <p className="text-xs text-teal-700">{message}</p>}
    </div>
  )
}
