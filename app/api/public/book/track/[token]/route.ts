import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

type Ctx = { params: Promise<{ token: string }> }

const FEEDBACK_OK = new Set([
  "SUBMITTED",
  "QA_REVIEW",
  "APPROVED",
  "COMPLETED",
  "ARCHIVED",
])

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
      task: {
        select: {
          id: true,
          status: true,
          title: true,
          reviewRequests: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
      },
    },
  })

  if (!booking) {
    return NextResponse.json(
      { success: false, message: "Booking not found" },
      { status: 404 }
    )
  }

  const taskStatus = booking.task?.status || null
  const canLeaveFeedback = !!(
    taskStatus && FEEDBACK_OK.has(String(taskStatus).toUpperCase())
  )

  let reviewToken: string | null = null
  let feedbackSubmitted = false
  let feedbackRating: number | null = null

  if (booking.task) {
    const active = booking.task.reviewRequests.find(
      (r) => !r.submittedAt && (!r.expiresAt || r.expiresAt > new Date())
    )
    const submitted = booking.task.reviewRequests.find((r) => r.submittedAt)
    if (submitted) {
      feedbackSubmitted = true
      feedbackRating = submitted.rating
    }
    if (active) {
      reviewToken = active.token
    } else if (canLeaveFeedback && !feedbackSubmitted) {
      // Lazily create so track page can collect feedback even if email was missed
      const crypto = await import("crypto")
      const newToken = crypto.randomBytes(24).toString("hex")
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 14)
      const created = await prisma.reviewRequest.create({
        data: {
          taskId: booking.task.id,
          token: newToken,
          expiresAt,
        },
      })
      reviewToken = created.token
    }
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
      taskStatus,
      canLeaveFeedback: canLeaveFeedback && !feedbackSubmitted && !!reviewToken,
      feedbackSubmitted,
      feedbackRating,
      reviewToken,
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
