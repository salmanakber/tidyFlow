import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

type Ctx = { params: Promise<{ token: string }> }

export async function GET(_request: NextRequest, context: Ctx) {
  const { token } = await context.params
  if (!token || token.length < 16) {
    return NextResponse.json(
      { success: false, message: "Invalid tracking link" },
      { status: 400 }
    )
  }

  const booking = await prisma.bookingRequest.findUnique({
    where: { trackToken: token },
    include: {
      company: { select: { name: true } },
      widgetConfig: {
        select: {
          logoUrl: true,
          primaryColor: true,
          accentColor: true,
          backgroundColor: true,
          headline: true,
        },
      },
      property: { select: { address: true } },
      task: { select: { id: true, status: true, title: true } },
    },
  })

  if (!booking) {
    return NextResponse.json(
      { success: false, message: "Booking not found" },
      { status: 404 }
    )
  }

  return NextResponse.json({
    success: true,
    data: {
      guestName: booking.guestName,
      companyName: booking.company.name,
      serviceType: booking.serviceType,
      address: booking.address || booking.property?.address,
      requestedStart: booking.requestedStart,
      requestedEnd: booking.requestedEnd,
      status: booking.status,
      source: booking.source,
      taskStatus: booking.task?.status || null,
      branding: {
        logoUrl: booking.widgetConfig?.logoUrl || null,
        primary: booking.widgetConfig?.primaryColor || "#0B1F33",
        accent: booking.widgetConfig?.accentColor || "#D97706",
        background: booking.widgetConfig?.backgroundColor || "#F7F4EF",
        headline: booking.widgetConfig?.headline || null,
      },
    },
  })
}
