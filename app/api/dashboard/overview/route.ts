import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth, resolveCompanyId } from "@/lib/rbac"
import { UserRole } from "@prisma/client"

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

// GET /api/dashboard/overview
export async function GET(request: NextRequest) {
  const auth = requireAuth(request)

  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth
  const role = tokenUser.role as UserRole

  try {
    // Company-scoped for operators; platform roles may omit company to see all
    const companyId = resolveCompanyId(request, tokenUser)
    const isGlobal = [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.DEVELOPER].includes(role)

    if (!companyId && !isGlobal) {
      return NextResponse.json({ success: false, message: "No company scope" }, { status: 403 })
    }

    const where = companyId ? { companyId } : {}

    const now = new Date()
    const todayStart = startOfDay(now)
    const todayEnd = endOfDay(now)
    const weekEnd = endOfDay(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000))

    const todayWhere = {
      ...where,
      scheduledDate: { gte: todayStart, lte: todayEnd },
    }

    const [
      totalTasks,
      completedTasks,
      inProgressTasks,
      pendingTasks,
      totalProperties,
      totalCleaners,
      totalCompanies,
      todayJobs,
      todayCompleted,
      todayInProgress,
      upcomingJobs,
      openIssues,
      recentTasks,
      todayTasks,
      tasksByStatus,
      activeCleanersToday,
    ] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.count({
        where: { ...where, status: { in: ["APPROVED", "ARCHIVED", "COMPLETED"] } },
      }),
      prisma.task.count({
        where: { ...where, status: "IN_PROGRESS" },
      }),
      prisma.task.count({
        where: {
          ...where,
          status: { in: ["DRAFT", "PLANNED", "ASSIGNED", "SUBMITTED", "QA_REVIEW", "AWAITING", "RESERVED"] },
        },
      }),
      prisma.property.count({ where: { ...where, isActive: true } }),
      prisma.user.count({
        where: { ...where, role: UserRole.CLEANER, isActive: true },
      }),
      companyId ? Promise.resolve(1) : prisma.company.count(),
      prisma.task.count({ where: todayWhere }),
      prisma.task.count({
        where: {
          ...todayWhere,
          status: { in: ["APPROVED", "ARCHIVED", "COMPLETED"] },
        },
      }),
      prisma.task.count({
        where: { ...todayWhere, status: "IN_PROGRESS" },
      }),
      prisma.task.count({
        where: {
          ...where,
          scheduledDate: { gt: todayEnd, lte: weekEnd },
          status: { notIn: ["ARCHIVED", "REJECTED"] },
        },
      }),
      prisma.note.count({
        where: {
          noteType: "issue",
          status: { in: ["OPEN", "IN_PROGRESS"] },
          ...(companyId
            ? {
                OR: [{ task: { companyId } }, { property: { companyId } }],
              }
            : {}),
        },
      }),
      prisma.task.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          scheduledDate: true,
          property: { select: { address: true, clientName: true } },
          assignedUser: { select: { id: true, firstName: true, lastName: true } },
          taskAssignments: {
            select: {
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      }),
      prisma.task.findMany({
        where: todayWhere,
        orderBy: { scheduledDate: "asc" },
        take: 12,
        select: {
          id: true,
          title: true,
          status: true,
          scheduledDate: true,
          property: { select: { address: true, clientName: true } },
          assignedUser: { select: { id: true, firstName: true, lastName: true } },
          taskAssignments: {
            select: {
              user: { select: { id: true, firstName: true, lastName: true } },
              trackerActive: true,
            },
          },
        },
      }),
      prisma.task.groupBy({
        by: ["status"],
        where,
        _count: true,
      }),
      prisma.taskAssignment.findMany({
        where: {
          trackerActive: true,
          ...(companyId ? { task: { companyId } } : {}),
        },
        select: { userId: true },
        distinct: ["userId"],
      }),
    ])

    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0
    const todayCompletionRate = todayJobs > 0 ? (todayCompleted / todayJobs) * 100 : 0

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          totalTasks,
          completedTasks,
          inProgressTasks,
          pendingTasks,
          totalProperties,
          totalCleaners,
          totalCompanies,
          completionRate: completionRate.toFixed(1),
          todayJobs,
          todayCompleted,
          todayInProgress,
          upcomingJobs,
          openIssues,
          todayCompletionRate: todayCompletionRate.toFixed(1),
          activeCleanersToday: activeCleanersToday.length,
        },
        recentTasks,
        todayTasks,
        tasksByStatus: tasksByStatus.map((t) => ({
          status: t.status,
          count: t._count,
        })),
      },
    })
  } catch (error) {
    console.error("Dashboard overview error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}
