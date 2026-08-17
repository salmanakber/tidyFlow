import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { createNotification } from '@/lib/notifications';
import { getCompanyInvoiceSettings } from '@/lib/invoice-settings';
import {
  calcProRataSalary,
  countUnpaidLeaveDays,
} from '@/lib/payroll-calculations';
import {
  findActiveRulesForPeriod,
  rulesToSnapshots,
  createLineItemsForPayroll,
  recalcPayrollTotals,
  legacySummaryFromRecalc,
  type OneTimeLineItemInput,
  type PayrollLineItemSnapshot,
} from '@/lib/payroll-rules';

/**
 * POST /api/payroll/generate
 * Auto-generate payroll records for cleaners and managers based on completed tasks or fixed salary
 */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.COMPANY_ADMIN && role !== UserRole.MANAGER) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { 
      periodStart: startDate, 
      periodEnd: endDate, 
      userIds, // Array of user IDs to generate payroll for
      fixedSalary, // Fixed salary amount (used when multiple users selected or single user with fixed salary)
      payrollType, // 'hourly' or 'fixed' - explicitly set by user
      hourlyRate, // Hourly rate for hourly employees
      overtimeHours,
      overtimeRate,
      useAutoTax = true,
      autoApproveHours = false,
      employeeAdjustments = {}, // { [userId]: OneTimeLineItemInput[] }
    } = body;

    if (!startDate || !endDate) {
      return NextResponse.json({ success: false, message: 'periodStart and periodEnd are required' }, { status: 400 });
    }

    const companyId = requireCompanyScope(tokenUser);
    if (!companyId) return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });

    const invoiceSettings = await getCompanyInvoiceSettings(companyId);

    const periodStart = new Date(startDate);
    const periodEnd = new Date(endDate);
    periodEnd.setHours(23, 59, 59, 999);

    // Get employees - either selected userIds or all cleaners/managers
    let employees;
    if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      employees = await prisma.user.findMany({
        where: {
          id: { in: userIds.map((id: any) => parseInt(id)) },
          companyId,
          isActive: true,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          defaultHourlyRate: true,
          basicSalary: true,
          payrollWorkerType: true,
          hireDate: true,
        },
      });
    } else {
      // Default: get all cleaners
      employees = await prisma.user.findMany({
        where: {
          companyId,
          role: UserRole.CLEANER,
          isActive: true,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          defaultHourlyRate: true,
          basicSalary: true,
          payrollWorkerType: true,
          hireDate: true,
        },
      });
    }

    if (employees.length === 0) {
      return NextResponse.json({ success: false, message: 'No employees found' }, { status: 400 });
    }

    const payrollRecordsToCreate = [];
    const errors = [];
    const createdPayrollRecords: any[] = [];

    for (const employee of employees) {
      try {
        if (autoApproveHours) {
          await prisma.workingHoursSubmission.updateMany({
            where: {
              userId: employee.id,
              companyId,
              date: { gte: periodStart, lte: periodEnd },
              status: 'pending',
            },
            data: {
              status: 'approved',
              approvedBy: tokenUser.userId,
              approvedAt: new Date(),
            },
          });
        }

        // Check if payroll record already exists for this period
        const existing = await prisma.payrollRecord.findFirst({
          where: {
            userId: employee.id,
            periodStart: periodStart,
            periodEnd: periodEnd,
          },
        });

        if (existing) {
          errors.push(`Payroll already exists for ${employee.firstName} ${employee.lastName}`);
          continue;
        }

        // Determine payroll type and amount
        let finalPayrollType: 'hourly' | 'fixed' = 'hourly';
        let finalFixedSalary: number | null = null;
        let finalHourlyRate: number | null = null;
        let totalHours = 0;
        let totalAmount = 0;

        // If payrollType is explicitly provided, use it
        if (payrollType === 'fixed') {
          finalPayrollType = 'fixed';
          const salary = fixedSalary && fixedSalary > 0
            ? Number(fixedSalary)
            : employee.basicSalary
              ? Number(employee.basicSalary)
              : null;
          if (!salary || salary <= 0) {
            errors.push(`Fixed salary required for ${employee.firstName} ${employee.lastName}`);
            continue;
          }
          const unpaidLeaveDays = await countUnpaidLeaveDays(employee.id, periodStart, periodEnd);
          const proRata = calcProRataSalary(
            salary,
            periodStart,
            periodEnd,
            employee.hireDate,
            unpaidLeaveDays,
          );
          finalFixedSalary = proRata.proRataSalary;
          totalAmount = finalFixedSalary;
        } else {
          // Hourly payroll - use submitted working hours
          finalPayrollType = 'hourly';

          // Get approved working hours only (auto-logged hours require manager approval)
          const workingHours = await prisma.workingHoursSubmission.findMany({
            where: {
              userId: employee.id,
              date: {
                gte: periodStart,
                lte: periodEnd,
              },
              status: 'approved',
            },
            select: {
              hours: true,
              status: true,
            },
          });

          const pendingInPeriod = await prisma.workingHoursSubmission.count({
            where: {
              userId: employee.id,
              date: { gte: periodStart, lte: periodEnd },
              status: 'pending',
            },
          });

          // Calculate total hours from approved submissions
          totalHours = workingHours.reduce((sum, wh) => sum + Number(wh.hours), 0);

          // Fallback: sum GPS-tracked task assignment durations (approved submissions only path preferred)
          if (totalHours === 0 && pendingInPeriod === 0) {
            const { sumTaskHoursForPeriod } = await import('@/lib/task-time-log');
            totalHours = await sumTaskHoursForPeriod(employee.id, periodStart, periodEnd);
          }

          if (totalHours === 0) {
            if (pendingInPeriod > 0) {
              errors.push(
                `${employee.firstName} ${employee.lastName} has ${pendingInPeriod} day(s) of hours awaiting approval — approve before generating payroll`
              );
            } else {
              errors.push(`No approved working hours for ${employee.firstName} ${employee.lastName} in this period`);
            }
            continue;
          }

          // Get hourly rate
          if (hourlyRate && hourlyRate > 0) {
            finalHourlyRate = Number(hourlyRate);
          } else if (employee.defaultHourlyRate) {
            finalHourlyRate = Number(employee.defaultHourlyRate);
          } else {
            // Try to get from most recent payroll record
            const recentPayroll = await prisma.payrollRecord.findFirst({
              where: { userId: employee.id },
              orderBy: { createdAt: 'desc' },
              select: { hourlyRate: true },
            });
            finalHourlyRate = recentPayroll?.hourlyRate ? Number(recentPayroll.hourlyRate) : 12.50; // Default
          }

          // Calculate amount (with overtime if applicable)
          const weeksInPeriod = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
          const averageWeeklyHours = totalHours / Math.max(weeksInPeriod, 1);
          
          let regularHours = totalHours;
          let calculatedOvertimeHours = 0;
          
          if (averageWeeklyHours > 40) {
            const totalWeeks = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
            const regularHoursTotal = totalWeeks * 40;
            regularHours = Math.min(totalHours, regularHoursTotal);
            calculatedOvertimeHours = Math.max(0, totalHours - regularHoursTotal);
          }

          const regularPay = regularHours * finalHourlyRate;
          const otPayFromCalc = calculatedOvertimeHours * finalHourlyRate * 1.5;
          totalAmount = regularPay + otPayFromCalc;
        }

        // Overtime (additional beyond auto-calculated hourly OT)
        let otHours = Number(overtimeHours) || 0;
        let otRate = 0;
        let otAmount = 0;
        if (finalPayrollType === 'fixed') {
          otRate = Number(overtimeRate) || 0;
        } else {
          otRate = Number(overtimeRate) || (finalHourlyRate ? finalHourlyRate * 1.5 : 0);
        }
        otAmount = otHours * otRate;

        // Active recurring rules for this employee + period
        const activeRules = await findActiveRulesForPeriod(
          employee.id,
          companyId,
          periodStart,
          periodEnd,
        );
        const ruleSnapshots = rulesToSnapshots(activeRules);

        // One-time adjustments from request (per employee)
        const adjustmentsRaw = (employeeAdjustments as Record<string, OneTimeLineItemInput[]>)?.[String(employee.id)]
          || (employeeAdjustments as Record<string, OneTimeLineItemInput[]>)?.[employee.id as unknown as string]
          || [];
        const oneTimeSnapshots: PayrollLineItemSnapshot[] = (Array.isArray(adjustmentsRaw) ? adjustmentsRaw : []).map((a) => ({
          sourceRuleId: null,
          name: String(a.name).trim(),
          type: a.type,
          amount: Number(a.amount),
          isRecurring: false,
          description: a.description ?? null,
        }));

        const allSnapshots = [...ruleSnapshots, ...oneTimeSnapshots];

        const totals = recalcPayrollTotals(
          allSnapshots,
          {
            payrollType: finalPayrollType,
            hoursWorked: finalPayrollType === 'hourly' ? parseFloat(totalHours.toFixed(2)) : null,
            hourlyRate: finalPayrollType === 'hourly' ? finalHourlyRate : null,
            fixedSalary: finalPayrollType === 'fixed' ? finalFixedSalary : null,
            overtimeAmount: otAmount,
            payrollWorkerType: employee.payrollWorkerType,
            companyId,
            useAutoTax,
          },
          invoiceSettings.payrollTaxRules,
          invoiceSettings.payrollDefaultTaxRuleId,
          invoiceSettings.payrollTaxEnabled,
        );

        const legacy = legacySummaryFromRecalc(totals, allSnapshots);

        payrollRecordsToCreate.push({
          userId: employee.id,
          companyId,
          periodStart,
          periodEnd,
          payrollType: finalPayrollType,
          hoursWorked: finalPayrollType === 'hourly' ? parseFloat(totalHours.toFixed(2)) : null,
          hourlyRate: finalPayrollType === 'hourly' ? finalHourlyRate : null,
          fixedSalary: finalPayrollType === 'fixed' ? finalFixedSalary : null,
          status: 'pending',
          ...(otHours ? { overtimeHours: otHours } : {}),
          ...(otRate ? { overtimeRate: otRate } : {}),
          ...(otAmount ? { overtimeAmount: otAmount } : {}),
          ...legacy,
          lineItemSnapshots: allSnapshots,
          employeeFirstName: employee.firstName,
          employeeLastName: employee.lastName,
        } as any);
      } catch (error: any) {
        errors.push(`Error processing ${employee.firstName} ${employee.lastName}: ${error.message}`);
      }
    }

    if (payrollRecordsToCreate.length > 0) {
      // Create payroll records and corresponding expense entries
      for (const payrollDataWithEmployee of payrollRecordsToCreate) {
        const {
          employeeFirstName,
          employeeLastName,
          lineItemSnapshots,
          ...payrollDataToCreate
        } = payrollDataWithEmployee as any;

        try {
          const payrollRecord = await prisma.payrollRecord.create({
            data: payrollDataToCreate as any,
          });

          if (lineItemSnapshots?.length) {
            await createLineItemsForPayroll(payrollRecord.id, lineItemSnapshots);
          }

          if (payrollDataToCreate.payrollType === 'hourly') {
            await prisma.workingHoursSubmission.updateMany({
              where: {
                userId: payrollDataToCreate.userId,
                companyId: payrollDataToCreate.companyId,
                date: { gte: periodStart, lte: periodEnd },
                status: 'approved',
                payrollRecordId: null,
              },
              data: { payrollRecordId: payrollRecord.id },
            });
          }

          // Create corresponding expense entry for each payroll record
          try {
            const periodDescription = `${employeeFirstName} ${employeeLastName} - Payroll for period ${new Date(periodStart).toLocaleDateString('en-GB')} to ${new Date(periodEnd).toLocaleDateString('en-GB')}`;
            
            const expense = await prisma.expense.create({
              data: {
                userId: payrollDataToCreate.userId,
                companyId: payrollDataToCreate.companyId,
                taskId: null, // Payroll is not tied to a specific task
                category: 'Payroll',
                amount: payrollDataToCreate.totalAmount,
                description: periodDescription,
                receiptUrl: null,
                status: 'pending', // Match payroll status
              },
            });

            console.log(`✅ Created expense entry (ID: ${expense.id}) for payroll record (ID: ${payrollRecord.id})`);
          } catch (expenseError: any) {
            console.error(`❌ Error creating expense for payroll ${payrollRecord.id}:`, expenseError);
            // Don't fail payroll creation if expense creation fails, but log it
            errors.push(`Warning: Payroll created but expense entry failed for ${employeeFirstName} ${employeeLastName}`);
          }

          // Send notification to the employee about new payroll record
          try {
            const startDateStr = new Date(periodStart).toLocaleDateString('en-GB');
            const endDateStr = new Date(periodEnd).toLocaleDateString('en-GB');
            
            await createNotification({
              userId: payrollDataToCreate.userId,
              title: 'New Payroll Generated',
              message: `A payroll record has been generated for you for the period ${startDateStr} to ${endDateStr}. Amount: £${Number(payrollDataToCreate.totalAmount).toFixed(2)}`,
              type: 'payment_alert',
              metadata: {
                payrollRecordId: payrollRecord.id,
                status: 'pending',
                amount: Number(payrollDataToCreate.totalAmount),
              },
              screenRoute: 'Payroll',
              screenParams: { payrollRecordId: payrollRecord.id },
            });

            console.log(`✅ Sent payroll generation notification to user ${payrollDataToCreate.userId}`);
          } catch (notifError) {
            console.error(`Error sending payroll generation notification to user ${payrollDataToCreate.userId}:`, notifError);
            // Don't fail payroll creation if notification fails
          }

          createdPayrollRecords.push(payrollRecord);
        } catch (payrollError: any) {
          console.error(`❌ Error creating payroll record:`, payrollError);
          errors.push(`Error creating payroll for ${employeeFirstName} ${employeeLastName}: ${payrollError.message}`);
        }
      }

      console.log(`✅ Created ${createdPayrollRecords.length} payroll record(s) with expense entries`);
    }

    return NextResponse.json({
      success: true,
      data: {
        generated: createdPayrollRecords.length,
        records: createdPayrollRecords,
        errors: errors.length > 0 ? errors : undefined,
        message:
          createdPayrollRecords.length > 0
            ? `Generated ${createdPayrollRecords.length} payroll record(s)`
            : errors[0] || 'No payroll records generated',
      },
    }, { status: 200 });
  } catch (error) {
    console.error('Payroll generation error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
