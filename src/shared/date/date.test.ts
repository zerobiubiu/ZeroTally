import { describe, expect, it } from 'vitest';
import {
  formatDaySectionTitle,
  formatMonthTitle,
  getMonthDateRange,
  isValidIsoDate,
  isValidMonthKey,
  shiftIsoDate,
  shiftMonthKey,
} from './date';

describe('date 日期与月份工具', () => {
  it('校验真实日历日期，正确处理闰年与月末边界', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2026-11-31')).toBe(false);
    expect(isValidIsoDate('2026-11-25')).toBe(true);
    expect(isValidMonthKey('2026-11')).toBe(true);
    expect(isValidMonthKey('2026-13')).toBe(false);
  });

  it('正确计算跨年月份切换与月末日期范围', () => {
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    expect(getMonthDateRange('2024-02')).toEqual({
      start: '2024-02-01',
      end: '2024-02-29',
    });
    expect(getMonthDateRange('2026-11')).toEqual({
      start: '2026-11-01',
      end: '2026-11-30',
    });
  });

  it('正确偏移日期并格式化中文标题', () => {
    expect(shiftIsoDate('2026-11-25', -1)).toBe('2026-11-24');
    expect(formatMonthTitle('2026-03')).toBe('2026年3月');
    expect(formatDaySectionTitle('2026-11-25', '2026-11-25')).toContain('今天');
    expect(formatDaySectionTitle('2026-11-24', '2026-11-25')).toContain('昨天');
  });
});
