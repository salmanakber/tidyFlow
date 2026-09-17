import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import prisma from "@/lib/prisma"
import { requireAuth, resolveCompanyIdAsync } from "@/lib/rbac"
import { UserRole } from "@prisma/client"

function baseUrl(request: NextRequest) {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL
  if (env) return env.replace(/\/$/, "")
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host")
  const proto = request.headers.get("x-forwarded-proto") || "https"
  return host ? `${proto}://${host}` : "https://app.tidyflowapp.com"
}

/**
 * Mobile-compatible share APIs (additive implementation).
 * GET  /api/share?taskId=
 * POST /api/share { taskId }
 * Does not change request/response contracts mobile already expects.
 */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  const taskId = parseInt(new URL(request.url).searchParams.get("taskId") || "", 10)
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ success: false, message: "taskId required" }, { status: 400 })
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser)
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      ...(companyId ? { companyId } : {}),
    },
    include: {
      property: { select: { address: true } },
      shareLinks: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  })

  if (!task) {
    return NextResponse.json({ success: false, message: "Task not found" }, { status: 404 })
  }

  const existing = task.shareLinks[0]
  const link = existing
    ? `${baseUrl(request)}/share/${existing.token}`
    : null

  return NextResponse.json({
    success: true,
    data: {
      taskId: task.id,
      taskTitle: task.title,
      propertyAddress: task.property?.address || "",
      canShare: true,
      shareLink: link,
    },
  })
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  const role = auth.tokenUser.role as UserRole
  const allowed: UserRole[] = [
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.COMPANY_ADMIN,
    UserRole.DEVELOPER,
    UserRole.SUPER_ADMIN,
  ]
  if (!allowed.includes(role)) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const taskId = parseInt(String(body.taskId || ""), 10)
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ success: false, message: "taskId required" }, { status: 400 })
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser)
  const task = await prisma.task.findFirst({
    where: { id: taskId, ...(companyId ? { companyId } : {}) },
    include: { shareLinks: { orderBy: { createdAt: "desc" }, take: 1 } },
  })
  if (!task) {
    return NextResponse.json({ success: false, message: "Task not found" }, { status: 404 })
  }

  let token = task.shareLinks[0]?.token
  let reused = true
  if (!token) {
    token = crypto.randomBytes(24).toString("hex")
    const expires = new Date()
    expires.setDate(expires.getDate() + 90)
    await prisma.shareLink.create({
      data: { taskId: task.id, token, expiresAt: expires },
    })
    reused = false
    try {
      await prisma.auditLog.create({
        data: {
          companyId: task.companyId,
          userId: auth.tokenUser.userId,
          action: "share.create",
          entityType: "task",
          entityId: String(task.id),
          newValues: JSON.stringify({ token: token.slice(0, 8) + "…" }),
        },
      })
    } catch {
      /* audit optional */
    }
  }

  const shareLink = `${baseUrl(request)}/share/${token}`
  return NextResponse.json({
    success: true,
    data: { shareLink, reused, taskId: task.id },
  })
}
