import crypto from "crypto"
import { automationQueue } from "@/lib/automation-queue"
import { getRedisConnectionOptions } from "@/lib/redis-connection"

function isRedisUnavailable(error: unknown) {
  const err = error as { code?: string; message?: string }
  return err?.code === "ECONNREFUSED" || err?.message?.includes("ECONNREFUSED")
}

export function newBookingTrackToken() {
  return crypto.randomBytes(24).toString("hex")
}

export type BookingEmailJob = {
  bookingRequestId: number
  kind: "confirmation" | "approved" | "reminder"
  hoursUntil?: number
}

export async function enqueueBookingEmail(job: BookingEmailJob, delayMs = 0) {
  const suffix =
    job.kind === "reminder" ? `reminder-${job.hoursUntil || 0}` : job.kind
  try {
    await automationQueue.add("booking-client-email", job, {
      jobId: `booking-email-${job.bookingRequestId}-${suffix}`.slice(0, 180),
      delay: Math.max(0, delayMs),
    })
    return true
  } catch (error) {
    if (isRedisUnavailable(error)) {
      console.warn("[Booking] Redis unavailable — email job skipped")
      return false
    }
    throw error
  }
}

/** Schedule 24h and 2h reminders before the appointment (if still in the future). */
export async function scheduleBookingReminders(
  bookingRequestId: number,
  requestedStart: Date
) {
  const start = requestedStart.getTime()
  const now = Date.now()
  if (start <= now) return { scheduled: 0 }

  const milestones = [24, 2] as const
  let scheduled = 0

  for (const hours of milestones) {
    const fireAt = start - hours * 60 * 60 * 1000
    const delay = fireAt - now
    if (delay < 60_000) continue // already past / too soon
    const ok = await enqueueBookingEmail(
      {
        bookingRequestId,
        kind: "reminder",
        hoursUntil: hours,
      },
      delay
    )
    if (ok) scheduled += 1
  }

  return { scheduled }
}

/** Hourly scan — catch bookings whose reminders weren't queued (e.g. Redis blip). */
export async function ensureBookingReminderScanScheduler() {
  try {
    await automationQueue.add(
      "scan-booking-reminders",
      {},
      {
        jobId: "scan-booking-reminders-hourly",
        repeat: { every: 60 * 60 * 1000 },
      }
    )
    return true
  } catch (error) {
    if (isRedisUnavailable(error)) {
      console.warn("[Booking] Redis unavailable — reminder scan not scheduled")
      return false
    }
    throw error
  }
}

/** Used by worker scan — reconnect options already shared. */
export function bookingRedisReady() {
  return getRedisConnectionOptions()
}
