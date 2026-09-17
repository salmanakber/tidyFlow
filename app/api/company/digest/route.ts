import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth, resolveCompanyIdAsync, resolveAuthenticatedUser, isManagerPlusRole } from "@/lib/rbac"
import { sendEmail } from "@/lib/email"
import { UserRole, TaskStatus } from "@prisma/client"

const DONE: TaskStatus[] = [
  TaskStatus.COMPLETED,
  TaskStatus.APPROVED,
  TaskStatus.ARCHIVED,
  TaskStatus.REJECTED,
]

function dayBounds(now = new Date()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  return { start, end, now }
}

function personName(u: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) {
  if (!u) return null
  const n = [u.firstName, u.lastName].filter(Boolean).join(" ").trim()
  return n || u.email || null
}

async function buildDigest(companyId: number) {
  const { start, end, now } = dayBounds()
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  })

  const tasks = await prisma.task.findMany({
    where: {
      companyId,
      scheduledDate: { gte: start, lte: end },
    },
    include: {
      property: { select: { address: true, clientName: true } },
      assignedUser: { select: { firstName: true, lastName: true, email: true } },
      taskAssignments: {
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      },
    },
    orderBy: { scheduledDate: "asc" },
  })

  const summary = {
    total: tasks.length,
    completed: tasks.filter((t) => DONE.includes(t.status)).length,
    inProgress: tasks.filter((t) => t.status === TaskStatus.IN_PROGRESS || t.status === TaskStatus.SUBMITTED).length,
    planned: tasks.filter((t) =>
      [TaskStatus.DRAFT, TaskStatus.PLANNED, TaskStatus.ASSIGNED, TaskStatus.AWAITING, TaskStatus.RESERVED].includes(
        t.status
      )
    ).length,
  }

  const unassigned = tasks.filter((t) => !t.assignedUserId && (!t.taskAssignments || t.taskAssignments.length === 0))

  const late = tasks.filter((t) => {
    if (DONE.includes(t.status)) return false
    if (!t.scheduledDate) return false
    return t.scheduledDate.getTime() < now.getTime()
  })

  const jobs = tasks.map((t) => {
    const cleaner =
      personName(t.assignedUser) ||
      (t.taskAssignments?.[0] ? personName(t.taskAssignments[0].user) : null) ||
      "Unassigned"
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      scheduledDate: t.scheduledDate?.toISOString() ?? null,
      propertyAddress: t.property?.address ?? null,
      cleaner,
      unassigned: !t.assignedUserId && (!t.taskAssignments || t.taskAssignments.length === 0),
      late:
        !DONE.includes(t.status) &&
        !!t.scheduledDate &&
        t.scheduledDate.getTime() < now.getTime(),
    }
  })

  const dateLabel = start.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })

  const textLines = [
    `TidyFlow owner digest — ${company?.name || "Company"}`,
    dateLabel,
    "",
    `Jobs today: ${summary.total}`,
    `  Completed: ${summary.completed}`,
    `  In progress: ${summary.inProgress}`,
    `  Planned / assigned: ${summary.planned}`,
    `Late: ${late.length}`,
    `Unassigned: ${unassigned.length}`,
    "",
    ...jobs.slice(0, 40).map((j) => {
      const flags = [j.late ? "LATE" : null, j.unassigned ? "UNASSIGNED" : null].filter(Boolean).join(" ")
      return `• ${j.title} @ ${j.propertyAddress || "—"} — ${j.cleaner} [${j.status}]${flags ? ` (${flags})` : ""}`
    }),
  ]
  if (jobs.length > 40) textLines.push(`…and ${jobs.length - 40} more`)

  const plainText = textLines.join("\n")
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(plainText)}`

  return {
    companyName: company?.name || "Company",
    dateLabel,
    summary,
    lateCount: late.length,
    unassignedCount: unassigned.length,
    late: late.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      scheduledDate: t.scheduledDate?.toISOString() ?? null,
      propertyAddress: t.property?.address ?? null,
      cleaner: personName(t.assignedUser) || "Unassigned",
    })),
    unassigned: unassigned.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      scheduledDate: t.scheduledDate?.toISOString() ?? null,
      propertyAddress: t.property?.address ?? null,
    })),
    jobs,
    plainText,
    whatsappUrl,
  }
}

function digestHtml(digest: Awaited<ReturnType<typeof buildDigest>>) {
  const jobRows = digest.jobs
    .slice(0, 50)
    .map(
      (j) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #E4E9F0;font-size:13px;color:#0D1117;">${escapeHtml(j.title)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #E4E9F0;font-size:12px;color:#4A5568;">${escapeHtml(j.propertyAddress || "—")}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #E4E9F0;font-size:12px;color:#4A5568;">${escapeHtml(j.cleaner)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #E4E9F0;font-size:11px;font-weight:700;color:#0D1B2A;">${escapeHtml(j.status)}</td>
      </tr>`
    )
    .join("")

  return `
<!DOCTYPE html>
<html>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#F7F8FA;margin:0;padding:0;">
    <table width="100%" style="max-width:640px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E4E9F0;">
      <tr>
        <td style="background:#0D1B2A;padding:28px 24px;text-align:center;">
          <span style="color:#F59E0B;font-size:11px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;display:block;margin-bottom:6px;">OWNER DIGEST</span>
          <h1 style="color:#fff;font-size:22px;font-weight:700;margin:0;">${escapeHtml(digest.companyName)}</h1>
          <p style="color:rgba(255,255,255,0.7);font-size:13px;margin:8px 0 0;">${escapeHtml(digest.dateLabel)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:24px;">
          <table width="100%" style="margin-bottom:20px;">
            <tr>
              <td style="width:25%;padding:10px;background:#F7F8FA;border-radius:8px;text-align:center;">
                <div style="font-size:20px;font-weight:800;color:#0D1B2A;">${digest.summary.total}</div>
                <div style="font-size:10px;font-weight:700;color:#9AA5B4;text-transform:uppercase;">Jobs</div>
              </td>
              <td style="width:8px;"></td>
              <td style="width:25%;padding:10px;background:#ECFDF5;border-radius:8px;text-align:center;">
                <div style="font-size:20px;font-weight:800;color:#059669;">${digest.summary.completed}</div>
                <div style="font-size:10px;font-weight:700;color:#9AA5B4;text-transform:uppercase;">Done</div>
              </td>
              <td style="width:8px;"></td>
              <td style="width:25%;padding:10px;background:#FEF3C7;border-radius:8px;text-align:center;">
                <div style="font-size:20px;font-weight:800;color:#B45309;">${digest.lateCount}</div>
                <div style="font-size:10px;font-weight:700;color:#9AA5B4;text-transform:uppercase;">Late</div>
              </td>
              <td style="width:8px;"></td>
              <td style="width:25%;padding:10px;background:#FEE2E2;border-radius:8px;text-align:center;">
                <div style="font-size:20px;font-weight:800;color:#E11D48;">${digest.unassignedCount}</div>
                <div style="font-size:10px;font-weight:700;color:#9AA5B4;text-transform:uppercase;">Unassigned</div>
              </td>
            </tr>
          </table>
          ${
            digest.jobs.length
              ? `<table width="100%" cellpadding="0" cellspacing="0">${jobRows}</table>`
              : `<p style="color:#9AA5B4;font-size:14px;text-align:center;">No jobs scheduled for today.</p>`
          }
        </td>
      </tr>
      <tr>
        <td style="background:#F7F8FA;padding:18px;text-align:center;border-top:1px solid #E4E9F0;">
          <p style="margin:0;font-size:11px;color:#9AA5B4;">© ${new Date().getFullYear()} TidyFlow · Owner digest</p>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

async function authorize(request: NextRequest): Promise<
  | { error: NextResponse; companyId?: undefined; actor?: undefined }
  | { error?: undefined; companyId: number; actor: { id: number; email: string; role: UserRole; companyId: number | null; isActive: boolean } }
> {
  const auth = requireAuth(request)
  if (!auth) {
    return { error: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) }
  }
  const role = auth.tokenUser.role as UserRole
  if (!isManagerPlusRole(role)) {
    return { error: NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 }) }
  }
  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser)
  if (!companyId) {
    return { error: NextResponse.json({ success: false, message: "Company required" }, { status: 400 }) }
  }
  const actor = await resolveAuthenticatedUser(auth.tokenUser)
  if (!actor?.email) {
    return { error: NextResponse.json({ success: false, message: "User email required" }, { status: 400 }) }
  }
  return { companyId, actor }
}

/** GET — preview digest JSON (no email sent). */
export async function GET(request: NextRequest) {
  const gate = await authorize(request)
  if (gate.error) return gate.error

  const digest = await buildDigest(gate.companyId)
  return NextResponse.json({
    success: true,
    data: {
      ...digest,
      recipientEmail: gate.actor.email,
    },
  })
}

/** POST — send digest email to the current user; also returns whatsappUrl. */
export async function POST(request: NextRequest) {
  const gate = await authorize(request)
  if (gate.error) return gate.error

  const digest = await buildDigest(gate.companyId)
  const html = digestHtml(digest)
  const sent = await sendEmail({
    to: gate.actor.email,
    subject: `TidyFlow digest — ${digest.companyName} · ${digest.dateLabel}`,
    html,
  })

  if (!sent) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to send email",
        data: { whatsappUrl: digest.whatsappUrl, plainText: digest.plainText },
      },
      { status: 502 }
    )
  }

  return NextResponse.json({
    success: true,
    message: `Digest sent to ${gate.actor.email}`,
    data: {
      ...digest,
      recipientEmail: gate.actor.email,
      emailed: true,
    },
  })
}
