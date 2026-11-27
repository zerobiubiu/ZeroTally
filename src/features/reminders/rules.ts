import type { DailyReminderConfig } from './types';

export const DAILY_REMINDER_CONFIG_KEY = 'daily_reminder_config_v1';
export const DAILY_REMINDER_NOTIFICATION_ID = 'zerotally_daily_reminder_v1';
export const DAILY_REMINDER_CHANNEL_ID = 'zerotally-daily-reminder';
export const MAX_REMINDER_MESSAGE_LENGTH = 50;

export const DEFAULT_DAILY_REMINDER_CONFIG: DailyReminderConfig = {
  enabled: false,
  hour: 21,
  minute: 0,
  message: '花 10 秒记下今天的收支吧',
};

export const PRESET_REMINDER_TIMES: readonly { hour: number; minute: number; label: string }[] = [
  { hour: 12, minute: 30, label: '12:30 午间' },
  { hour: 19, minute: 30, label: '19:30 晚饭' },
  { hour: 21, minute: 0, label: '21:00 睡前' },
  { hour: 22, minute: 0, label: '22:00 夜间' },
];

export function normalizeDailyReminderConfig(
  input: Partial<DailyReminderConfig> | null | undefined
): DailyReminderConfig {
  const hour =
    typeof input?.hour === 'number' && Number.isInteger(input.hour) && input.hour >= 0 && input.hour <= 23
      ? input.hour
      : DEFAULT_DAILY_REMINDER_CONFIG.hour;
  const minute =
    typeof input?.minute === 'number' &&
    Number.isInteger(input.minute) &&
    input.minute >= 0 &&
    input.minute <= 59
      ? input.minute
      : DEFAULT_DAILY_REMINDER_CONFIG.minute;
  const rawMessage = typeof input?.message === 'string' ? input.message.trim() : '';
  const message =
    rawMessage.length > 0
      ? rawMessage.slice(0, MAX_REMINDER_MESSAGE_LENGTH)
      : DEFAULT_DAILY_REMINDER_CONFIG.message;

  return {
    enabled: input?.enabled === true,
    hour,
    minute,
    message,
  };
}

export function parseDailyReminderConfig(raw: string | null): DailyReminderConfig {
  if (!raw) {
    return { ...DEFAULT_DAILY_REMINDER_CONFIG };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<DailyReminderConfig>;
    return normalizeDailyReminderConfig(parsed);
  } catch {
    return { ...DEFAULT_DAILY_REMINDER_CONFIG };
  }
}

export function formatReminderTime(hour: number, minute: number): string {
  const hh = String(Math.max(0, Math.min(23, Math.trunc(hour)))).padStart(2, '0');
  const mm = String(Math.max(0, Math.min(59, Math.trunc(minute)))).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** 按指定分钟步长增减提醒时间，并在 00:00 ~ 23:59 间自然循环 */
export function stepReminderTime(
  hour: number,
  minute: number,
  deltaMinutes: number
): { hour: number; minute: number } {
  const total = (((hour * 60 + minute + deltaMinutes) % 1440) + 1440) % 1440;
  return {
    hour: Math.floor(total / 60),
    minute: total % 60,
  };
}
