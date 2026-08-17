import prisma from './prisma';

export class PayrollLedgerLockedError extends Error {
  code = 'PAYROLL_LEDGER_LOCKED' as const;
  constructor(message = 'Hours are locked because payroll has been approved or paid.') {
    super(message);
    this.name = 'PayrollLedgerLockedError';
  }
}

/** Lock all approved/paid source hours for a payroll period when payroll is approved or paid. */
export async function lockHoursForPayrollRecord(
  payrollRecordId: number,
  userId: number,
  periodStart: Date,
  periodEnd: Date,
  lockedBy: number,
) {
  const now = new Date();
  const start = new Date(periodStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(periodEnd);
  end.setHours(23, 59, 59, 999);

  await prisma.workingHoursSubmission.updateMany({
    where: {
      userId,
      date: { gte: start, lte: end },
      status: { in: ['approved', 'paid'] },
      lockedAt: null,
    },
    data: {
      lockedAt: now,
      lockedBy,
      payrollRecordId,
      status: 'locked',
    },
  });

  await prisma.payrollRecord.update({
    where: { id: payrollRecordId },
    data: { lockedAt: now, lockedBy },
  });
}

export async function isHoursDateLocked(userId: number, date: Date): Promise<boolean> {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const locked = await prisma.workingHoursSubmission.findFirst({
    where: {
      userId,
      date: { gte: dayStart, lte: dayEnd },
      lockedAt: { not: null },
    },
    select: { id: true },
  });
  return Boolean(locked);
}

export async function assertHoursEditable(userId: number, date: Date) {
  if (await isHoursDateLocked(userId, date)) {
    throw new PayrollLedgerLockedError();
  }
}

export async function assertSubmissionEditable(submissionId: number) {
  const row = await prisma.workingHoursSubmission.findUnique({
    where: { id: submissionId },
    select: { lockedAt: true, status: true },
  });
  if (!row) return;
  if (row.lockedAt || row.status === 'locked') {
    throw new PayrollLedgerLockedError();
  }
}

export async function assertUserHasNoLockedPayrollInPeriod(
  userId: number,
  periodStart: Date,
  periodEnd: Date,
) {
  const lockedPayroll = await prisma.payrollRecord.findFirst({
    where: {
      userId,
      periodStart: { lte: periodEnd },
      periodEnd: { gte: periodStart },
      status: { in: ['approved', 'paid'] },
      lockedAt: { not: null },
    },
    select: { id: true },
  });
  if (lockedPayroll) {
    throw new PayrollLedgerLockedError(
      'Cannot modify hours for a period with approved or paid payroll.',
    );
  }
}
