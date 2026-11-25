/**
 * 交易日期（YYYY-MM-DD）与月份键（YYYY-MM）权威工具
 */

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

/** 返回本地时区的今日日期（YYYY-MM-DD） */
export function getTodayIsoDate(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** 返回本地时区的当前月份键（YYYY-MM） */
export function getCurrentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

/** 校验 YYYY-MM-DD 是否为真实日历日期 */
export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/** 校验 YYYY-MM 是否合法 */
export function isValidMonthKey(value: string): boolean {
  const match = MONTH_KEY_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

/** 按偏移量切换月份（offset 可为正负整数） */
export function shiftMonthKey(monthKey: string, offsetMonths: number): string {
  if (!isValidMonthKey(monthKey)) {
    throw new Error(`非法月份键：${monthKey}`);
  }
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const shifted = new Date(year, month - 1 + offsetMonths, 1);
  return `${shifted.getFullYear()}-${pad2(shifted.getMonth() + 1)}`;
}

/** 返回指定月份的起止 YYYY-MM-DD 闭区间 */
export function getMonthDateRange(monthKey: string): { start: string; end: string } {
  if (!isValidMonthKey(monthKey)) {
    throw new Error(`非法月份键：${monthKey}`);
  }
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${yearStr}-${monthStr}-01`,
    end: `${yearStr}-${monthStr}-${pad2(lastDay)}`,
  };
}

/** 按偏移天数调整日期（用于记账日期快捷切换） */
export function shiftIsoDate(isoDate: string, offsetDays: number): string {
  if (!isValidIsoDate(isoDate)) {
    throw new Error(`非法日期：${isoDate}`);
  }
  const [yearStr, monthStr, dayStr] = isoDate.split('-');
  const date = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr) + offsetDays);
  return getTodayIsoDate(date);
}

/** 格式化月份标题（如 "2026年11月"） */
export function formatMonthTitle(monthKey: string): string {
  if (!isValidMonthKey(monthKey)) {
    return monthKey;
  }
  const [yearStr, monthStr] = monthKey.split('-');
  return `${yearStr}年${Number(monthStr)}月`;
}

/** 格式化按日分组标题（如 "11月25日 周三 · 今天"） */
export function formatDaySectionTitle(isoDate: string, todayIso: string = getTodayIsoDate()): string {
  if (!isValidIsoDate(isoDate)) {
    return isoDate;
  }
  const [yearStr, monthStr, dayStr] = isoDate.split('-');
  const date = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
  const weekday = WEEKDAY_LABELS[date.getDay()] ?? '';
  const base = `${Number(monthStr)}月${Number(dayStr)}日 ${weekday}`;

  if (isoDate === todayIso) {
    return `${base} · 今天`;
  }
  if (isoDate === shiftIsoDate(todayIso, -1)) {
    return `${base} · 昨天`;
  }
  return base;
}
