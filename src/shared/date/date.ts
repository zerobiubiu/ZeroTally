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

/** 返回本地时区的当前年份 */
export function getCurrentYear(now: Date = new Date()): number {
  return now.getFullYear();
}

/** 计算包含指定年份的 12 年分页起始年（以 2020 为锚点：2008-2019、2020-2031、2032-2043...） */
export function getYearRangeStart(year: number, span = 12): number {
  return 2020 + Math.floor((year - 2020) / span) * span;
}

/** 返回指定年份的起止 YYYY-MM-DD 闭区间 */
export function getYearDateRange(year: number): { start: string; end: string } {
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

/** 返回指定年份的自然天数（闰年 366，平年 365） */
export function getDaysInYear(year: number): number {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return isLeap ? 366 : 365;
}

/** 计算两个 YYYY-MM-DD 日期之间的闭区间天数（至少返回 1） */
export function countInclusiveDaysBetween(startIso: string, endIso: string): number {
  if (!isValidIsoDate(startIso) || !isValidIsoDate(endIso)) {
    return 1;
  }
  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);
  const startUtc = Date.UTC(sy!, sm! - 1, sd!);
  const endUtc = Date.UTC(ey!, em! - 1, ed!);
  const diffDays = Math.floor((endUtc - startUtc) / 86_400_000) + 1;
  return Math.max(1, diffDays);
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

/** 格式化记账日期短标签：今天 / 昨天 / 11月20日 / 2025年11月20日（跨年） */
export function formatRelativeDateLabel(isoDate: string, todayIso: string = getTodayIsoDate()): string {
  if (!isValidIsoDate(isoDate)) {
    return isoDate;
  }
  if (isoDate === todayIso) {
    return '今天';
  }
  if (isoDate === shiftIsoDate(todayIso, -1)) {
    return '昨天';
  }
  const [yearStr, monthStr, dayStr] = isoDate.split('-');
  const monthDay = `${Number(monthStr)}月${Number(dayStr)}日`;
  return yearStr === todayIso.slice(0, 4) ? monthDay : `${yearStr}年${monthDay}`;
}

/**
 * 生成月历网格（周一为每周第一天）：返回长度为 7 的倍数的数组，
 * 本月日期为 YYYY-MM-DD，首尾补位为 null。
 */
export function getMonthCalendarCells(monthKey: string): (string | null)[] {
  const { start, end } = getMonthDateRange(monthKey);
  const [yearStr, monthStr] = monthKey.split('-');
  const firstWeekday = new Date(Number(yearStr), Number(monthStr) - 1, 1).getDay();
  const leading = (firstWeekday + 6) % 7;
  const lastDay = Number(end.slice(8, 10));

  const cells: (string | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= lastDay; day += 1) {
    cells.push(`${start.slice(0, 8)}${pad2(day)}`);
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

/** 格式化按日分组标题（如 "11月25日 周三 · 今天"；showYear 为 true 时附带年份如 "2025年11月20日 周四"） */
export function formatDaySectionTitle(
  isoDate: string,
  todayIso: string = getTodayIsoDate(),
  options?: { showYear?: boolean }
): string {
  if (!isValidIsoDate(isoDate)) {
    return isoDate;
  }
  const [yearStr, monthStr, dayStr] = isoDate.split('-');
  const date = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
  const weekday = WEEKDAY_LABELS[date.getDay()] ?? '';
  const monthDay = `${Number(monthStr)}月${Number(dayStr)}日`;
  const datePart = options?.showYear ? `${yearStr}年${monthDay}` : monthDay;
  const base = `${datePart} ${weekday}`;

  if (isoDate === todayIso) {
    return `${base} · 今天`;
  }
  if (isoDate === shiftIsoDate(todayIso, -1)) {
    return `${base} · 昨天`;
  }
  return base;
}
