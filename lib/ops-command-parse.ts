/**
 * Lightweight natural-language → deep-link parser for ⌘K.
 * No LLM — deterministic patterns for common manager intents.
 */

export type ParsedCommand = {
  id: string
  label: string
  href: string
  detail?: string
  confidence: "high" | "medium"
}

type WsHref = (page: string) => string

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function tomorrowISO() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function weekdayHint(q: string): string | null {
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ]
  for (let i = 0; i < days.length; i++) {
    if (q.includes(days[i]) || q.includes(days[i].slice(0, 3))) {
      const now = new Date()
      const delta = (i - now.getDay() + 7) % 7 || 7
      const d = new Date(now)
      d.setDate(now.getDate() + delta)
      return d.toISOString().slice(0, 10)
    }
  }
  return null
}

/**
 * Parse free text into actionable workspace links.
 * `wsHref` maps page keys (jobs, invoices, rota, …) to company-scoped paths.
 */
export function parseOpsCommand(raw: string, wsHref: WsHref): ParsedCommand[] {
  const q = raw.trim().toLowerCase().replace(/\s+/g, " ")
  if (!q || q.length < 2) return []

  const out: ParsedCommand[] = []
  const push = (c: ParsedCommand) => {
    if (!out.some((x) => x.id === c.id)) out.push(c)
  }

  const day =
    q.includes("tomorrow")
      ? tomorrowISO()
      : q.includes("today")
        ? todayISO()
        : weekdayHint(q)

  if (
    /\b(unassigned|not assigned|no cleaner|needs assign|without cleaner)\b/.test(q) ||
    /\bwho.*(free|available)\b/.test(q)
  ) {
    const date = day || todayISO()
    push({
      id: "nl-unassigned",
      label: day ? `Unassigned jobs · ${day}` : "Unassigned jobs",
      href: `${wsHref("jobs")}?status=unassigned${day ? `&date=${day}` : ""}`,
      detail: "Jobs still needing a cleaner",
      confidence: "high",
    })
  }

  if (/\b(smart assign|ai assign|recommend|auto.?assign|best fit)\b/.test(q)) {
    push({
      id: "nl-smart",
      label: "Smart assign first unassigned",
      href: `${wsHref("jobs")}?smart=1`,
      detail: "Open job drawer with AI recommendations",
      confidence: "high",
    })
  }

  if (/\b(invoice|bill|billing|charge client)\b/.test(q)) {
    push({
      id: "nl-invoices",
      label: q.includes("create") || q.includes("draft") || q.includes("new")
        ? "Create client invoice"
        : "Client invoices",
      href:
        q.includes("create") || q.includes("draft") || q.includes("new") || q.includes("bill")
          ? `${wsHref("invoices")}?create=1`
          : wsHref("invoices"),
      detail: "Bill completed / approved jobs",
      confidence: "high",
    })
  }

  if (/\b(unpaid|outstanding|overdue invoice)\b/.test(q)) {
    push({
      id: "nl-unpaid",
      label: "Unpaid invoices",
      href: `${wsHref("invoices")}?status=unpaid`,
      detail: "Collections queue",
      confidence: "high",
    })
  }

  if (/\b(rota|schedule|shift|week fill|smart fill|clone week)\b/.test(q)) {
    push({
      id: "nl-rota",
      label: /\b(fill|smart)\b/.test(q) ? "Rota · smart fill" : "Rota & schedule",
      href: /\b(fill|smart)\b/.test(q) ? `${wsHref("rota")}?smart=1` : wsHref("rota"),
      detail: "Week matrix & AI fill",
      confidence: "high",
    })
  }

  if (/\b(sos|emergency|panic)\b/.test(q)) {
    push({
      id: "nl-sos",
      label: "Open SOS alerts",
      href: `${wsHref("safety")}?tab=sos`,
      confidence: "high",
    })
  }

  if (/\b(off.?site|geofence|gps|live map|live monitor|where.*(cleaner|team))\b/.test(q)) {
    push({
      id: "nl-live",
      label: "Live map / GPS",
      href: wsHref("monitor"),
      detail: "Track cleaners on site",
      confidence: "high",
    })
  }

  if (/\b(payroll|pay run|wages)\b/.test(q)) {
    push({
      id: "nl-payroll",
      label: "Payroll",
      href: wsHref("payroll"),
      confidence: "high",
    })
  }

  if (/\b(expense|receipt)\b/.test(q)) {
    push({
      id: "nl-expenses",
      label: "Expenses",
      href: wsHref("expenses"),
      confidence: "medium",
    })
  }

  if (/\b(calendar|this week|month view)\b/.test(q)) {
    push({
      id: "nl-calendar",
      label: "Calendar",
      href: wsHref("calendar"),
      confidence: "medium",
    })
  }

  if (/\b(create|new|add)\b.*\b(job|task|clean)\b/.test(q) || /\b(job|task)\b.*\b(create|new|add)\b/.test(q)) {
    push({
      id: "nl-create-job",
      label: "Create job",
      href: `${wsHref("jobs")}?create=1`,
      confidence: "high",
    })
  }

  // Job id shortcut: #123 or job 123
  const jobMatch = q.match(/(?:#|job\s*|task\s*)(\d{1,8})\b/)
  if (jobMatch) {
    push({
      id: `nl-job-${jobMatch[1]}`,
      label: `Open job #${jobMatch[1]}`,
      href: `${wsHref("jobs")}?task=${jobMatch[1]}`,
      confidence: "high",
    })
  }

  // Free-text property / client search → jobs with q=
  if (out.length === 0 && q.length >= 3 && !/^(go|open|show|find|search)\s*$/.test(q)) {
    const cleaned = q.replace(/^(find|show|search|go to|open)\s+/, "").trim()
    if (cleaned.length >= 2) {
      push({
        id: "nl-search-jobs",
        label: `Search jobs · “${cleaned.slice(0, 40)}”`,
        href: `${wsHref("jobs")}?q=${encodeURIComponent(cleaned)}`,
        detail: "Title, property, or client",
        confidence: "medium",
      })
      push({
        id: "nl-search-invoices",
        label: `Search invoices · “${cleaned.slice(0, 40)}”`,
        href: `${wsHref("invoices")}?q=${encodeURIComponent(cleaned)}`,
        confidence: "medium",
      })
    }
  }

  if (day && /\b(job|clean|visit|booking)\b/.test(q) && !out.some((x) => x.id === "nl-unassigned")) {
    push({
      id: "nl-day-jobs",
      label: `Jobs on ${day}`,
      href: `${wsHref("jobs")}?date=${day}`,
      confidence: "medium",
    })
  }

  return out.slice(0, 6)
}
