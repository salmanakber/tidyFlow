import prisma from "@/lib/prisma"
import { sendBookingClientEmail } from "@/lib/booking-emails"
import {
  enqueueBookingEmail,
  scheduleBookingReminders,
  type BookingEmailJob,
} from "@/lib/booking-jobs"

async function loadBookingForEmail(bookingRequestId: number) {
  return prisma.bookingRequest.findUnique({
    where: { id: bookingRequestId },
    include: {
      company: { select: { name: true } },
      widgetConfig: {
        select: {
          logoUrl: true,
          primaryColor: true,
          accentColor: true,
          headline: true,
        },
      },
    },
  })
}

export async function handleBookingClientEmail(job: BookingEmailJob) {
  const booking = await loadBookingForEmail(job.bookingRequestId)
  if (!booking?.guestEmail || !booking.trackToken) {
    return { skipped: true, reason: "no email or track token" }
  }

  // Don't remind cancelled/rejected
  if (
    job.kind === "reminder" &&
    ["cancelled", "rejected"].includes(booking.status)
  ) {
    return { skipped: true, reason: "inactive booking" }
  }

  // Reminder only if still upcoming
  if (job.kind === "reminder") {
    const start = new Date(booking.requestedStart).getTime()
    if (start <= Date.now()) {
      return { skipped: true, reason: "appointment passed" }
    }
  }

  const sent = await sendBookingClientEmail({
    to: booking.guestEmail,
    guestName: booking.guestName,
    companyName: booking.company.name,
    companyLogoUrl: booking.widgetConfig?.logoUrl,
    serviceType: booking.serviceType,
    address: booking.address,
    requestedStart: booking.requestedStart,
    status: booking.status,
    trackToken: booking.trackToken,
    primaryColor: booking.widgetConfig?.primaryColor,
    accentColor: booking.widgetConfig?.accentColor,
    kind: job.kind,
    hoursUntil: job.hoursUntil,
  })

  return { success: sent }
}

/**
 * Backup scan: for bookings in the next 25h that still need a near-term reminder.
 */
export async function scanBookingReminders() {
  const now = new Date()
  const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000)

  const upcoming = await prisma.bookingRequest.findMany({
    where: {
      guestEmail: { not: null },
      trackToken: { not: null },
      status: { in: ["pending", "approved", "converted"] },
      requestedStart: { gt: now, lte: in25h },
    },
    select: { id: true, requestedStart: true },
    take: 200,
  })

  let queued = 0
  for (const b of upcoming) {
    const hoursLeft =
      (b.requestedStart.getTime() - now.getTime()) / (60 * 60 * 1000)
    // Queue 2h reminder if within ~3h and still > 1h away
    if (hoursLeft <= 3 && hoursLeft > 1) {
      const ok = await enqueueBookingEmail({
        bookingRequestId: b.id,
        kind: "reminder",
        hoursUntil: 2,
      })
      if (ok) queued += 1
    } else if (hoursLeft <= 25 && hoursLeft > 20) {
      const ok = await enqueueBookingEmail({
        bookingRequestId: b.id,
        kind: "reminder",
        hoursUntil: 24,
      })
      if (ok) queued += 1
    }
  }

  return { scanned: upcoming.length, queued }
}

export async function notifyBookingLifecycle(opts: {
  bookingRequestId: number
  requestedStart: Date
  kind: "confirmation" | "approved"
}) {
  const job: BookingEmailJob = {
    bookingRequestId: opts.bookingRequestId,
    kind: opts.kind,
  }
  // Always send confirmation/approved immediately via SystemSetting email providers
  // (queue alone fails silently when the automation worker is not running)
  try {
    await handleBookingClientEmail(job)
  } catch (err) {
    console.warn("[Booking] Immediate lifecycle email failed:", err)
    await enqueueBookingEmail(job).catch(() => {})
  }
  if (opts.kind === "confirmation" || opts.kind === "approved") {
    await scheduleBookingReminders(opts.bookingRequestId, opts.requestedStart)
  }
}
