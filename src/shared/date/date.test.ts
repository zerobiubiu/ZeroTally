import { describe, expect, it } from 'vitest';
import {
  countInclusiveDaysBetween,
  formatDaySectionTitle,
  formatMonthTitle,
  formatRelativeDateLabel,
  getDaysInYear,
  getMonthCalendarCells,
  getMonthDateRange,
  getYearDateRange,
  getYearRangeStart,
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
    expect(formatDaySectionTitle('2026-11-25', '2026-11-25')).toBe('11月25日 周三 · 今天');
    expect(formatDaySectionTitle('2026-11-24', '2026-11-25')).toBe('11月24日 周二 · 昨天');
    expect(formatDaySectionTitle('2025-11-20', '2026-11-27')).toBe('11月20日 周四');
    expect(formatDaySectionTitle('2025-11-20', '2026-11-27', { showYear: true })).toBe(
      '2025年11月20日 周四'
    );
    expect(formatDaySectionTitle('2026-11-27', '2026-11-27', { showYear: true })).toBe(
      '2026年11月27日 周五 · 今天'
    );
  });

  it('格式化记账日期短标签并生成周一起始的月历网格', () => {
    expect(formatRelativeDateLabel('2026-11-25', '2026-11-25')).toBe('今天');
    expect(formatRelativeDateLabel('2026-11-24', '2026-11-25')).toBe('昨天');
    expect(formatRelativeDateLabel('2026-11-10', '2026-11-25')).toBe('11月10日');
    expect(formatRelativeDateLabel('2025-12-31', '2026-11-25')).toBe('2025年12月31日');

    // 2026-11-01 为周日 -> 周一起始需前置 6 个空位，共 30 天 -> 36 格向上补齐至 42 格
    const cells = getMonthCalendarCells('2026-11');
    expect(cells.length % 7).toBe(0);
    expect(cells.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(cells[6]).toBe('2026-11-01');
    expect(cells.filter(Boolean)).toHaveLength(30);
  });

  it('正确计算年份区间分页、年度日期范围与跨日天数', () => {
    expect(getYearRangeStart(2026)).toBe(2020);
    expect(getYearRangeStart(2019)).toBe(2008);
    expect(getYearRangeStart(2032)).toBe(2032);
    expect(getYearDateRange(2026)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(getDaysInYear(2024)).toBe(366);
    expect(getDaysInYear(2026)).toBe(365);
    expect(countInclusiveDaysBetween('2026-01-01', '2026-01-10')).toBe(10);
  });
});
