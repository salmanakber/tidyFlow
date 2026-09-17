import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

/**
 * Public read-only portal payload for a share token.
 * GET /api/share/[token]
 * Shape aligns with mobile ClientPortalScreen expectations.
 */
export async function GET(
  _request: NextRequest,
  context: { params: { token: string } }
) {
  const token = context.params?.token
  if (!token) {
    return NextResponse.json({ success: false, message: "Invalid link" }, { status: 400 })
  }

  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: {
      task: {
        include: {
          property: { select: { address: true, clientName: true } },
          company: { select: { name: true } },
          assignedUser: {
            select: { firstName: true, lastName: true },
          },
          photos: {
            select: {
              id: true,
              url: true,
              photoType: true,
              caption: true,
              takenAt: true,
            },
            orderBy: { takenAt: "asc" },
          },
          locationLogs: {
            orderBy: { createdAt: "asc" },
            take: 40,
            select: {
              latitude: true,
              longitude: true,
              withinGeofence: true,
              createdAt: true,
              checkType: true,
              distanceFromProperty: true,
            },
          },
          qaScores: {
            select: { overallScore: true },
            take: 5,
          },
          taskAssignments: {
            include: {
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  })

  if (!link?.task) {
    return NextResponse.json({ success: false, message: "Link expired or invalid" }, { status: 404 })
  }
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ success: false, message: "Link expired or invalid" }, { status: 410 })
  }

  await prisma.shareLink.update({
    where: { id: link.id },
    data: { viewCount: { increment: 1 } },
  })

  const task = link.task
  const logs = task.locationLogs || []
  const onSiteCount = logs.filter((l) => l.withinGeofence === true).length
  const lats = logs.map((l) => Number(l.latitude)).filter((n) => Number.isFinite(n))
  const lngs = logs.map((l) => Number(l.longitude)).filter((n) => Number.isFinite(n))
  const mapBounds =
    lats.length && lngs.length
      ? {
          minLat: Math.min(...lats),
          maxLat: Math.max(...lats),
          minLng: Math.min(...lngs),
          maxLng: Math.max(...lngs),
        }
      : null

  const qaScores = (task.qaScores || [])
    .map((q) => Number(q.overallScore))
    .filter((n) => Number.isFinite(n))
  const averageScore =
    qaScores.length > 0
      ? Math.round(qaScores.reduce((a, b) => a + b, 0) / qaScores.length)
      : null

  const cleaners = (task.taskAssignments || []).map((a) => ({
    name: [a.user?.firstName, a.user?.lastName].filter(Boolean).join(" ").trim() || "Cleaner",
    workMinutes: 0,
    startWithinGeofence: null as boolean | null,
  }))
  if (!cleaners.length && task.assignedUser) {
    cleaners.push({
      name:
        [task.assignedUser.firstName, task.assignedUser.lastName].filter(Boolean).join(" ").trim() ||
        "Cleaner",
      workMinutes: 0,
      startWithinGeofence: null,
    })
  }

  return NextResponse.json({
    success: true,
    data: {
      property: task.property,
      companyName: task.company?.name,
      assignedUser: task.assignedUser,
      completedAt: task.completedAt,
      averageScore,
      status: task.status,
      title: task.title,
      photos: (task.photos || []).map((p) => ({
        ...p,
        photoType: (p.photoType || "").toLowerCase(),
      })),
      proof: {
        cleaners,
        totalWorkMinutes: 0,
        gps: {
          checkpointCount: logs.length,
          onSiteCount,
          startOnSite: logs[0]?.withinGeofence === true,
          mapCheckpoints: logs.map((l) => ({
            latitude: Number(l.latitude),
            longitude: Number(l.longitude),
            recordedAt: l.createdAt,
            withinGeofence: l.withinGeofence,
          })),
          mapBounds,
          flaggedCheckpoints: logs
            .filter((l) => l.withinGeofence === false)
            .map((l) => ({
              latitude: Number(l.latitude),
              longitude: Number(l.longitude),
              recordedAt: l.createdAt,
            })),
        },
      },
    },
  })
}
