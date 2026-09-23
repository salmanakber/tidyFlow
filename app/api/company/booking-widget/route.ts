import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth, resolveCompanyIdAsync, isManagerPlusRole } from "@/lib/rbac"
import {
  DEFAULT_FORM_FIELDS,
  DEFAULT_SERVICE_OPTIONS,
  DEFAULT_WEEKLY_HOURS,
  DEFAULT_THEME,
  slugifyBooking,
  parseJson,
} from "@/lib/booking-widget"

async function uniqueSlug(base: string, excludeCompanyId?: number) {
  let slug = slugifyBooking(base)
  let n = 0
  while (true) {
    const candidate = n === 0 ? slug : `${slug}-${n}`
    const existing = await prisma.bookingWidgetConfig.findUnique({
      where: { publicSlug: candidate },
      select: { companyId: true },
    })
    if (!existing || existing.companyId === excludeCompanyId) return candidate
    n += 1
  }
}

async function ensureConfig(companyId: number) {
  const existing = await prisma.bookingWidgetConfig.findUnique({
    where: { companyId },
  })
  if (existing) return existing

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  })
  const slug = await uniqueSlug(company?.name || `company-${companyId}`)

  return prisma.bookingWidgetConfig.create({
    data: {
      companyId,
      publicSlug: slug,
      headline: `Book with ${company?.name || "us"}`,
      description:
        "Pick a date and time — we’ll confirm your cleaning appointment shortly.",
      successMessage:
        "Thanks! Your booking request is in. We’ll be in touch soon.",
      primaryColor: DEFAULT_THEME.primaryColor,
      accentColor: DEFAULT_THEME.accentColor,
      backgroundColor: DEFAULT_THEME.backgroundColor,
      textColor: DEFAULT_THEME.textColor,
      formFields: JSON.stringify(DEFAULT_FORM_FIELDS),
      serviceOptions: JSON.stringify(DEFAULT_SERVICE_OPTIONS),
      weeklyHours: JSON.stringify(DEFAULT_WEEKLY_HOURS),
      closedDates: "[]",
    },
  })
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }
  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser)
  if (!companyId) {
    return NextResponse.json({ success: false, message: "Company required" }, { status: 400 })
  }

  const config = await ensureConfig(companyId)
  return NextResponse.json({
    success: true,
    data: {
      ...config,
      formFields: parseJson(config.formFields, DEFAULT_FORM_FIELDS),
      serviceOptions: parseJson(config.serviceOptions, DEFAULT_SERVICE_OPTIONS),
      weeklyHours: parseJson(config.weeklyHours, DEFAULT_WEEKLY_HOURS),
      closedDates: parseJson(config.closedDates, [] as string[]),
      publicUrl: `/book/${config.publicSlug}`,
      embedSnippet: `<iframe src="${process.env.NEXT_PUBLIC_APP_URL || "https://app.tidyflowapp.com"}/book/${config.publicSlug}?embed=1" title="Book online" style="width:100%;min-height:720px;border:0;border-radius:16px;" loading="lazy"></iframe>`,
    },
  })
}

export async function PATCH(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }
  if (!isManagerPlusRole(auth.tokenUser.role)) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 })
  }
  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser)
  if (!companyId) {
    return NextResponse.json({ success: false, message: "Company required" }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const config = await ensureConfig(companyId)

  const data: Record<string, unknown> = {}
  if (typeof body.enabled === "boolean") data.enabled = body.enabled
  if (typeof body.headline === "string") data.headline = body.headline.slice(0, 120)
  if (typeof body.description === "string") data.description = body.description.slice(0, 2000)
  if (typeof body.successMessage === "string")
    data.successMessage = body.successMessage.slice(0, 1000)
  if (typeof body.logoUrl === "string" || body.logoUrl === null) data.logoUrl = body.logoUrl
  if (typeof body.primaryColor === "string") data.primaryColor = body.primaryColor
  if (typeof body.accentColor === "string") data.accentColor = body.accentColor
  if (typeof body.backgroundColor === "string") data.backgroundColor = body.backgroundColor
  if (typeof body.textColor === "string") data.textColor = body.textColor
  if (Array.isArray(body.formFields)) data.formFields = JSON.stringify(body.formFields)
  if (Array.isArray(body.serviceOptions))
    data.serviceOptions = JSON.stringify(body.serviceOptions)
  if (body.weeklyHours && typeof body.weeklyHours === "object")
    data.weeklyHours = JSON.stringify(body.weeklyHours)
  if (Array.isArray(body.closedDates)) data.closedDates = JSON.stringify(body.closedDates)
  if (typeof body.slotIntervalMinutes === "number")
    data.slotIntervalMinutes = Math.max(15, Math.min(240, body.slotIntervalMinutes))
  if (typeof body.defaultDurationMin === "number")
    data.defaultDurationMin = Math.max(30, Math.min(480, body.defaultDurationMin))
  if (typeof body.minLeadHours === "number")
    data.minLeadHours = Math.max(0, Math.min(168, body.minLeadHours))
  if (typeof body.maxDaysAhead === "number")
    data.maxDaysAhead = Math.max(7, Math.min(365, body.maxDaysAhead))
  if (typeof body.bufferMinutes === "number")
    data.bufferMinutes = Math.max(0, Math.min(240, body.bufferMinutes))
  if (typeof body.useCleanerAvailability === "boolean")
    data.useCleanerAvailability = body.useCleanerAvailability
  if (typeof body.showCalendar === "boolean") data.showCalendar = body.showCalendar
  if (typeof body.showRecurringOption === "boolean")
    data.showRecurringOption = body.showRecurringOption
  if (typeof body.autoCreateTask === "boolean") data.autoCreateTask = body.autoCreateTask
  if (typeof body.autoCreateProperty === "boolean")
    data.autoCreateProperty = body.autoCreateProperty

  if (typeof body.publicSlug === "string" && body.publicSlug.trim()) {
    data.publicSlug = await uniqueSlug(body.publicSlug, companyId)
  }

  const updated = await prisma.bookingWidgetConfig.update({
    where: { id: config.id },
    data,
  })

  return NextResponse.json({
    success: true,
    data: {
      ...updated,
      formFields: parseJson(updated.formFields, DEFAULT_FORM_FIELDS),
      serviceOptions: parseJson(updated.serviceOptions, DEFAULT_SERVICE_OPTIONS),
      weeklyHours: parseJson(updated.weeklyHours, DEFAULT_WEEKLY_HOURS),
      closedDates: parseJson(updated.closedDates, [] as string[]),
      publicUrl: `/book/${updated.publicSlug}`,
    },
    message: "Booking page updated",
  })
}
