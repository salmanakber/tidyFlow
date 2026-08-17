import prisma from '@/lib/prisma';

const TRIAL_DAYS_KEY = 'trial_days';
const DEFAULT_TRIAL_DAYS = 14;
const MIN_TRIAL_DAYS = 0;
const MAX_TRIAL_DAYS = 365;

export async function getTrialDays(): Promise<number> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: TRIAL_DAYS_KEY },
    });
    if (setting?.value) {
      const parsed = parseInt(setting.value, 10);
      if (!Number.isNaN(parsed)) {
        return Math.min(MAX_TRIAL_DAYS, Math.max(MIN_TRIAL_DAYS, parsed));
      }
    }
  } catch (error) {
    console.warn('Failed to read trial_days setting:', error);
  }

  const fromEnv = parseInt(process.env.TRIAL_DAYS || process.env.EXPO_PUBLIC_TRIAL_DAYS || '', 10);
  if (!Number.isNaN(fromEnv)) {
    return Math.min(MAX_TRIAL_DAYS, Math.max(MIN_TRIAL_DAYS, fromEnv));
  }

  return DEFAULT_TRIAL_DAYS;
}
