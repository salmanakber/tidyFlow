import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth } from "@/lib/rbac"
import { UserRole } from "@prisma/client"

const MANAGER_ROLES: UserRole[] = [
  UserRole.MANAGER,
  UserRole.OWNER,
  UserRole.COMPANY_ADMIN,
  UserRole.SUPER_ADMIN,
]

// POST /api/tasks/checklists - Add checklist item
export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const { taskId, title, order = 0 } = body

    if (!taskId || !title) {
      return NextResponse.json({ success: false, message: "taskId and title are required" }, { status: 400 })
    }

    const checklist = await prisma.checklistItem.create({
      data: {
        taskId: Number(taskId),
        title,
        order: Number(order),
      },
    })

    const task = await prisma.task.findUnique({
      where: { id: Number(taskId) },
      select: { companyId: true, status: true },
    })
    if (task) {
      const { emitTaskEvent } = await import("@/lib/realtime")
      const { notifyTaskActivity } = await import("@/lib/notifications")

      const role = auth.tokenUser.role as UserRole
      const shouldReopen =
        MANAGER_ROLES.includes(role) &&
        ["SUBMITTED", "APPROVED", "ASSIGNED"].includes(task.status)

      if (shouldReopen) {
        await prisma.task.update({
          where: { id: Number(taskId) },
          data: { status: "IN_PROGRESS" },
        })
        await emitTaskEvent("task:status", task.companyId, Number(taskId), {
          status: "IN_PROGRESS",
          userId: auth.tokenUser.userId,
          reason: "checklist_added",
        })
        await emitTaskEvent("task:updated", task.companyId, Number(taskId), {
          status: "IN_PROGRESS",
          userId: auth.tokenUser.userId,
          reason: "checklist_added",
        })
      }

      await emitTaskEvent("task:checklist", task.companyId, Number(taskId), {
        itemId: checklist.id,
        title: checklist.title,
        isCompleted: checklist.isCompleted,
        added: true,
      })
      await notifyTaskActivity({
        companyId: task.companyId,
        taskId: Number(taskId),
        title: "Checklist item added",
        message: `New checklist item "${title}" was added.`,
        type: "task_checklist",
        actorUserId: auth.tokenUser.userId,
        metadata: { itemId: checklist.id },
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, data: { checklist } }, { status: 201 })
  } catch (error) {
    console.error("Checklist POST error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}
