import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';

type MarginBucket = {
  key: string;
  label: string;
  propertyId: number | null;
  clientName: string | null;
  address: string | null;
  cashRevenue: number;
  accrualRevenue: number;
  expenses: number;
  cogs: number;
  laborMinutes: number;
  laborCost: number;
  jobCount: number;
  revenue: number;
  margin: number;
  marginPct: number | null;
};

function emptyBucket(
  key: string,
  label: string,
  propertyId: number | null,
  clientName: string | null,
  address: string | null
): MarginBucket {
  return {
    key,
    label,
    propertyId,
    clientName,
    address,
    cashRevenue: 0,
    accrualRevenue: 0,
    expenses: 0,
    cogs: 0,
    laborMinutes: 0,
    laborCost: 0,
    jobCount: 0,
    revenue: 0,
    margin: 0,
    marginPct: null,
  };
}

function finalizeBuckets(map: Map<string, MarginBucket>, laborCost: number, useCash: boolean): MarginBucket[] {
  const totalMinutes = Array.from(map.values()).reduce((s, b) => s + b.laborMinutes, 0);
  const jobBuckets = Array.from(map.values()).filter((x) => x.jobCount > 0).length || 1;
  const buckets = Array.from(map.values()).map((b) => {
    const allocatedLabor =
      totalMinutes > 0 && laborCost > 0
        ? (laborCost * b.laborMinutes) / totalMinutes
        : laborCost > 0 && b.jobCount > 0
          ? laborCost / jobBuckets
          : 0;
    const rowRevenue = useCash
      ? b.cashRevenue > 0
        ? b.cashRevenue
        : b.cashRevenue || b.accrualRevenue
      : b.accrualRevenue;
    const labor = Math.round(allocatedLabor * 100) / 100;
    const cogs = Math.round(b.cogs * 100) / 100;
    const margin = Math.round((rowRevenue - b.expenses - labor - cogs) * 100) / 100;
    return {
      ...b,
      laborCost: labor,
      cogs,
      revenue: Math.round(rowRevenue * 100) / 100,
      margin,
      marginPct: rowRevenue > 0 ? Math.round((margin / rowRevenue) * 1000) / 10 : null,
      cashRevenue: Math.round(b.cashRevenue * 100) / 100,
      accrualRevenue: Math.round(b.accrualRevenue * 100) / 100,
      expenses: Math.round(b.expenses * 100) / 100,
    };
  });

  return buckets
    .filter(
      (b) =>
        b.jobCount > 0 ||
        b.cashRevenue > 0 ||
        b.accrualRevenue > 0 ||
        b.expenses > 0 ||
        b.cogs > 0
    )
    .sort((a, b) => b.margin - a.margin);
}

/**
 * GET /api/revenue/report
 * Revenue & profit report with accrual/cash P&L plus margin by property and client.
 */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { tokenUser } = auth;
    const companyId = tokenUser.companyId;
    if (!companyId) {
      return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);

    const fromDate = searchParams.get('from')
      ? new Date(searchParams.get('from')!)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const toDate = searchParams.get('to') ? new Date(searchParams.get('to')!) : new Date();
    toDate.setHours(23, 59, 59, 999);

    const [revenueTasks, expenses, paidInvoices, unpaidInvoices, payrollRecords, assignments, supplyUsages] =
      await Promise.all([
      prisma.task.findMany({
        where: {
          companyId,
          status: { in: ['APPROVED', 'SUBMITTED', 'COMPLETED', 'ARCHIVED'] },
          scheduledDate: { gte: fromDate, lte: toDate },
        },
        select: {
          id: true,
          title: true,
          budget: true,
          status: true,
          scheduledDate: true,
          propertyId: true,
          property: {
            select: { id: true, address: true, clientName: true, clientEmail: true },
          },
        },
        orderBy: { scheduledDate: 'desc' },
      }),
      prisma.expense.findMany({
        where: {
          companyId,
          createdAt: { gte: fromDate, lte: toDate },
        },
        select: {
          id: true,
          amount: true,
          category: true,
          description: true,
          createdAt: true,
          taskId: true,
          task: {
            select: {
              title: true,
              propertyId: true,
              property: { select: { id: true, address: true, clientName: true, clientEmail: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.clientInvoice.findMany({
        where: {
          companyId,
          status: 'paid',
          OR: [
            { paidAt: { gte: fromDate, lte: toDate } },
            { paidAt: null, updatedAt: { gte: fromDate, lte: toDate } },
          ],
        },
        select: {
          id: true,
          invoiceNumber: true,
          clientName: true,
          totalAmount: true,
          paidAt: true,
          updatedAt: true,
          status: true,
          propertyId: true,
          property: { select: { id: true, address: true, clientName: true, clientEmail: true } },
          invoiceTasks: {
            select: {
              task: {
                select: {
                  propertyId: true,
                  property: { select: { id: true, address: true, clientName: true, clientEmail: true } },
                },
              },
            },
          },
        },
        orderBy: { paidAt: 'desc' },
      }),
      prisma.clientInvoice.findMany({
        where: {
          companyId,
          status: { in: ['draft', 'sent'] },
        },
        select: {
          id: true,
          invoiceNumber: true,
          clientName: true,
          totalAmount: true,
          status: true,
          dueDate: true,
          sentAt: true,
          createdAt: true,
          propertyId: true,
          property: { select: { address: true } },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 100,
      }),
      prisma.payrollRecord.findMany({
        where: {
          companyId,
          status: { in: ['approved', 'paid'] },
          OR: [
            { periodStart: { gte: fromDate, lte: toDate } },
            { periodEnd: { gte: fromDate, lte: toDate } },
            { paymentDate: { gte: fromDate, lte: toDate } },
          ],
        },
        select: {
          id: true,
          netSalary: true,
          totalAmount: true,
          status: true,
          periodStart: true,
          periodEnd: true,
          paymentDate: true,
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.taskAssignment.findMany({
        where: {
          task: {
            companyId,
            status: { in: ['APPROVED', 'SUBMITTED', 'COMPLETED', 'ARCHIVED'] },
            OR: [
              { scheduledDate: { gte: fromDate, lte: toDate } },
              { completedAt: { gte: fromDate, lte: toDate } },
            ],
          },
          OR: [{ durationMinutes: { not: null } }, { editedDurationMinutes: { not: null } }],
        },
        select: {
          editedDurationMinutes: true,
          durationMinutes: true,
          task: {
            select: {
              propertyId: true,
              property: { select: { id: true, address: true, clientName: true, clientEmail: true } },
            },
          },
        },
      }),
      prisma.supplyUsage.findMany({
        where: {
          createdAt: { gte: fromDate, lte: toDate },
          supplyItem: { companyId },
        },
        select: {
          quantity: true,
          taskId: true,
          supplyItem: { select: { unitCost: true, name: true } },
          task: {
            select: {
              propertyId: true,
              property: { select: { id: true, address: true, clientName: true, clientEmail: true } },
            },
          },
        },
      }),
    ]);

    const accrualRevenue = revenueTasks.reduce(
      (sum, task) => sum + (task.budget ? Number(task.budget) : 0),
      0
    );
    const cashRevenue = paidInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
    const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    const laborCost = payrollRecords.reduce((sum, p) => {
      const amount = p.netSalary != null ? Number(p.netSalary) : Number(p.totalAmount || 0);
      return sum + amount;
    }, 0);

    const supplyCogs = supplyUsages.reduce((sum, u) => {
      const unitCost = u.supplyItem.unitCost != null ? Number(u.supplyItem.unitCost) : 0;
      return sum + unitCost * u.quantity;
    }, 0);

    const now = new Date();
    const outstandingInvoices = unpaidInvoices.filter((inv) => inv.status === 'sent' || inv.status === 'draft');
    const outstandingAR = outstandingInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
    const overdueAR = outstandingInvoices
      .filter((inv) => inv.dueDate && new Date(inv.dueDate) < now)
      .reduce((sum, inv) => sum + Number(inv.totalAmount), 0);

    const useCash = cashRevenue > 0;
    const primaryRevenue = useCash ? cashRevenue : accrualRevenue;
    const netProfit = primaryRevenue - totalExpenses - laborCost - supplyCogs;
    const accrualProfit = accrualRevenue - totalExpenses - laborCost - supplyCogs;

    const byProperty = new Map<string, MarginBucket>();
    const byClient = new Map<string, MarginBucket>();

    const ensureProperty = (propertyId: number | null | undefined, address?: string | null, clientName?: string | null) => {
      const id = propertyId ?? 0;
      const key = `prop:${id || 'none'}`;
      if (!byProperty.has(key)) {
        byProperty.set(
          key,
          emptyBucket(key, address || (id ? `Property #${id}` : 'Unassigned'), id || null, clientName || null, address || null)
        );
      }
      return byProperty.get(key)!;
    };

    const ensureClient = (clientName?: string | null, clientEmail?: string | null, address?: string | null) => {
      const label = clientName || clientEmail || address || 'Unknown client';
      const key = `client:${(clientEmail || clientName || address || 'unknown').trim().toLowerCase()}`;
      if (!byClient.has(key)) {
        byClient.set(key, emptyBucket(key, label, null, clientName || null, address || null));
      }
      return byClient.get(key)!;
    };

    for (const task of revenueTasks) {
      const budget = task.budget ? Number(task.budget) : 0;
      const p = ensureProperty(task.propertyId, task.property?.address, task.property?.clientName);
      p.accrualRevenue += budget;
      p.jobCount += 1;
      const c = ensureClient(task.property?.clientName, task.property?.clientEmail, task.property?.address);
      c.accrualRevenue += budget;
      c.jobCount += 1;
    }

    for (const inv of paidInvoices) {
      const amount = Number(inv.totalAmount);
      const linkedProps = inv.invoiceTasks?.length
        ? inv.invoiceTasks.map((l) => l.task.property)
        : inv.property
          ? [inv.property]
          : [];

      if (linkedProps.length === 0) {
        const p = ensureProperty(inv.propertyId, null, inv.clientName);
        p.cashRevenue += amount;
        const c = ensureClient(inv.clientName, null, null);
        c.cashRevenue += amount;
        continue;
      }

      const share = amount / linkedProps.length;
      for (const prop of linkedProps) {
        if (!prop) continue;
        const p = ensureProperty(prop.id, prop.address, prop.clientName);
        p.cashRevenue += share;
        const c = ensureClient(prop.clientName || inv.clientName, prop.clientEmail, prop.address);
        c.cashRevenue += share;
      }
    }

    for (const expense of expenses) {
      const amount = Number(expense.amount);
      const prop = expense.task?.property;
      if (prop) {
        ensureProperty(prop.id, prop.address, prop.clientName).expenses += amount;
        ensureClient(prop.clientName, prop.clientEmail, prop.address).expenses += amount;
      } else {
        ensureProperty(null, 'Company / unallocated', null).expenses += amount;
        ensureClient('Company / unallocated', null, null).expenses += amount;
      }
    }

    for (const usage of supplyUsages) {
      const unitCost = usage.supplyItem.unitCost != null ? Number(usage.supplyItem.unitCost) : 0;
      const cost = unitCost * usage.quantity;
      if (cost <= 0) continue;
      const prop = usage.task?.property;
      if (prop) {
        ensureProperty(prop.id, prop.address, prop.clientName).cogs += cost;
        ensureClient(prop.clientName, prop.clientEmail, prop.address).cogs += cost;
      } else {
        ensureProperty(null, 'Company / unallocated', null).cogs += cost;
        ensureClient('Company / unallocated', null, null).cogs += cost;
      }
    }

    for (const a of assignments) {
      const minutes = a.editedDurationMinutes ?? a.durationMinutes ?? 0;
      if (minutes <= 0) continue;
      const prop = a.task.property;
      ensureProperty(a.task.propertyId, prop?.address, prop?.clientName).laborMinutes += minutes;
      ensureClient(prop?.clientName, prop?.clientEmail, prop?.address).laborMinutes += minutes;
    }

    const marginByProperty = finalizeBuckets(byProperty, laborCost, useCash);
    const marginByClient = finalizeBuckets(byClient, laborCost, useCash);

    const revenueByDate: { [key: string]: number } = {};
    const expensesByDate: { [key: string]: number } = {};
    const cashByDate: { [key: string]: number } = {};
    const laborByDate: { [key: string]: number } = {};

    revenueTasks.forEach((task) => {
      if (task.scheduledDate) {
        const dateKey = new Date(task.scheduledDate).toISOString().split('T')[0];
        revenueByDate[dateKey] =
          (revenueByDate[dateKey] || 0) + (task.budget ? Number(task.budget) : 0);
      }
    });

    expenses.forEach((expense) => {
      const dateKey = new Date(expense.createdAt).toISOString().split('T')[0];
      expensesByDate[dateKey] = (expensesByDate[dateKey] || 0) + Number(expense.amount);
    });

    paidInvoices.forEach((inv) => {
      const d = inv.paidAt || inv.updatedAt;
      if (!d) return;
      const dateKey = new Date(d).toISOString().split('T')[0];
      cashByDate[dateKey] = (cashByDate[dateKey] || 0) + Number(inv.totalAmount);
    });

    payrollRecords.forEach((p) => {
      const d = p.paymentDate || p.periodEnd || p.periodStart;
      if (!d) return;
      const dateKey = new Date(d).toISOString().split('T')[0];
      const amount = p.netSalary != null ? Number(p.netSalary) : Number(p.totalAmount || 0);
      laborByDate[dateKey] = (laborByDate[dateKey] || 0) + amount;
    });

    const allDates: string[] = [];
    const currentDate = new Date(fromDate);
    while (currentDate <= toDate) {
      allDates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const chartData = allDates.map((date) => {
      const revenue = useCash ? cashByDate[date] || 0 : revenueByDate[date] || 0;
      const expense = (expensesByDate[date] || 0) + (laborByDate[date] || 0);
      return {
        date,
        revenue,
        expenses: expense,
        profit: revenue - expense,
        accrualRevenue: revenueByDate[date] || 0,
        cashRevenue: cashByDate[date] || 0,
        laborCost: laborByDate[date] || 0,
      };
    });

    const expensesByCategory: { [key: string]: number } = {};
    expenses.forEach((expense) => {
      expensesByCategory[expense.category] =
        (expensesByCategory[expense.category] || 0) + Number(expense.amount);
    });
    if (laborCost > 0) {
      expensesByCategory['Payroll / labor'] =
        (expensesByCategory['Payroll / labor'] || 0) + laborCost;
    }
    if (supplyCogs > 0) {
      expensesByCategory['Supplies (COGS)'] =
        (expensesByCategory['Supplies (COGS)'] || 0) + supplyCogs;
    }

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalRevenue: primaryRevenue,
          accrualRevenue,
          cashRevenue,
          totalExpenses,
          laborCost,
          supplyCogs: Math.round(supplyCogs * 100) / 100,
          operatingExpenses: totalExpenses,
          netProfit,
          accrualProfit,
          revenueBasis: useCash ? 'cash' : 'accrual',
          outstandingAR: Math.round(outstandingAR * 100) / 100,
          overdueAR: Math.round(overdueAR * 100) / 100,
          unpaidInvoiceCount: outstandingInvoices.length,
          revenueTasksCount: revenueTasks.length,
          paidInvoicesCount: paidInvoices.length,
          payrollRecordsCount: payrollRecords.length,
          expensesCount: expenses.length,
        },
        marginByProperty,
        marginByClient,
        unpaidInvoices: outstandingInvoices.slice(0, 40).map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          clientName: inv.clientName,
          amount: Number(inv.totalAmount),
          status: inv.status,
          dueDate: inv.dueDate,
          sentAt: inv.sentAt,
          createdAt: inv.createdAt,
          overdue: !!(inv.dueDate && new Date(inv.dueDate) < now),
          propertyAddress: inv.property?.address || null,
        })),
        revenue: revenueTasks.map((task) => ({
          id: task.id,
          title: task.title,
          amount: task.budget ? Number(task.budget) : 0,
          status: task.status,
          date: task.scheduledDate,
          propertyAddress: task.property?.address || 'N/A',
          source: 'task_budget',
        })),
        paidInvoices: paidInvoices.map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          clientName: inv.clientName,
          amount: Number(inv.totalAmount),
          date: inv.paidAt || inv.updatedAt,
          source: 'invoice_paid',
        })),
        payroll: payrollRecords.map((p) => ({
          id: p.id,
          amount: p.netSalary != null ? Number(p.netSalary) : Number(p.totalAmount || 0),
          status: p.status,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          paymentDate: p.paymentDate,
          cleanerName: [p.user?.firstName, p.user?.lastName].filter(Boolean).join(' ') || 'Cleaner',
        })),
        expenses: expenses.map((expense) => ({
          id: expense.id,
          amount: Number(expense.amount),
          category: expense.category,
          description: expense.description,
          date: expense.createdAt,
          taskTitle: expense.task?.title || null,
        })),
        chartData,
        expensesByCategory: Object.entries(expensesByCategory).map(([category, amount]) => ({
          category,
          amount,
        })),
        dateRange: {
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        },
      },
    });
  } catch (error: any) {
    console.error('Error generating revenue report:', error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}
