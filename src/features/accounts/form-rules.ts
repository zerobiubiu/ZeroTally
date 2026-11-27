import { truncateExcessDecimalsInput } from '../../shared/money/money';
import { MAX_CARD_NUMBER_LENGTH } from './rules';

/**
 * 每 4 位插入 1 个空格后仍不超出 MAX_CARD_NUMBER_LENGTH（32）的最大纯数字位数：
 * 26 位数字插入 6 个空格 = 32 字符，已远超常见 13~19 位银行卡号长度。
 */
const MAX_GROUPED_CARD_DIGITS = 26;

/**
 * 银行卡号展示与输入格式化：
 * - 纯数字（允许含任意空白符）自动按每 4 位空格分组展示，末尾不补悬空空格避免退格卡滞；
 * - 极长纯数字（> 26 位）保持紧凑截断至 MAX_CARD_NUMBER_LENGTH，避免老数据超长报错；
 * - 含非数字字符（如历史脱敏卡号 `6225****6789`）保留原样并限制最大长度。
 */
export function formatCardNumberInput(raw: string): string {
  if (!raw) {
    return '';
  }

  const compact = raw.replace(/\s+/g, '');
  if (compact.length === 0) {
    return '';
  }

  if (/^\d+$/.test(compact)) {
    if (compact.length > MAX_GROUPED_CARD_DIGITS) {
      return compact.slice(0, MAX_CARD_NUMBER_LENGTH);
    }
    return compact.replace(/(.{4})(?=.)/g, '$1 ');
  }

  return raw.slice(0, MAX_CARD_NUMBER_LENGTH);
}

/**
 * 支持负号的初始余额两位小数即时截断（资产账户支持负初始余额，不四舍五入）。
 */
export function truncateSignedDecimalsInput(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('-')) {
    return `-${truncateExcessDecimalsInput(trimmed.slice(1))}`;
  }
  return truncateExcessDecimalsInput(raw);
}
