import crypto from "crypto"
import prisma from "@/lib/prisma"
import { sendEmail } from "@/lib/email"
import { buildReviewLink } from "@/lib/reviews"
import { getPublicWebOrigin } from "@/lib/domains"

const FEEDBACK_STATUSES = [
  "SUBMITTED",
  "QA_REVIEW",
  "APPROVED",
  "COMPLETED",
  "ARCHIVED",
] as const

function escapeHtml(s: string) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Ensure a ReviewRequest exists for a finished job and email the client.
 * Prefer the public booking track page when a trackToken exists (same design).
 */
export async function ensureAndSendClientFeedbackEmail(taskId: number) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      status: true,
      companyId: true,
      company: { select: { name: true } },
      property: {
        select: {
          address: true,
          client: { select: { name: true, email: true } },
        },
      },
      bookingRequests: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          guestName: true,
          guestEmail: true,
          trackToken: true,
          widgetConfig: {
            select: {
              logoUrl: true,
              primaryColor: true,
              accentColor: true,
            },
          },
        },
      },
      reviewRequests: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  })

  if (!task) return { sent: false, reason: "task not found" }
  if (!FEEDBACK_STATUSES.includes(task.status as (typeof FEEDBACK_STATUSES)[number])) {
    return { sent: false, reason: "status not eligible" }
  }

  const booking = task.bookingRequests[0] || null
  const to =
    booking?.guestEmail?.trim() ||
    task.property?.client?.email?.trim() ||
    null
  if (!to || !to.includes("@")) {
    return { sent: false, reason: "no client email" }
  }

  let review = task.reviewRequests.find(
    (r) => !r.submittedAt && (!r.expiresAt || r.expiresAt > new Date())
  )

  if (!review) {
    const token = crypto.randomBytes(24).toString("hex")
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 14)
    review = await prisma.reviewRequest.create({
      data: {
        taskId: task.id,
        token,
        expiresAt,
      },
    })
  }

  const companyName = task.company.name
  const guestName =
    booking?.guestName || task.property?.client?.name || "there"
  const primary = booking?.widgetConfig?.primaryColor || "#0B1F33"
  const accent = booking?.widgetConfig?.accentColor || "#D97706"
  const logoUrl = booking?.widgetConfig?.logoUrl

  // Prefer track page (merged feedback UI) when booking track token exists
  const feedbackUrl =
    booking?.trackToken
      ? `${getPublicWebOrigin()}/book/track/${encodeURIComponent(booking.trackToken)}?feedback=1`
      : buildReviewLink(review.token)

  const name = escapeHtml(guestName.split(" ")[0] || guestName)
  const company = escapeHtml(companyName)
  const address = escapeHtml(task.property?.address || task.title)
  const logoBlock = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="" width="48" height="48" style="display:block;border-radius:12px;object-fit:cover;" />`
    : `<div style="width:48px;height:48px;border-radius:12px;background:rgba(255,255,255,0.12);color:#fff;font-weight:700;font-size:18px;line-height:48px;text-align:center;">${company.slice(0, 1)}</div>`

  const html = `<!DOCTYPE html>
<html><body style="margin:0;background:#f4f1ec;font-family:Outfit,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 16px 40px rgba(11,31,51,0.12);">
        <tr><td style="background:linear-gradient(145deg,${primary} 0%,${primary}ee 70%,${accent}99 140%);padding:28px 32px;color:#fff;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:14px;">${logoBlock}</td>
            <td>
              <p style="margin:0;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.65;">HOW WAS YOUR CLEAN?</p>
              <p style="margin:4px 0 0;font-size:15px;font-weight:600;">${company}</p>
            </td>
          </tr></table>
          <h1 style="margin:28px 0 0;font-family:Georgia,serif;font-size:32px;font-weight:600;line-height:1.2;">Hi ${name}</h1>
          <p style="margin:10px 0 0;font-size:14px;opacity:0.8;line-height:1.5;">We'd love your quick feedback on the clean at ${address}.</p>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <a href="${escapeHtml(feedbackUrl)}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 22px;border-radius:999px;">Leave feedback</a>
          <p style="margin:18px 0 0;font-size:12px;color:#64748b;line-height:1.5;">Takes under a minute. 4–5 stars may be invited to a public review.</p>
        </td></tr>
        <tr><td style="padding:0 32px 24px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">Powered by <strong style="color:${primary};">TidyFlow</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  const sent = await sendEmail({
    to,
    subject: `How was your clean? · ${companyName}`,
    html,
  })

  return { sent, reviewToken: review.token, feedbackUrl }
}
