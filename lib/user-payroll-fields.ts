import { serializePayrollDefaults, parsePayrollDefaults, type PayrollUserDefaults } from '@/lib/payroll-user-defaults';

export { parsePayrollDefaults, type PayrollUserDefaults };

const PAYROLL_WORKER_TYPES = [
  'hourly',
  'custom',
  'paye_uk',
  'w2',
  'contractor_1099',
  'payg_au',
  't4_ca',
  'paye_nz',
  'eu_standard',
] as const;
export type PayrollWorkerTypeValue = (typeof PAYROLL_WORKER_TYPES)[number];

export const PAYROLL_USER_SELECT = {
  payrollWorkerType: true,
  hireDate: true,
  basicSalary: true,
  defaultHourlyRate: true,
  salaryType: true,
  payrollDefaults: true,
  bankAccountNumber: true,
  bankSortCode: true,
  bankName: true,
  employeeId: true,
  taxId: true,
} as const;

export function applyPayrollUserFields(
  data: Record<string, unknown>,
  body: Record<string, unknown>,
): string | null {
  if (body.payrollWorkerType !== undefined) {
    const wt = String(body.payrollWorkerType || 'hourly');
    if (!PAYROLL_WORKER_TYPES.includes(wt as PayrollWorkerTypeValue)) {
      return 'Invalid payroll worker type';
    }
    data.payrollWorkerType = wt;
  }
  if (body.hireDate !== undefined) {
    data.hireDate =
      body.hireDate === null || body.hireDate === ''
        ? null
        : new Date(String(body.hireDate));
  }
  if (body.basicSalary !== undefined) {
    data.basicSalary =
      body.basicSalary === null || body.basicSalary === ''
        ? null
        : Number(body.basicSalary);
  }
  if (body.defaultHourlyRate !== undefined) {
    data.defaultHourlyRate =
      body.defaultHourlyRate === null || body.defaultHourlyRate === ''
        ? null
        : Number(body.defaultHourlyRate);
  }
  if (body.salaryType !== undefined) {
    const st = body.salaryType ? String(body.salaryType) : null;
    if (st && st !== 'monthly' && st !== 'hourly') {
      return 'salaryType must be monthly or hourly';
    }
    data.salaryType = st;
  }
  if (body.payrollDefaults !== undefined) {
    if (body.payrollDefaults === null || body.payrollDefaults === '') {
      data.payrollDefaults = null;
    } else if (typeof body.payrollDefaults === 'string') {
      data.payrollDefaults = body.payrollDefaults;
    } else if (typeof body.payrollDefaults === 'object') {
      data.payrollDefaults = serializePayrollDefaults(body.payrollDefaults as PayrollUserDefaults);
    }
  }
  if (body.bankAccountNumber !== undefined) {
    data.bankAccountNumber = body.bankAccountNumber ? String(body.bankAccountNumber) : null;
  }
  if (body.bankSortCode !== undefined) {
    data.bankSortCode = body.bankSortCode ? String(body.bankSortCode) : null;
  }
  if (body.bankName !== undefined) {
    data.bankName = body.bankName ? String(body.bankName) : null;
  }
  if (body.employeeId !== undefined) {
    data.employeeId = body.employeeId ? String(body.employeeId) : null;
  }
  if (body.taxId !== undefined) {
    data.taxId = body.taxId ? String(body.taxId) : null;
  }
  return null;
}
