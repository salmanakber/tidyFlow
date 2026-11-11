"use client"

/**
 * Header chat shortcut with live unread bubble (company workspace).
 */
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import axios from "axios"
import { MessageCircle } from "lucide-react"
import { useCompanyWorkspace } from "@/contexts/CompanyWorkspaceContext"
import { useOpsRealtime, useInterval } from "@/hooks/useOpsRealtime"

function authHeaders() {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function HeaderChatBadge() {
  const { href } = useCompanyWorkspace()
  const [unread, setUnread] = useState(0)

  const load = useCallback(async () => {
    try {
      const res = await axios.get("/api/chat/inbox", { headers: authHeaders() })
      if (res.data?.success) {
        setUnread(Number(res.data.data?.totalUnread || 0))
      }
    } catch {
      /* keep prior */
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const { status } = useOpsRealtime((eventName) => {
    if (eventName === "chat:message" || eventName === "notification:new") {
      void load()
    }
  })

  useInterval(() => {
    void load()
  }, status === "live" ? 60000 : 20000, true)

  return (
    <Link
      href={href("chat")}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 dark:border-navy-800 dark:bg-navy-950 dark:text-slate-300 dark:hover:border-amber-700/50"
      aria-label={unread ? `${unread} unread chat messages` : "Task chat"}
      title="Task chat"
    >
      <MessageCircle size={16} />
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 font-mono text-[9px] font-bold text-white shadow-sm">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  )
}
