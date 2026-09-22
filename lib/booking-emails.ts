import { sendEmail } from "@/lib/email"

const APP_URL = () =>
  process.env.NEXT_PUBLIC_APP_URL || "https://app.tidyflowapp.com"

function escapeHtml(s: string) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function formatWhen(d: Date) {
  return d.toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export type BookingEmailPayload = {
  to: string
  guestName: string
  companyName: string
  companyLogoUrl?: string | null
  serviceType?: string | null
  address?: string | null
  requestedStart: Date
  status: string
  trackToken: string
  primaryColor?: string
  accentColor?: string
  kind: "confirmation" | "approved" | "reminder"
  hoursUntil?: number
}

function statusLabel(status: string) {
  const s = (status || "").toLowerCase()
  if (s === "converted" || s === "approved") return "Confirmed"
  if (s === "pending") return "Request received"
  if (s === "rejected") return "Declined"
  if (s === "cancelled") return "Cancelled"
  return status
}

function buildBookingEmailHtml(p: BookingEmailPayload) {
  const navy = p.primaryColor || "#0B1F33"
  const amber = p.accentColor || "#D97706"
  const trackUrl = `${APP_URL()}/book/track/${encodeURIComponent(p.trackToken)}`
  const when = formatWhen(p.requestedStart)
  const name = escapeHtml(p.guestName.split(" ")[0] || p.guestName)
  const company = escapeHtml(p.companyName)
  const service = escapeHtml(p.serviceType || "Cleaning")
  const address = escapeHtml(p.address || "To be confirmed")
  const status = escapeHtml(statusLabel(p.status))

  let eyebrow = "BOOKING CONFIRMED"
  let title = "You're on the list"
  let intro = `Thanks ${name} — ${company} has received your booking request. We'll be in touch shortly.`

  if (p.kind === "approved") {
    eyebrow = "APPOINTMENT CONFIRMED"
    title = "You're booked in"
    intro = `Great news, ${name}. ${company} has confirmed your appointment.`
  } else if (p.kind === "reminder") {
    eyebrow = "REMINDER"
    title =
      p.hoursUntil != null && p.hoursUntil <= 3
        ? "Your clean is coming up soon"
        : "Your appointment is tomorrow"
    intro = `Friendly reminder from ${company}: your booking is still on the calendar.`
  }

  const logoBlock = p.companyLogoUrl
    ? `<img src="${escapeHtml(p.companyLogoUrl)}" alt="" width="48" height="48" style="display:block;border-radius:12px;object-fit:cover;" />`
    : `<div style="width:48px;height:48px;border-radius:12px;background:rgba(255,255,255,0.12);color:#fff;font-weight:700;font-size:18px;line-height:48px;text-align:center;">${company.slice(0, 1)}</div>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#F4F1EC;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EC;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid rgba(11,31,51,0.08);box-shadow:0 18px 50px rgba(11,31,51,0.08);">
          <tr>
            <td style="background:linear-gradient(145deg, ${navy} 0%, ${navy} 70%, ${amber} 160%);padding:28px 28px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">${logoBlock}</td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="display:inline-block;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,0.12);color:rgba(255,255,255,0.85);font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">${escapeHtml(eyebrow)}</span>
                  </td>
                </tr>
              </table>
              <p style="margin:22px 0 0;color:rgba(255,255,255,0.65);font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">${company}</p>
              <h1 style="margin:8px 0 0;color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:600;letter-spacing:-0.02em;line-height:1.15;">${escapeHtml(title)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1e293b;">${intro}</p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#F8F6F2;border-radius:14px;border:1px solid rgba(11,31,51,0.06);">
                <tr>
                  <td style="padding:18px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:0 0 12px;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;width:34%;">When</td>
                        <td style="padding:0 0 12px;font-size:14px;font-weight:600;color:#0f172a;">${escapeHtml(when)}</td>
                      </tr>
                      <tr>
                        <td style="padding:0 0 12px;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">Service</td>
                        <td style="padding:0 0 12px;font-size:14px;font-weight:600;color:#0f172a;">${service}</td>
                      </tr>
                      <tr>
                        <td style="padding:0 0 12px;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">Address</td>
                        <td style="padding:0 0 12px;font-size:14px;font-weight:600;color:#0f172a;">${address}</td>
                      </tr>
                      <tr>
                        <td style="padding:0;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">Status</td>
                        <td style="padding:0;font-size:14px;font-weight:700;color:${amber};">${status}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:4px 0 8px;">
                    <a href="${trackUrl}" style="display:inline-block;padding:14px 28px;background:${navy};color:#ffffff;text-decoration:none;border-radius:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:0.01em;">Track your booking</a>
                  </td>
                </tr>
              </table>
              <p style="margin:12px 0 0;text-align:center;font-size:12px;line-height:1.5;color:#94a3b8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">Questions? Reply to the company or check your tracking page anytime.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 24px;border-top:1px solid rgba(11,31,51,0.06);background:#FAFAF8;text-align:center;">
              <p style="margin:0;font-size:11px;color:#94a3b8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                Powered by <strong style="color:${navy};">TidyFlow</strong> · <a href="https://tidyflowapp.com" style="color:${amber};text-decoration:none;">tidyflowapp.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function sendBookingClientEmail(payload: BookingEmailPayload) {
  if (!payload.to?.includes("@")) return false

  let subject = `Booking received · ${payload.companyName}`
  if (payload.kind === "approved") {
    subject = `Confirmed · ${payload.companyName}`
  } else if (payload.kind === "reminder") {
    subject =
      payload.hoursUntil != null && payload.hoursUntil <= 3
        ? `Coming up soon · ${payload.companyName}`
        : `Reminder · ${payload.companyName}`
  }

  return sendEmail({
    to: payload.to,
    subject,
    html: buildBookingEmailHtml(payload),
  })
}
