import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth, resolveCompanyIdAsync, isManagerPlusRole } from "@/lib/rbac"

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
  const q = (searchParams.get("q") || "").trim()
  const id = searchParams.get("id")

  if (id) {
    const client = await prisma.client.findFirst({
      where: { id: Number(id), companyId },
      include: {
        properties: {
          orderBy: { updatedAt: "desc" },
          take: 50,
        },
        bookingRequests: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        _count: { select: { properties: true, bookingRequests: true } },
      },
    })
    if (!client) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 })
    }

    const propertyIds = client.properties.map((p) => p.id)
    const tasks = propertyIds.length
      ? await prisma.task.findMany({
          where: { companyId, propertyId: { in: propertyIds } },
          orderBy: { scheduledDate: "desc" },
          take: 40,
          select: {
            id: true,
            title: true,
            status: true,
            scheduledDate: true,
            budget: true,
            propertyId: true,
          },
        })
      : []

    const invoices = await prisma.clientInvoice.findMany({
      where: {
        companyId,
        OR: [
          ...(client.email
            ? [{ clientEmail: { equals: client.email, mode: "insensitive" as const } }]
            : []),
          { clientName: { equals: client.name, mode: "insensitive" } },
          ...(propertyIds.length ? [{ propertyId: { in: propertyIds } }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    })

    return NextResponse.json({
      success: true,
      data: { ...client, tasks, invoices },
    })
  }

  const where: any = { companyId }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
    ]
  }

  const [clients, total, pendingBookings, thisMonthBookings] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        _count: { select: { properties: true, bookingRequests: true } },
      },
    }),
    prisma.client.count({ where: { companyId } }),
    prisma.bookingRequest.count({
      where: { companyId, status: "pending" },
    }),
    prisma.bookingRequest.count({
      where: {
        companyId,
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
    }),
  ])

  // Fallback: seed list from properties that have client info but no Client row yet
  let legacy = 0
  if (clients.length === 0 && !q) {
    const props = await prisma.property.findMany({
      where: {
        companyId,
        OR: [{ clientName: { not: null } }, { clientEmail: { not: null } }],
      },
      select: { clientName: true, clientEmail: true, clientPhone: true },
      take: 200,
    })
    legacy = new Set(
      props.map(
        (p) =>
          (p.clientEmail || "").toLowerCase() ||
          (p.clientName || "").toLowerCase()
      )
    ).size
  }

  return NextResponse.json({
    success: true,
    data: {
      clients,
      summary: {
        totalClients: total,
        pendingBookings,
        bookingsThisMonth: thisMonthBookings,
        legacyPropertyClients: legacy,
      },
    },
  })
}

export async function POST(request: NextRequest) {
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
  const name = String(body.name || "").trim()
  if (!name) {
    return NextResponse.json({ success: false, message: "Name required" }, { status: 400 })
  }

  const client = await prisma.client.create({
    data: {
      companyId,
      name,
      email: body.email ? String(body.email).trim() : null,
      phone: body.phone ? String(body.phone).trim() : null,
      notes: body.notes ? String(body.notes).trim() : null,
      source: "manual",
    },
  })

  return NextResponse.json({ success: true, data: client })
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
  if (!id) {
    return NextResponse.json({ success: false, message: "id required" }, { status: 400 })
  }

  const existing = await prisma.client.findFirst({ where: { id, companyId } })
  if (!existing) {
    return NextResponse.json({ success: false, message: "Not found" }, { status: 404 })
  }

  const updated = await prisma.client.update({
    where: { id },
    data: {
      ...(body.name != null ? { name: String(body.name).trim() } : {}),
      ...(body.email !== undefined
        ? { email: body.email ? String(body.email).trim() : null }
        : {}),
      ...(body.phone !== undefined
        ? { phone: body.phone ? String(body.phone).trim() : null }
        : {}),
      ...(body.notes !== undefined
        ? { notes: body.notes ? String(body.notes).trim() : null }
        : {}),
      ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}),
    },
  })

  return NextResponse.json({ success: true, data: updated })
}
