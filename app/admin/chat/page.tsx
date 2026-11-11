"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import {
  OpsPageHeader,
  OpsFlash,
  OpsEmpty,
  OpsRefreshButton,
} from "@/components/ops/OpsChrome"
import AssigneeAvatarStack, {
  type AssigneeBubble,
} from "@/components/ops/AssigneeAvatarStack"
import { useOpsRealtime, useInterval } from "@/hooks/useOpsRealtime"
import {
  MessageCircle,
  Send,
  ArrowLeft,
  Loader2,
  Wifi,
  WifiOff,
  MapPin,
  UserX,
} from "lucide-react"

type InboxTask = {
  taskId: number
  title: string
  status?: string | null
  scheduledDate?: string | null
  address?: string | null
  unreadCount?: number
  assignees?: AssigneeBubble[]
  hasAssignees?: boolean
  chatEnabled?: boolean
}

type ChatMessage = {
  id: number
  message: string
  senderId: number
  sender?: { id?: number; firstName?: string | null; lastName?: string | null; role?: string | null }
  createdAt: string
  kind?: "user" | "system" | "voice"
  answeredBy?: { id: number; name: string } | null
  isMe?: boolean
  voice?: { url: string; durationSec?: number } | null
  pending?: boolean
}

function authHeaders() {
  const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
  return { Authorization: `Bearer ${token}` }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "?"
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("")
}

function senderName(msg: ChatMessage) {
  if (msg.isMe) return "You"
  const s = msg.sender
  if (!s) return "Team"
  return [s.firstName, s.lastName].filter(Boolean).join(" ").trim() || "Team"
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  } catch {
    return ""
  }
}

function statusTone(status?: string | null) {
  const s = String(status || "").toLowerCase()
  if (s.includes("complete") || s === "done") return "bg-emerald-100 text-emerald-800"
  if (s.includes("progress") || s.includes("started")) return "bg-sky-100 text-sky-800"
  if (s.includes("cancel")) return "bg-rose-100 text-rose-800"
  return "bg-slate-100 text-slate-600"
}

function isChatEnabled(task: InboxTask) {
  if (typeof task.chatEnabled === "boolean") return task.chatEnabled
  return (task.assignees?.length || 0) > 0
}

export default function ChatPage() {
  return (
    <AdminLayout>
      <Content />
    </AdminLayout>
  )
}

function Content() {
  const [inbox, setInbox] = useState<InboxTask[]>([])
  const [totalUnread, setTotalUnread] = useState(0)
  const [loadingInbox, setLoadingInbox] = useState(true)
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null)
  const [threadTitle, setThreadTitle] = useState("")
  const [activeAssignees, setActiveAssignees] = useState<AssigneeBubble[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const deepLinkHandled = useRef(false)

  const loadInbox = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoadingInbox(true)
      const res = await axios.get("/api/chat/inbox", { headers: authHeaders() })
      if (res.data?.success) {
        setInbox(Array.isArray(res.data.data?.tasks) ? res.data.data.tasks : [])
        setTotalUnread(Number(res.data.data?.totalUnread || 0))
      }
    } catch (e: any) {
      if (!silent) setError(e.response?.data?.message || "Failed to load chat inbox")
    } finally {
      if (!silent) setLoadingInbox(false)
    }
  }, [])

  const loadThread = useCallback(async (taskId: number, silent = false) => {
    try {
      if (!silent) setLoadingThread(true)
      const res = await axios.get("/api/chat", {
        headers: authHeaders(),
        params: { taskId },
      })
      if (res.data?.success) {
        const list = Array.isArray(res.data.data?.messages)
          ? res.data.data.messages
          : Array.isArray(res.data.data)
            ? res.data.data
            : []
        setMessages(list)
      }
    } catch (e: any) {
      if (!silent) setError(e.response?.data?.message || "Failed to load conversation")
    } finally {
      if (!silent) setLoadingThread(false)
    }
  }, [])

  useEffect(() => {
    loadInbox()
  }, [loadInbox])

  // Deep-link from notifications: ?taskId=
  useEffect(() => {
    if (deepLinkHandled.current || loadingInbox || !inbox.length) return
    if (typeof window === "undefined") return
    const id = Number(new URLSearchParams(window.location.search).get("taskId") || 0)
    if (!id) return
    const task = inbox.find((t) => t.taskId === id)
    if (task && isChatEnabled(task)) {
      deepLinkHandled.current = true
      setActiveTaskId(task.taskId)
      setThreadTitle(task.title || `Task #${task.taskId}`)
      setActiveAssignees(task.assignees || [])
    } else if (task && !isChatEnabled(task)) {
      deepLinkHandled.current = true
      setError("This job has no assigned cleaners — assign someone before chatting.")
    }
  }, [inbox, loadingInbox])

  useEffect(() => {
    if (activeTaskId) loadThread(activeTaskId)
  }, [activeTaskId, loadThread])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, activeTaskId])

  const { status: socketStatus } = useOpsRealtime((eventName, payload) => {
    if (eventName === "chat:message" || eventName === "notification:new") {
      const taskId = Number(payload?.taskId)
      if (activeTaskId && (!taskId || taskId === activeTaskId)) {
        loadThread(activeTaskId, true)
      }
      loadInbox(true)
    }
  })

  useInterval(
    () => {
      loadInbox(true)
      if (activeTaskId) loadThread(activeTaskId, true)
    },
    15000,
    socketStatus !== "live"
  )

  const filteredInbox = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return inbox
    return inbox.filter(
      (t) =>
        t.title?.toLowerCase().includes(q) ||
        t.address?.toLowerCase().includes(q) ||
        String(t.taskId).includes(q) ||
        (t.assignees || []).some((a) => a.name?.toLowerCase().includes(q))
    )
  }, [inbox, search])

  const openThread = (task: InboxTask) => {
    if (!isChatEnabled(task)) {
      setError("Assign a cleaner to this job before opening chat.")
      return
    }
    setActiveTaskId(task.taskId)
    setThreadTitle(task.title || `Task #${task.taskId}`)
    setActiveAssignees(task.assignees || [])
    setDraft("")
    setError("")
  }

  const sendMessage = async () => {
    const text = draft.trim()
    if (!text || !activeTaskId || sending) return
    const optimistic: ChatMessage = {
      id: -Date.now(),
      message: text,
      senderId: 0,
      createdAt: new Date().toISOString(),
      kind: "user",
      isMe: true,
      pending: true,
    }
    setMessages((prev) => [...prev, optimistic])
    setDraft("")
    setSending(true)
    try {
      const res = await axios.post(
        "/api/chat",
        { taskId: activeTaskId, message: text },
        { headers: authHeaders() }
      )
      if (res.data?.success) {
        const list = Array.isArray(res.data.data?.messages) ? res.data.data.messages : null
        if (list) setMessages(list)
        else await loadThread(activeTaskId, true)
        await loadInbox(true)
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
        setDraft(text)
        setError(res.data?.message || "Message not sent")
      }
    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      setDraft(text)
      setError(e.response?.data?.message || "Message not sent")
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex h-[calc(100vh-7.5rem)] min-h-[560px] flex-col gap-4">
      <OpsPageHeader
        eyebrow="Team communication"
        title="Task chat"
        subtitle="Job threads with assigned cleaners — live over websocket with mobile push"
        actions={
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold ${
                socketStatus === "live"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {socketStatus === "live" ? <Wifi size={11} /> : <WifiOff size={11} />}
              {socketStatus === "live" ? "LIVE" : "POLLING"}
            </span>
            <OpsRefreshButton
              onClick={() => {
                loadInbox()
                if (activeTaskId) loadThread(activeTaskId)
              }}
              loading={loadingInbox || loadingThread}
            />
          </div>
        }
      />

      {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

      <div className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-control-border bg-white shadow-sm dark:border-amber-900/40 dark:bg-control-darkCard lg:grid-cols-[340px_1fr]">
        <aside
          className={`flex min-h-0 flex-col border-control-border dark:border-navy-800 ${
            activeTaskId ? "hidden lg:flex lg:border-r" : "flex border-r-0 lg:border-r"
          }`}
        >
          <div className="border-b border-slate-100 px-4 py-3 dark:border-navy-800">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Inbox
              </p>
              {totalUnread > 0 && (
                <span className="rounded-full bg-rose-600 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                  {totalUnread}
                </span>
              )}
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search jobs or people…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-amber-500/30 placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 dark:border-navy-800 dark:bg-navy-950"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingInbox ? (
              <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading threads…</span>
              </div>
            ) : filteredInbox.length === 0 ? (
              <div className="px-4 py-10">
                <OpsEmpty message="No active job threads yet — chats appear when tasks are assigned" />
              </div>
            ) : (
              <ul>
                {filteredInbox.map((task) => {
                  const active = activeTaskId === task.taskId
                  const enabled = isChatEnabled(task)
                  const assignees = task.assignees || []
                  return (
                    <li key={task.taskId}>
                      <button
                        type="button"
                        disabled={!enabled}
                        onClick={() => openThread(task)}
                        className={`flex w-full gap-3 border-b border-slate-50 px-4 py-3.5 text-left transition-colors dark:border-navy-900 ${
                          !enabled
                            ? "cursor-not-allowed opacity-55"
                            : active
                              ? "bg-amber-50/80 dark:bg-amber-950/20"
                              : "hover:bg-slate-50 dark:hover:bg-navy-950/50"
                        }`}
                      >
                        <AssigneeAvatarStack assignees={assignees} size="md" max={3} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-bold text-navy-900 dark:text-white">
                              {task.title || `Task #${task.taskId}`}
                            </p>
                            {enabled && (task.unreadCount || 0) > 0 && (
                              <span className="shrink-0 rounded-full bg-rose-600 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                                {task.unreadCount}
                              </span>
                            )}
                          </div>
                          {!enabled ? (
                            <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                              <UserX size={11} /> Unassigned — chat disabled
                            </p>
                          ) : (
                            <p className="mt-0.5 truncate text-[11px] text-slate-500">
                              {assignees.map((a) => a.name).join(", ")}
                            </p>
                          )}
                          {task.address ? (
                            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-400">
                              <MapPin size={11} className="shrink-0" />
                              {task.address}
                            </p>
                          ) : null}
                          <div className="mt-1.5 flex items-center gap-2">
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusTone(
                                task.status
                              )}`}
                            >
                              {task.status || "open"}
                            </span>
                          </div>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>

        <section
          className={`relative flex min-h-0 flex-col ${
            activeTaskId ? "flex" : "hidden lg:flex"
          }`}
        >
          {!activeTaskId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-900 text-amber-300 shadow-lg">
                <MessageCircle size={28} />
              </div>
              <h2 className="text-lg font-extrabold text-navy-900 dark:text-white">
                Select an assigned job
              </h2>
              <p className="max-w-sm text-sm text-slate-500">
                Only jobs with cleaners assigned can be opened. Unassigned threads stay visible but
                disabled.
              </p>
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-navy-800">
                <button
                  type="button"
                  onClick={() => setActiveTaskId(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 lg:hidden dark:border-navy-800"
                  aria-label="Back to inbox"
                >
                  <ArrowLeft size={16} />
                </button>
                <AssigneeAvatarStack assignees={activeAssignees} size="lg" max={4} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-navy-900 dark:text-white">
                    {threadTitle}
                  </p>
                  <p className="truncate text-[11px] text-slate-500">
                    {activeAssignees.length
                      ? activeAssignees.map((a) => a.name).join(" · ")
                      : "No assignees"}
                    <span className="font-mono text-slate-400"> · TASK #{activeTaskId}</span>
                  </p>
                </div>
              </header>

              <div className="relative min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,#F8FAFC_0%,#FFFFFF_40%)] px-4 py-4 dark:bg-none dark:bg-navy-950/30">
                {loadingThread ? (
                  <div className="flex items-center justify-center gap-2 py-20 text-slate-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">Loading messages…</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <p className="text-sm font-semibold text-slate-500">No messages yet</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Say hello — the team gets a push on mobile and a live update here.
                    </p>
                  </div>
                ) : (
                  <div className="mx-auto flex max-w-3xl flex-col gap-3">
                    {messages.map((msg) => {
                      const mine = !!msg.isMe
                      const name = senderName(msg)
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${mine ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`flex max-w-[85%] gap-2 ${mine ? "flex-row-reverse" : "flex-row"}`}
                          >
                            {!mine && (
                              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[10px] font-bold text-amber-300">
                                {initials(name)}
                              </div>
                            )}
                            <div>
                              {!mine && (
                                <p className="mb-1 px-1 text-[11px] font-semibold text-slate-500">
                                  {name}
                                </p>
                              )}
                              {msg.answeredBy?.name ? (
                                <p className="mb-1 rounded-lg bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                                  Answered by {msg.answeredBy.name}
                                </p>
                              ) : null}
                              <div
                                className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                                  mine
                                    ? "rounded-br-md bg-navy-900 text-white"
                                    : "rounded-bl-md border border-slate-200 bg-white text-navy-900 dark:border-navy-800 dark:bg-navy-900 dark:text-slate-100"
                                } ${msg.pending ? "opacity-60" : ""}`}
                              >
                                {msg.kind === "voice" && msg.voice?.url ? (
                                  <audio controls src={msg.voice.url} className="max-w-full" />
                                ) : (
                                  <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                                )}
                              </div>
                              <p
                                className={`mt-1 px-1 font-mono text-[10px] text-slate-400 ${
                                  mine ? "text-right" : "text-left"
                                }`}
                              >
                                {formatTime(msg.createdAt)}
                                {msg.pending ? " · sending" : ""}
                              </p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={bottomRef} />
                  </div>
                )}
              </div>

              <footer className="border-t border-slate-100 bg-white p-3 dark:border-navy-800 dark:bg-control-darkCard">
                <div className="mx-auto flex max-w-3xl items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onKeyDown}
                    rows={1}
                    placeholder="Write a message… (Enter to send)"
                    className="max-h-32 min-h-[44px] flex-1 resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none ring-amber-500/30 placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 dark:border-navy-800 dark:bg-navy-950"
                  />
                  <button
                    type="button"
                    onClick={sendMessage}
                    disabled={sending || !draft.trim()}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-600 text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-40"
                    aria-label="Send"
                  >
                    {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
