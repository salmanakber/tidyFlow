import prisma from "@/lib/prisma"
import {
  parseJson,
  DEFAULT_WEEKLY_HOURS,
  type WeeklyHours,
  type DayHours,
} from "@/lib/booking-widget"

function pad(n: number) {
  return String(n).padStart(2, "0")
}

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parseHm(hm: string): number {
  const [h, m] = hm.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}

function fromMinutes(mins: number): string {
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`
}

type Slot = { start: string; end: string; label: string }

export async function getAvailableSlotsForDay(opts: {
  companyId: number
  dateKey: string // YYYY-MM-DD
  durationMinutes: number
  weeklyHoursJson: string
  closedDatesJson: string
  slotIntervalMinutes: number
  minLeadHours: number
  bufferMinutes: number
  useCleanerAvailability: boolean
}): Promise<{ date: string; closed: boolean; reason?: string; slots: Slot[] }> {
  const weekly = parseJson<WeeklyHours>(opts.weeklyHoursJson, DEFAULT_WEEKLY_HOURS)
  const closedDates = parseJson<string[]>(opts.closedDatesJson, [])
  const date = new Date(`${opts.dateKey}T12:00:00`)
  if (Number.isNaN(date.getTime())) {
    return { date: opts.dateKey, closed: true, reason: "Invalid date", slots: [] }
  }

  if (closedDates.includes(opts.dateKey)) {
    return { date: opts.dateKey, closed: true, reason: "Closed", slots: [] }
  }

  const dayOfWeek = date.getDay() // 0 Sun
  const hours: DayHours = weekly[String(dayOfWeek)] ?? null
  if (!hours) {
    return { date: opts.dateKey, closed: true, reason: "Day off", slots: [] }
  }

  const now = new Date()
  const leadMs = opts.minLeadHours * 60 * 60 * 1000
  const earliest = new Date(now.getTime() + leadMs)

  const startMin = parseHm(hours.start)
  const endMin = parseHm(hours.end)
  const duration = Math.max(30, opts.durationMinutes || 120)
  const step = Math.max(15, opts.slotIntervalMinutes || 60)
  const buffer = Math.max(0, opts.bufferMinutes || 0)

  // Existing tasks that day (capacity / conflict)
  const dayStart = new Date(`${opts.dateKey}T00:00:00`)
  const dayEnd = new Date(`${opts.dateKey}T23:59:59`)
  const tasks = await prisma.task.findMany({
    where: {
      companyId: opts.companyId,
      scheduledDate: { gte: dayStart, lte: dayEnd },
      status: { notIn: ["REJECTED", "ARCHIVED"] as any },
    },
    select: {
      scheduledDate: true,
      estimatedDurationMinutes: true,
    },
  })

  const pendingBookings = await prisma.bookingRequest.findMany({
    where: {
      companyId: opts.companyId,
      status: { in: ["pending", "approved", "converted"] },
      requestedStart: { gte: dayStart, lte: dayEnd },
    },
    select: { requestedStart: true, requestedEnd: true },
  })

  let cleanerWindows: Array<{ start: number; end: number }> | null = null
  if (opts.useCleanerAvailability) {
    const cleaners = await prisma.user.findMany({
      where: { companyId: opts.companyId, role: "CLEANER", isActive: true },
      select: { id: true },
    })
    const cleanerIds = cleaners.map((c) => c.id)
    if (cleanerIds.length > 0) {
      const onLeave = await prisma.leaveRequest.findMany({
        where: {
          userId: { in: cleanerIds },
          status: "approved",
          startDate: { lte: dayEnd },
          endDate: { gte: dayStart },
        },
        select: { userId: true },
      })
      const leaveSet = new Set(onLeave.map((l) => l.userId))
      const availableIds = cleanerIds.filter((id) => !leaveSet.has(id))
      if (availableIds.length === 0) {
        return {
          date: opts.dateKey,
          closed: true,
          reason: "No cleaners available",
          slots: [],
        }
      }
      const avails = await prisma.cleanerAvailability.findMany({
        where: {
          userId: { in: availableIds },
          dayOfWeek,
          isAvailable: true,
        },
        select: { startTime: true, endTime: true },
      })
      if (avails.length > 0) {
        cleanerWindows = avails.map((a) => ({
          start: parseHm(a.startTime),
          end: parseHm(a.endTime),
        }))
      }
    }
  }

  const slots: Slot[] = []
  for (let t = startMin; t + duration <= endMin; t += step) {
    const slotStart = new Date(`${opts.dateKey}T${fromMinutes(t)}:00`)
    const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000)
    if (slotStart < earliest) continue

    if (cleanerWindows && cleanerWindows.length > 0) {
      const covered = cleanerWindows.some(
        (w) => t >= w.start && t + duration <= w.end
      )
      if (!covered) continue
    }

    // Overlap with tasks
    const overlapsTask = tasks.some((task) => {
      if (!task.scheduledDate) return false
      const ts = new Date(task.scheduledDate).getTime()
      const te =
        ts +
        (task.estimatedDurationMinutes || duration) * 60 * 1000 +
        buffer * 60 * 1000
      return slotStart.getTime() < te && slotEnd.getTime() > ts - buffer * 60 * 1000
    })
    if (overlapsTask) continue

    const overlapsBooking = pendingBookings.some((b) => {
      const bs = new Date(b.requestedStart).getTime()
      const be = b.requestedEnd
        ? new Date(b.requestedEnd).getTime()
        : bs + duration * 60 * 1000
      return slotStart.getTime() < be + buffer * 60 * 1000 && slotEnd.getTime() > bs
    })
    if (overlapsBooking) continue

    const label = slotStart.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })
    slots.push({
      start: slotStart.toISOString(),
      end: slotEnd.toISOString(),
      label,
    })
  }

  return {
    date: opts.dateKey,
    closed: slots.length === 0,
    reason: slots.length === 0 ? "No open slots" : undefined,
    slots,
  }
}

export async function getMonthAvailability(opts: {
  companyId: number
  year: number
  month: number // 1-12
  durationMinutes: number
  weeklyHoursJson: string
  closedDatesJson: string
  slotIntervalMinutes: number
  minLeadHours: number
  bufferMinutes: number
  useCleanerAvailability: boolean
  maxDaysAhead: number
}) {
  const daysInMonth = new Date(opts.year, opts.month, 0).getDate()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const maxDate = new Date(today)
  maxDate.setDate(maxDate.getDate() + (opts.maxDaysAhead || 60))

  const days: Array<{ date: string; available: boolean; slotCount: number }> = []
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${opts.year}-${pad(opts.month)}-${pad(d)}`
    const dayDate = new Date(`${dateKey}T12:00:00`)
    if (dayDate < today || dayDate > maxDate) {
      days.push({ date: dateKey, available: false, slotCount: 0 })
      continue
    }
    const result = await getAvailableSlotsForDay({
      companyId: opts.companyId,
      dateKey,
      durationMinutes: opts.durationMinutes,
      weeklyHoursJson: opts.weeklyHoursJson,
      closedDatesJson: opts.closedDatesJson,
      slotIntervalMinutes: opts.slotIntervalMinutes,
      minLeadHours: opts.minLeadHours,
      bufferMinutes: opts.bufferMinutes,
      useCleanerAvailability: opts.useCleanerAvailability,
    })
    days.push({
      date: dateKey,
      available: !result.closed && result.slots.length > 0,
      slotCount: result.slots.length,
    })
  }
  return days
}
