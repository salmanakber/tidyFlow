/** Resolve notification metadata → company workspace path */

export type NotificationLike = {
  id?: number
  type?: string
  metadata?: string | Record<string, unknown> | null
  screenRoute?: string | null
  screenParams?: Record<string, unknown> | null
}

export function parseNotificationMeta(n: NotificationLike): Record<string, unknown> {
  let meta: Record<string, unknown> = {}
  if (n.metadata && typeof n.metadata === "object") {
    meta = { ...n.metadata }
  } else if (typeof n.metadata === "string" && n.metadata.trim()) {
    try {
      meta = JSON.parse(n.metadata)
    } catch {
      meta = {}
    }
  }
  if (n.screenRoute) meta.screenRoute = n.screenRoute
  if (n.screenParams) meta.screenParams = n.screenParams
  return meta
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Map mobile screenRoute / metadata to a company workspace href.
 * `baseHref` is like `/{slug}/jobs` builder: (page) => `/${slug}/${page}`
 */
export function resolveNotificationHref(
  n: NotificationLike,
  href: (page: string) => string
): string | null {
  const meta = parseNotificationMeta(n)
  const route = String(meta.screenRoute || "").trim()
  const params = (meta.screenParams as Record<string, unknown>) || {}
  const taskId = num(meta.taskId ?? params.taskId)
  const sosId = num(meta.sosAlertId ?? params.sosAlertId)
  const propertyId = num(meta.propertyId ?? params.propertyId)

  if (sosId || route === "MapView" || meta.geofenceExit) {
    if (taskId) return `${href("jobs")}?task=${taskId}&focus=gps`
    return `${href("safety")}?tab=sos`
  }

  switch (route) {
    case "TaskDetail":
    case "CreateTask":
      return taskId ? `${href("jobs")}?task=${taskId}` : href("jobs")
    case "TasksList":
      return href("jobs")
    case "PropertySelection":
      return propertyId ? `${href("properties")}?id=${propertyId}` : href("properties")
    case "Billing":
      return "/account/billing"
    case "Compliance":
      return href("compliance")
    case "ClientFeedback":
      return taskId ? `${href("jobs")}?task=${taskId}&tab=review` : href("jobs")
    default:
      break
  }

  if (taskId) return `${href("jobs")}?task=${taskId}`
  if (propertyId) return `${href("properties")}?id=${propertyId}`

  const type = String(n.type || "").toLowerCase()
  if (type.includes("sos") || type.includes("high_severity")) return `${href("safety")}?tab=sos`
  if (type.includes("geofence")) return href("monitor")
  if (type.includes("billing") || type.includes("subscription")) return "/account/billing"
  if (type.includes("announcement")) return href("announcements")

  return null
}
