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
    const task = await prisma.task.create({
      data: {
        companyId: input.companyId,
        propertyId,
        title: input.serviceType
          ? `${input.serviceType} — ${input.guestName}`
          : `Booking — ${input.guestName}`,
        description: input.notes,
        status: "PLANNED",
        scheduledDate: input.requestedStart,
        estimatedDurationMinutes: input.durationMinutes,
      },
    })
    taskId = task.id
  }

  return { clientId, propertyId, taskId }
}
