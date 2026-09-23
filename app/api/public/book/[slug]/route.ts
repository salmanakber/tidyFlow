import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { serializeWidgetPublic } from "@/lib/booking-widget"
import {
  getAvailableSlotsForDay,
  getMonthAvailability,
} from "@/lib/booking-availability"

type Ctx = { params: Promise<{ slug: string }> }

async function loadConfig(slug: string) {
  const config = await prisma.bookingWidgetConfig.findUnique({
    where: { publicSlug: slug },
    include: { company: { select: { name: true, id: true } } },
  })
  if (!config || !config.enabled) return null
  return config
}

export async function GET(request: NextRequest, context: Ctx) {
  const { slug } = await context.params
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get("mode") || "config"

  const config = await loadConfig(slug)
  if (!config) {
    return NextResponse.json(
      { success: false, message: "Booking page not found" },
      { status: 404 }
    )
  }

  if (mode === "month") {
    const year = Number(searchParams.get("year")) || new Date().getFullYear()
    const month = Number(searchParams.get("month")) || new Date().getMonth() + 1
    const duration =
      Number(searchParams.get("duration")) || config.defaultDurationMin
    const days = await getMonthAvailability({
      companyId: config.companyId,
      year,
      month,
      durationMinutes: duration,
      weeklyHoursJson: config.weeklyHours,
      closedDatesJson: config.closedDates,
      slotIntervalMinutes: config.slotIntervalMinutes,
      minLeadHours: config.minLeadHours,
      bufferMinutes: config.bufferMinutes,
      useCleanerAvailability: config.useCleanerAvailability,
      maxDaysAhead: config.maxDaysAhead,
    })
    return NextResponse.json({ success: true, data: { year, month, days } })
  }

  if (mode === "slots") {
    const date = searchParams.get("date")
    if (!date) {
      return NextResponse.json(
        { success: false, message: "date required (YYYY-MM-DD)" },
        { status: 400 }
      )
    }
    const duration =
      Number(searchParams.get("duration")) || config.defaultDurationMin
    const result = await getAvailableSlotsForDay({
      companyId: config.companyId,
      dateKey: date,
      durationMinutes: duration,
      weeklyHoursJson: config.weeklyHours,
      closedDatesJson: config.closedDates,
      slotIntervalMinutes: config.slotIntervalMinutes,
      minLeadHours: config.minLeadHours,
      bufferMinutes: config.bufferMinutes,
      useCleanerAvailability: config.useCleanerAvailability,
    })
    return NextResponse.json({ success: true, data: result })
  }

  return NextResponse.json({
    success: true,
    data: serializeWidgetPublic({
      ...config,
      companyName: config.company.name,
    }),
  })
}

export async function POST(request: NextRequest, context: Ctx) {
  const { slug } = await context.params
  const config = await loadConfig(slug)
  if (!config) {
    return NextResponse.json(
      { success: false, message: "Booking page not found" },
      { status: 404 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const guestName = String(body.name || body.guestName || "").trim()
  const guestEmail = String(body.email || body.guestEmail || "").trim() || null
  const guestPhone = String(body.phone || body.guestPhone || "").trim() || null
  const address = String(body.address || "").trim() || null
  const serviceType = String(body.serviceType || "").trim() || null
  const notes = String(body.notes || "").trim() || null
  const requestedStartRaw = body.requestedStart || body.slotStart
  const source = body.source === "embed" ? "embed" : "link"
  const fieldAnswers =
    body.answers && typeof body.answers === "object" ? body.answers : body

  const wantsRecurring =
    config.showRecurringOption === true &&
    (body.wantsRecurring === true ||
      body.recurringRequested === true ||
      fieldAnswers?.wantsRecurring === true ||
      fieldAnswers?.recurringRequested === true ||
      fieldAnswers?.wantsRecurring === "true" ||
      fieldAnswers?.recurringRequested === "true")
  const recurringPatternRaw = String(
    body.recurringPattern || fieldAnswers?.recurringPattern || ""
  )
    .trim()
    .toLowerCase()
  const recurringPattern =
    wantsRecurring &&
    ["weekly", "biweekly", "monthly"].includes(recurringPatternRaw)
      ? recurringPatternRaw
      : null

  // Keep answers in sync for task notes / CRM
  if (fieldAnswers && typeof fieldAnswers === "object") {
    ;(fieldAnswers as Record<string, unknown>).wantsRecurring = !!wantsRecurring
    ;(fieldAnswers as Record<string, unknown>).recurringRequested = !!wantsRecurring
    if (recurringPattern) {
      ;(fieldAnswers as Record<string, unknown>).recurringPattern =
        recurringPattern
    } else {
      delete (fieldAnswers as Record<string, unknown>).recurringPattern
    }
  }

  if (!guestName) {
    return NextResponse.json(
      { success: false, message: "Name is required" },
      { status: 400 }
    )
  }
  if (!requestedStartRaw) {
    return NextResponse.json(
      { success: false, message: "Please choose a date and time" },
      { status: 400 }
    )
  }

  const requestedStart = new Date(requestedStartRaw)
  if (Number.isNaN(requestedStart.getTime())) {
    return NextResponse.json(
      { success: false, message: "Invalid date/time" },
      { status: 400 }
    )
  }

  // Resolve duration from service option
  let duration = config.defaultDurationMin
  try {
    const services = JSON.parse(config.serviceOptions || "[]") as Array<{
      label: string
      durationMinutes: number
    }>
    const match = services.find(
      (s) => s.label === serviceType || (s as any).id === serviceType
    )
    if (match?.durationMinutes) duration = match.durationMinutes
  } catch {
    /* keep default */
  }

  const requestedEnd = new Date(requestedStart.getTime() + duration * 60 * 1000)

  const { resolveBookingEntities } = await import("@/lib/booking-entities")
  const { clientId, propertyId, taskId } = await resolveBookingEntities({
    companyId: config.companyId,
    guestName,
    guestEmail,
    guestPhone,
    address,
    notes,
    serviceType,
    requestedStart,
    durationMinutes: duration,
    autoCreateProperty: config.autoCreateProperty,
    autoCreateTask: config.autoCreateTask,
    fieldAnswers:
      fieldAnswers && typeof fieldAnswers === "object"
        ? (fieldAnswers as Record<string, unknown>)
        : null,
    formFieldsJson: config.formFields,
  })

  const booking = await prisma.bookingRequest.create({
    data: {
      companyId: config.companyId,
      widgetConfigId: config.id,
      clientId,
      propertyId,
      taskId,
      guestName,
      guestEmail,
      guestPhone,
      address,
      serviceType,
      notes,
      fieldAnswers: JSON.stringify(fieldAnswers),
      requestedStart,
      requestedEnd,
      status: taskId ? "converted" : "pending",
      source,
      wantsRecurring: !!wantsRecurring,
      recurringPattern,
      trackToken: (await import("@/lib/booking-jobs")).newBookingTrackToken(),
    },
  })

  // If auto-converted and guest asked for recurring, seed a series
  if (taskId && propertyId && wantsRecurring && recurringPattern) {
    const { createRecurringJobFromBooking } = await import(
      "@/lib/booking-entities"
    )
    await createRecurringJobFromBooking({
      companyId: config.companyId,
      propertyId,
      serviceType,
      guestName,
      notes,
      fieldAnswers:
        fieldAnswers && typeof fieldAnswers === "object"
          ? (fieldAnswers as Record<string, unknown>)
          : null,
      formFieldsJson: config.formFields,
      requestedStart,
      recurringPattern,
    }).catch((err) =>
      console.warn("[Booking] recurring job create failed:", err)
    )
  }

  const { notifyNewBookingRequest } = await import("@/lib/notifications")
  await notifyNewBookingRequest({
    companyId: config.companyId,
    bookingRequestId: booking.id,
    guestName,
    requestedStart,
    serviceType,
    source,
  })

  if (guestEmail && booking.trackToken) {
    const { notifyBookingLifecycle } = await import(
      "@/lib/booking-worker-handlers"
    )
    await notifyBookingLifecycle({
      bookingRequestId: booking.id,
      requestedStart,
      kind: taskId ? "approved" : "confirmation",
    }).catch((err) => console.warn("[Booking] email enqueue failed:", err))
  }

  return NextResponse.json({
    success: true,
    data: {
      id: booking.id,
      status: booking.status,
      clientId,
      propertyId,
      taskId,
      trackToken: booking.trackToken,
      trackUrl: booking.trackToken
        ? `/book/track/${booking.trackToken}`
        : null,
      message:
        config.successMessage ||
        "Thanks! Your booking request is in. We’ll be in touch soon.",
    },
  })
}
