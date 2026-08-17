/**
 * Shared password policy for web + API (no Node-only deps — safe for client components).
 */
export type PasswordCheck = {
  id: string;
  label: string;
  ok: boolean;
};

export type PasswordValidation = {
  valid: boolean;
  message?: string;
  checks: PasswordCheck[];
  score: number; // 0–5
};

export function evaluatePassword(password: string): PasswordValidation {
  const value = password || '';
  const checks: PasswordCheck[] = [
    { id: 'length', label: 'At least 10 characters', ok: value.length >= 10 },
    { id: 'upper', label: 'One uppercase letter (A–Z)', ok: /[A-Z]/.test(value) },
    { id: 'lower', label: 'One lowercase letter (a–z)', ok: /[a-z]/.test(value) },
    { id: 'number', label: 'One number (0–9)', ok: /[0-9]/.test(value) },
    {
      id: 'special',
      label: 'One special character (!@#$%^&*)',
      ok: /[!@#$%^&*()_\-+=\[\]{};:'",.<>/?\\|`~]/.test(value),
    },
  ];

  const score = checks.filter((c) => c.ok).length;
  const failed = checks.find((c) => !c.ok);

  return {
    valid: score === checks.length,
    message: failed ? `Password must include: ${failed.label.toLowerCase()}` : undefined,
    checks,
    score,
  };
}

export function isStrongPassword(password: string): { valid: boolean; message?: string } {
  const result = evaluatePassword(password);
  return { valid: result.valid, message: result.message };
}
