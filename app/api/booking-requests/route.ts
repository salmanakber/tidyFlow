import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth, resolveCompanyIdAsync, isManagerPlusRole } from "@/lib/rbac"
import { createNotification } from "@/lib/notifications"

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }
  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser)
  if (!companyId) {
    return NextResponse.json({ success: false, message: "Company required" }, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status")

  const where: any = { companyId }
  if (status) where.status = status

  const bookings = await prisma.bookingRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      client: { select: { id: true, name: true, email: true } },
      property: { select: { id: true, address: true } },
      task: { select: { id: true, title: true, status: true } },
    },
  })

  return NextResponse.json({ success: true, data: bookings })
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
  const id = Number(body.id)
  const action = String(body.action || body.status || "").toLowerCase()
  if (!id) {
    return NextResponse.json({ success: false, message: "id required" }, { status: 400 })
  }

  const booking = await prisma.bookingRequest.findFirst({
    where: { id, companyId },
  })
  if (!booking) {
    return NextResponse.json({ success: false, message: "Not found" }, { status: 404 })
  }

  if (action === "reject" || action === "rejected") {
    const updated = await prisma.bookingRequest.update({
      where: { id },
      data: { status: "rejected" },
    })
    return NextResponse.json({ success: true, data: updated })
  }

  if (action === "cancel" || action === "cancelled") {
    const updated = await prisma.bookingRequest.update({
      where: { id },
      data: { status: "cancelled" },
    })
    return NextResponse.json({ success: true, data: updated })
  }

  if (action === "approve" || action === "approved" || action === "convert") {
    let propertyId = booking.propertyId
    let clientId = booking.clientId

    if (!clientId) {
      const client = await prisma.client.create({
        data: {
          companyId,
          name: booking.guestName,
          email: booking.guestEmail,
          phone: booking.guestPhone,
          source: "booking",
        },
      })
      clientId = client.id
    }

    if (!propertyId && booking.address) {
      const prop = await prisma.property.create({
        data: {
          companyId,
          address: booking.address,
          propertyType: "apartment",
          clientName: booking.guestName,
          clientEmail: booking.guestEmail,
          clientPhone: booking.guestPhone,
          clientId,
        },
      })
      propertyId = prop.id
    }

    if (!propertyId) {
      return NextResponse.json(
        {
          success: false,
          message: "Add a property address before converting to a task",
        },
        { status: 400 }
      )
    }

    let taskId = booking.taskId
    if (!taskId) {
      const duration = booking.requestedEnd
        ? Math.round(
            (booking.requestedEnd.getTime() - booking.requestedStart.getTime()) /
              60000
          )
        : 120
      const task = await prisma.task.create({
        data: {
          companyId,
          propertyId,
          title: booking.serviceType
            ? `${booking.serviceType} — ${booking.guestName}`
            : `Booking — ${booking.guestName}`,
          description: booking.notes,
          status: "PLANNED",
          scheduledDate: booking.requestedStart,
          estimatedDurationMinutes: duration > 0 ? duration : 120,
        },
      })
      taskId = task.id
    }

    const updated = await prisma.bookingRequest.update({
      where: { id },
      data: {
        status: "converted",
        clientId,
        propertyId,
        taskId,
      },
    })

    // Notify managers that booking was converted
    const managers = await prisma.user.findMany({
      where: {
        companyId,
        role: { in: ["MANAGER", "COMPANY_ADMIN", "OWNER"] },
        isActive: true,
      },
      select: { id: true },
    })
    for (const m of managers) {
      await createNotification({
        userId: m.id,
        title: "Booking converted to job",
        message: `${booking.guestName} → task #${taskId}`,
        type: "booking_converted",
        metadata: { bookingRequestId: id, taskId },
        screenRoute: "TaskDetail",
        screenParams: { taskId },
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, data: updated })
  }

  return NextResponse.json(
    { success: false, message: "Unknown action" },
    { status: 400 }
  )
}
