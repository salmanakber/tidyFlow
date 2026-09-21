/**
 * Web consumers of existing /api/ai/* routes.
 * All AI calls go through server routes that use getAIConfig + aiChat (Groq/Google).
 * Do not change backend response shapes used by mobile.
 */
import { adminGet, adminPost } from "@/lib/admin-session"

export type CleanerRecommendation = {
  userId: number
  name: string
  score: number
  reason: string
  distance?: number
  qualityScore?: number
  tasksCompleted?: number
}

export type AssignmentRecommendations = {
  recommended: CleanerRecommendation | null
  alternatives: CleanerRecommendation[]
  aiGenerated: boolean
}

export type TaskSuggestions = {
  propertySummary: string
  estimatedMinutes: number | null
  checklist: string[]
  supplies: Array<{
    supplyItemId: number
    name: string
    unit: string
    currentStock: number
    quantity: string
    suggestedQuantity: number
    reason: string
  }>
  cleaners: AssignmentRecommendations
  cleaningScore: number | null
  photoCount: number
  aiGenerated: boolean
}

export type AiOpsCommand = {
  id: string
  label: string
  hrefKey: string
  query?: string
  detail?: string
}

export type BillPriorityRow = {
  key: string
  priority: number
  reason: string
}

export async function getCleanerRecommendations(opts: {
  taskId?: number
  propertyId?: number
  scheduledDate?: string
  locale?: string
}): Promise<AssignmentRecommendations | null> {
  try {
    const res = await adminPost("/api/ai/recommend-cleaners", {
      ...(opts.taskId ? { taskId: opts.taskId } : {}),
      ...(opts.propertyId ? { propertyId: opts.propertyId } : {}),
      ...(opts.scheduledDate ? { scheduledDate: opts.scheduledDate } : {}),
      locale: opts.locale || (typeof navigator !== "undefined" ? navigator.language : "en"),
    })
    if (res.data?.success) return res.data.data as AssignmentRecommendations
    return null
  } catch (e: any) {
    if (e?.response?.status === 403) throw e
    return null
  }
}

export async function getTaskSuggestions(opts: {
  taskId?: number
  propertyId?: number
  title?: string
  description?: string
  scheduledDate?: string
  locale?: string
}): Promise<TaskSuggestions | null> {
  try {
    const res = await adminPost("/api/ai/task-suggestions", {
      ...(opts.taskId ? { taskId: opts.taskId } : {}),
      ...(opts.propertyId ? { propertyId: opts.propertyId } : {}),
      ...(opts.title ? { title: opts.title } : {}),
      ...(opts.description ? { description: opts.description } : {}),
      ...(opts.scheduledDate ? { scheduledDate: opts.scheduledDate } : {}),
      locale: opts.locale || (typeof navigator !== "undefined" ? navigator.language : "en"),
    })
    if (res.data?.success) return res.data.data as TaskSuggestions
    return null
  } catch (e: any) {
    if (e?.response?.status === 403) throw e
    return null
  }
}

/** NL → deep links via company AI config; empty if AI off (client falls back to rules). */
export async function getAiOpsCommands(query: string): Promise<{
  commands: AiOpsCommand[]
  aiGenerated: boolean
}> {
  try {
    const res = await adminPost("/api/ai/ops-command", {
      query,
      locale: typeof navigator !== "undefined" ? navigator.language : "en",
    })
    if (res.data?.success) {
      return {
        commands: Array.isArray(res.data.data?.commands) ? res.data.data.commands : [],
        aiGenerated: !!res.data.data?.aiGenerated,
      }
    }
    return { commands: [], aiGenerated: false }
  } catch {
    return { commands: [], aiGenerated: false }
  }
}

export async function getAiBillPriority(
  groups: Array<{ key: string; label: string; taskCount: number; estimatedTotal: number }>
): Promise<{ ranked: BillPriorityRow[]; aiGenerated: boolean }> {
  try {
    const res = await adminPost("/api/ai/bill-priority", {
      groups,
      locale: typeof navigator !== "undefined" ? navigator.language : "en",
    })
    if (res.data?.success) {
      return {
        ranked: Array.isArray(res.data.data?.ranked) ? res.data.data.ranked : [],
        aiGenerated: !!res.data.data?.aiGenerated,
      }
    }
    return { ranked: [], aiGenerated: false }
  } catch {
    return { ranked: [], aiGenerated: false }
  }
}

export async function getAiDashboardSummary(): Promise<any | null> {
  try {
    const res = await adminGet("/api/ai/dashboard")
    if (res.data?.success) return res.data.data
    return null
  } catch {
    return null
  }
}

export type AiLiveAlert = {
  id: string
  severity: "critical" | "high" | "medium"
  title: string
  detail: string
  action: string
}

export async function getAiLiveAlerts(snapshot: {
  coveragePct: number
  offSite: number
  stale: number
  noGps: number
  sosCount: number
  exceptions: Array<{ kind: string; title: string; detail: string }>
}): Promise<{ alerts: AiLiveAlert[]; aiGenerated: boolean }> {
  try {
    const res = await adminPost("/api/ai/live-alerts", {
      ...snapshot,
      locale: typeof navigator !== "undefined" ? navigator.language : "en",
    })
    if (res.data?.success) {
      return {
        alerts: Array.isArray(res.data.data?.alerts) ? res.data.data.alerts : [],
        aiGenerated: !!res.data.data?.aiGenerated,
      }
    }
    return { alerts: [], aiGenerated: false }
  } catch {
    return { alerts: [], aiGenerated: false }
  }
}

export type RevenueAnalysisReport = {
  title: string
  periodLabel: string
  executiveSummary: string
  profitHealth: {
    rating: "strong" | "stable" | "weak" | "critical"
    score: number
    explanation: string
  }
  highlights: string[]
  risks: string[]
  marginInsights: Array<{ label: string; insight: string }>
  cashInsights: string[]
  costInsights: string[]
  recommendations: Array<{ priority: "high" | "medium" | "low"; action: string; why: string }>
  closingNote: string
  aiGenerated: boolean
}

/** P&L narrative via company AI config (same contract as mobile). */
export async function analyzeRevenueReport(input: {
  from: string
  to: string
  focus?: "overall" | "margin" | "cash" | "costs"
  propertyId?: number | null
  report: {
    summary: Record<string, unknown>
    marginByProperty?: Array<Record<string, unknown>>
    marginByClient?: Array<Record<string, unknown>>
    expensesByCategory?: Array<{ category: string; amount: number }>
    unpaidInvoices?: Array<Record<string, unknown>>
  }
  locale?: string
}): Promise<RevenueAnalysisReport> {
  const res = await adminPost("/api/ai/revenue-analysis", {
    from: input.from,
    to: input.to,
    focus: input.focus || "overall",
    ...(input.propertyId != null ? { propertyId: input.propertyId } : {}),
    report: input.report,
    locale: input.locale || (typeof navigator !== "undefined" ? navigator.language : "en"),
  })
  if (!res.data?.success || !res.data?.data) {
    throw new Error(res.data?.message || "Revenue analysis failed")
  }
  return res.data.data as RevenueAnalysisReport
}
