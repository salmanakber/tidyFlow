/**
 * Web consumer of existing AI assign APIs.
 * Mirrors mobile aiService shapes — do not change backend contracts.
 */
import { adminPost } from "@/lib/admin-session"

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
  } catch {
    return null
  }
}
