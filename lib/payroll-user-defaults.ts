export interface PayrollUserDefaults {
  hraAllowance?: number;
  transportAllowance?: number;
  bonus?: number;
  otherAllowances?: number;
  loanRepayment?: number;
  otherDeductions?: number;
  overtimeRate?: number;
}

export function parsePayrollDefaults(raw: string | null | undefined): PayrollUserDefaults {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return {
      hraAllowance: parsed.hraAllowance != null ? Number(parsed.hraAllowance) : undefined,
      transportAllowance: parsed.transportAllowance != null ? Number(parsed.transportAllowance) : undefined,
      bonus: parsed.bonus != null ? Number(parsed.bonus) : undefined,
      otherAllowances: parsed.otherAllowances != null ? Number(parsed.otherAllowances) : undefined,
      loanRepayment: parsed.loanRepayment != null ? Number(parsed.loanRepayment) : undefined,
      otherDeductions: parsed.otherDeductions != null ? Number(parsed.otherDeductions) : undefined,
      overtimeRate: parsed.overtimeRate != null ? Number(parsed.overtimeRate) : undefined,
    };
  } catch {
    return {};
  }
}

export function serializePayrollDefaults(defaults: PayrollUserDefaults): string {
  const clean: PayrollUserDefaults = {};
  if (defaults.hraAllowance) clean.hraAllowance = defaults.hraAllowance;
  if (defaults.transportAllowance) clean.transportAllowance = defaults.transportAllowance;
  if (defaults.bonus) clean.bonus = defaults.bonus;
  if (defaults.otherAllowances) clean.otherAllowances = defaults.otherAllowances;
  if (defaults.loanRepayment) clean.loanRepayment = defaults.loanRepayment;
  if (defaults.otherDeductions) clean.otherDeductions = defaults.otherDeductions;
  if (defaults.overtimeRate) clean.overtimeRate = defaults.overtimeRate;
  return JSON.stringify(clean);
}
