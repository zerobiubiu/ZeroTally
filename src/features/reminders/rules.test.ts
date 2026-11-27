import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DAILY_REMINDER_CONFIG,
  formatReminderTime,
  normalizeDailyReminderConfig,
  parseDailyReminderConfig,
  stepReminderTime,
} from './rules';

describe('reminders 每日记账提醒纯规则', () => {
  it('默认关闭，且对损坏或越界配置回退安全默认值', () => {
    expect(parseDailyReminderConfig(null)).toEqual(DEFAULT_DAILY_REMINDER_CONFIG);
    expect(parseDailyReminderConfig('invalid-json')).toEqual(DEFAULT_DAILY_REMINDER_CONFIG);
    expect(
      normalizeDailyReminderConfig({ enabled: true, hour: 99, minute: -5, message: '   ' })
    ).toEqual({
      enabled: true,
      hour: 21,
      minute: 0,
      message: DEFAULT_DAILY_REMINDER_CONFIG.message,
    });
  });

  it('正确格式化时间并处理跨午夜步进循环', () => {
    expect(formatReminderTime(8, 5)).toBe('08:05');
    expect(formatReminderTime(21, 0)).toBe('21:00');
    expect(stepReminderTime(23, 50, 15)).toEqual({ hour: 0, minute: 5 });
    expect(stepReminderTime(0, 10, -15)).toEqual({ hour: 23, minute: 55 });
  });
});
