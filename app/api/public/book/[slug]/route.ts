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

  // Upsert Client
  let clientId: number | null = null
  if (guestEmail) {
    const existing = await prisma.client.findFirst({
      where: {
        companyId: config.companyId,
        email: { equals: guestEmail, mode: "insensitive" },
      },
    })
    if (existing) {
      clientId = existing.id
      await prisma.client.update({
        where: { id: existing.id },
        data: {
          name: guestName,
          phone: guestPhone || existing.phone,
        },
      })
    } else {
      const created = await prisma.client.create({
        data: {
          companyId: config.companyId,
          name: guestName,
          email: guestEmail,
          phone: guestPhone,
          source: "booking",
        },
      })
      clientId = created.id
    }
  } else {
    const created = await prisma.client.create({
      data: {
        companyId: config.companyId,
        name: guestName,
        phone: guestPhone,
        source: "booking",
      },
    })
    clientId = created.id
  }

  let propertyId: number | null = null
  if (config.autoCreateProperty && address) {
    const prop = await prisma.property.create({
      data: {
        companyId: config.companyId,
        address,
        propertyType: "apartment",
        clientName: guestName,
        clientEmail: guestEmail,
        clientPhone: guestPhone,
        clientId,
        notes: notes ? `Booking notes: ${notes}` : null,
      },
    })
    propertyId = prop.id
  }

  let taskId: number | null = null
  if (config.autoCreateTask && propertyId) {
    const task = await prisma.task.create({
      data: {
        companyId: config.companyId,
        propertyId,
        title: serviceType
          ? `${serviceType} — ${guestName}`
          : `Booking — ${guestName}`,
        description: notes,
        status: "PLANNED",
        scheduledDate: requestedStart,
        estimatedDurationMinutes: duration,
      },
    })
    taskId = task.id
  }

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
    },
  })

  const { notifyNewBookingRequest } = await import("@/lib/notifications")
  await notifyNewBookingRequest({
    companyId: config.companyId,
    bookingRequestId: booking.id,
    guestName,
    requestedStart,
    serviceType,
    source,
  })

  return NextResponse.json({
    success: true,
    data: {
      id: booking.id,
      status: booking.status,
      message:
        config.successMessage ||
        "Thanks! Your booking request is in. We’ll be in touch soon.",
    },
  })
}
