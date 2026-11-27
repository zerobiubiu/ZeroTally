/**
 * 金额解析与格式化权威模块
 * 约定：系统内部统一使用整数「分」（cents）表示金额，杜绝浮点运算精度误差。
 */

/** 单笔交易最大金额：999,999,999.99 元（约 10 亿元），确保安全整数范围内不会溢出 */
export const MAX_AMOUNT_CENTS = 99_999_999_999;

/** 默认币种符号 */
export const CURRENCY_SYMBOL = '¥';

const AMOUNT_INPUT_PATTERN = /^\d+(?:\.\d{0,2})?$/;
const POSITIVE_AMOUNT_DRAFT_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

export type PositiveAmountInputResult =
  | { kind: 'empty'; normalized: '' }
  | { kind: 'valid'; normalized: string; cents: number }
  | { kind: 'invalid'; reason: string };

/**
 * 输入过程中即时截断超过两位的多余小数位（直接删除，不四舍五入），
 * 同时保留 ".5"、"0001" 等编辑中形态供输入完成时自动规整。
 */
export function truncateExcessDecimalsInput(raw: string): string {
  const dotIndex = raw.indexOf('.');
  if (dotIndex < 0) {
    return raw;
  }
  const intPart = raw.slice(0, dotIndex);
  const rest = raw.slice(dotIndex + 1);
  if (/^\d+$/.test(rest) && rest.length > 2) {
    return `${intPart}.${rest.slice(0, 2)}`;
  }
  return raw;
}

/**
 * 输入完成后的正数金额自动规整与合法性校验（仅允许 > 0 的两位小数正数，不限制业务上限）：
 * - 留空返回 empty；
 * - ".5" 自动补全前导零为 "0.5"；
 * - "0001" / "000.5" 自动删除多余前导零为 "1" / "0.5"；
 * - "0.123" 自动删除超出两位的尾数小数为 "0.12"（不四舍五入）；
 * - 非正数（0、负数）或非法字符返回 invalid。
 */
export function normalizePositiveAmountInput(raw: string): PositiveAmountInputResult {
  const trimmed = raw.trim().replaceAll(',', '');
  if (trimmed.length === 0) {
    return { kind: 'empty', normalized: '' };
  }

  if (!POSITIVE_AMOUNT_DRAFT_PATTERN.test(trimmed)) {
    return { kind: 'invalid', reason: '请输入大于 0 的正数金额' };
  }

  const [rawInt = '', rawDec = ''] = trimmed.split('.');
  const normalizedInt = rawInt.replace(/^0+/, '') || '0';
  const truncatedDec = rawDec.slice(0, 2);
  const normalized =
    truncatedDec.length > 0 ? `${normalizedInt}.${truncatedDec}` : normalizedInt;

  const cents = parseYuanToCents(normalized);
  if (cents === null) {
    return { kind: 'invalid', reason: '金额超出系统最大有效范围' };
  }
  if (cents <= 0) {
    return { kind: 'invalid', reason: '请输入大于 0 的正数金额' };
  }

  return { kind: 'valid', normalized, cents };
}

/**
 * 将用户输入的「元」文本解析为非负整数「分」。
 * 仅允许非负数字且最多两位小数；非法输入返回 null。
 */
export function parseYuanToCents(raw: string): number | null {
  const trimmed = raw.trim().replaceAll(',', '');
  if (trimmed.length === 0 || !AMOUNT_INPUT_PATTERN.test(trimmed)) {
    return null;
  }

  const [integerPart = '0', decimalPart = ''] = trimmed.split('.');
  const normalizedDecimal = decimalPart.padEnd(2, '0');
  const cents = Number(integerPart) * 100 + Number(normalizedDecimal);

  if (!Number.isSafeInteger(cents) || cents < 0 || cents > MAX_AMOUNT_CENTS) {
    return null;
  }

  return cents;
}

/**
 * 将用户输入的允许带负号的「元」文本解析为整数「分」（适用于余额校准场景）。
 */
export function parseSignedYuanToCents(raw: string): number | null {
  const trimmed = raw.trim().replaceAll(',', '');
  if (trimmed.length === 0) {
    return null;
  }

  const isNegative = trimmed.startsWith('-');
  const unsigned = isNegative || trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  const unsignedCents = parseYuanToCents(unsigned);
  if (unsignedCents === null) {
    return null;
  }

  if (unsignedCents === 0) {
    return 0;
  }

  return isNegative ? -unsignedCents : unsignedCents;
}

/**
 * 将整数「分」格式化为不含货币符号的标准两位小数字符串（如 123456 -> "1,234.56"）。
 */
export function formatCentsPlain(cents: number, withGrouping = true): string {
  const isNegative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const yuan = Math.floor(abs / 100);
  const fen = abs % 100;

  const yuanStr = withGrouping
    ? yuan.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    : yuan.toString();
  const fenStr = fen.toString().padStart(2, '0');

  return `${isNegative ? '-' : ''}${yuanStr}.${fenStr}`;
}

/**
 * 将整数「分」格式化为带货币符号金额（如 12345 -> "¥123.45"，-5000 -> "-¥50.00"）。
 */
export function formatCentsToYuan(cents: number): string {
  const isNegative = cents < 0;
  const plain = formatCentsPlain(Math.abs(Math.trunc(cents)), true);
  return `${isNegative ? '-' : ''}${CURRENCY_SYMBOL}${plain}`;
}

/**
 * 将交易金额格式化为显式带符号文本（不单靠颜色传递语义，符合无障碍要求）。
 */
export function formatTransactionAmount(
  type: 'expense' | 'income' | 'transfer' | 'refund',
  amountCents: number
): string {
  const plain = formatCentsPlain(Math.abs(Math.trunc(amountCents)), true);
  if (type === 'expense') {
    return `-${CURRENCY_SYMBOL}${plain}`;
  }
  if (type === 'income' || type === 'refund') {
    return `+${CURRENCY_SYMBOL}${plain}`;
  }
  return `${CURRENCY_SYMBOL}${plain}`;
}

/**
 * 将整数「分」转为表单初始输入文本（无千分位，去多余尾部零更便于编辑）。
 */
export function centsToInputString(cents: number): string {
  const plain = formatCentsPlain(cents, false);
  if (plain.endsWith('.00')) {
    return plain.slice(0, -3);
  }
  if (plain.endsWith('0')) {
    return plain.slice(0, -1);
  }
  return plain;
}
