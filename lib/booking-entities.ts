import prisma from "@/lib/prisma"

/**
 * Ensures Client → Property → Task chain for booking flows.
 * Reuses client by email (or creates). Reuses property by client+address when possible.
 */
export async function resolveBookingEntities(input: {
  companyId: number
  guestName: string
  guestEmail?: string | null
  guestPhone?: string | null
  address?: string | null
  notes?: string | null
  serviceType?: string | null
  requestedStart: Date
  durationMinutes: number
  autoCreateProperty: boolean
  autoCreateTask: boolean
  existingClientId?: number | null
  existingPropertyId?: number | null
  existingTaskId?: number | null
  /** Extra dynamic field answers (JSON-serializable) */
  fieldAnswers?: Record<string, unknown> | null
  formFieldsJson?: string | null
}) {
  let clientId = input.existingClientId || null

  if (!clientId && input.guestEmail) {
    const existing = await prisma.client.findFirst({
      where: {
        companyId: input.companyId,
        email: { equals: input.guestEmail, mode: "insensitive" },
      },
    })
    if (existing) {
      clientId = existing.id
      await prisma.client.update({
        where: { id: existing.id },
        data: {
          name: input.guestName,
          phone: input.guestPhone || existing.phone,
          isActive: true,
        },
      })
    }
  }

  if (!clientId) {
    const created = await prisma.client.create({
      data: {
        companyId: input.companyId,
        name: input.guestName,
        email: input.guestEmail || null,
        phone: input.guestPhone || null,
        source: "booking",
      },
    })
    clientId = created.id
  }

  let propertyId = input.existingPropertyId || null

  if (!propertyId && input.autoCreateProperty && input.address) {
    const normalized = input.address.trim().toLowerCase()
    const candidates = await prisma.property.findMany({
      where: {
        companyId: input.companyId,
        OR: [{ clientId }, { clientEmail: input.guestEmail || undefined }],
        isActive: true,
      },
      take: 40,
    })
    const match = candidates.find(
      (p) => p.address.trim().toLowerCase() === normalized
    )
    if (match) {
      propertyId = match.id
      await prisma.property.update({
        where: { id: match.id },
        data: {
          clientId,
          clientName: input.guestName,
          clientEmail: input.guestEmail,
          clientPhone: input.guestPhone || match.clientPhone,
        },
      })
    } else {
      const prop = await prisma.property.create({
        data: {
          companyId: input.companyId,
          address: input.address.trim(),
          propertyType: "apartment",
          clientId,
          clientName: input.guestName,
          clientEmail: input.guestEmail,
          clientPhone: input.guestPhone,
          notes: input.notes ? `Booking notes: ${input.notes}` : null,
        },
      })
      propertyId = prop.id
    }
  } else if (propertyId && clientId) {
    await prisma.property.update({
      where: { id: propertyId },
      data: {
        clientId,
        clientName: input.guestName,
        clientEmail: input.guestEmail,
        clientPhone: input.guestPhone,
      },
    })
  }

  let taskId = input.existingTaskId || null

  if (!taskId && input.autoCreateTask && propertyId) {
    const { formatFieldAnswersForTask, parseJson, DEFAULT_FORM_FIELDS } =
      await import("@/lib/booking-widget")
    const fields = parseJson(input.formFieldsJson, DEFAULT_FORM_FIELDS)
    const extras = formatFieldAnswersForTask(
      (input.fieldAnswers || {}) as Record<string, unknown>,
      fields
    )
    const descParts = [input.notes, extras].filter(Boolean)
    const task = await prisma.task.create({
      data: {
        companyId: input.companyId,
        propertyId,
        title: input.serviceType
          ? `${input.serviceType} — ${input.guestName}`
          : `Booking — ${input.guestName}`,
        description: descParts.length ? descParts.join("\n\n") : null,
        status: "PLANNED",
        scheduledDate: input.requestedStart,
        estimatedDurationMinutes: input.durationMinutes,
      },
    })
    taskId = task.id
  }

  return { clientId, propertyId, taskId }
}

/** Create a RecurringJob after a booking is converted (first visit already tasked). */
export async function createRecurringJobFromBooking(input: {
  companyId: number
  propertyId: number
  serviceType?: string | null
  guestName: string
  notes?: string | null
  fieldAnswers?: Record<string, unknown> | null
  formFieldsJson?: string | null
  requestedStart: Date
  recurringPattern: string
}) {
  const { recurringPatternToJobFields, formatFieldAnswersForTask, parseJson, DEFAULT_FORM_FIELDS } =
    await import("@/lib/booking-widget")
  const fields = parseJson(input.formFieldsJson, DEFAULT_FORM_FIELDS)
  const extras = formatFieldAnswersForTask(
    (input.fieldAnswers || {}) as Record<string, unknown>,
    fields
  )
  const descParts = [input.notes, extras].filter(Boolean)
  const jobFields = recurringPatternToJobFields(
    input.recurringPattern,
    input.requestedStart
  )

  return prisma.recurringJob.create({
    data: {
      companyId: input.companyId,
      propertyId: input.propertyId,
      recurrenceType: jobFields.recurrenceType,
      intervalDays: jobFields.intervalDays ?? null,
      allowedDaysOfWeek: jobFields.allowedDaysOfWeek
        ? JSON.stringify(jobFields.allowedDaysOfWeek)
        : null,
      nextRunAt: jobFields.nextRunAt,
      active: true,
      taskTitle: input.serviceType
        ? `${input.serviceType} — ${input.guestName}`
        : `Recurring — ${input.guestName}`,
      taskDescription: descParts.length
        ? `From online booking (recurring request)\n\n${descParts.join("\n\n")}`
        : "From online booking (recurring request)",
    },
  })
}
