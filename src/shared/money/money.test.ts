import { describe, expect, it } from 'vitest';
import {
  centsToInputString,
  formatCentsPlain,
  formatCentsToYuan,
  formatTransactionAmount,
  MAX_AMOUNT_CENTS,
  normalizePositiveAmountInput,
  parseSignedYuanToCents,
  parseYuanToCents,
  truncateExcessDecimalsInput,
} from './money';

describe('money 金额权威工具', () => {
  it('正确解析合法的元文本为整数分，避免浮点误差', () => {
    expect(parseYuanToCents('0')).toBe(0);
    expect(parseYuanToCents('19.99')).toBe(1999);
    expect(parseYuanToCents('0.1')).toBe(10);
    expect(parseYuanToCents('1,234.50')).toBe(123450);
    expect(parseYuanToCents('100.')).toBe(10000);
    expect(parseYuanToCents('  88.08  ')).toBe(8808);
  });

  it('拒绝非法金额输入与超限金额', () => {
    expect(parseYuanToCents('')).toBeNull();
    expect(parseYuanToCents('-10')).toBeNull();
    expect(parseYuanToCents('12.345')).toBeNull();
    expect(parseYuanToCents('abc')).toBeNull();
    expect(parseYuanToCents('9999999999.99')).toBeNull();
    expect(MAX_AMOUNT_CENTS).toBe(99_999_999_999);
  });

  it('正确解析带符号金额并规范化 -0', () => {
    expect(parseSignedYuanToCents('-500.25')).toBe(-50025);
    expect(parseSignedYuanToCents('+88')).toBe(8800);
    expect(parseSignedYuanToCents('-0')).toBe(0);
    expect(parseSignedYuanToCents('--10')).toBeNull();
  });

  it('正确格式化标准金额与交易带符号金额', () => {
    expect(formatCentsPlain(1234567)).toBe('12,345.67');
    expect(formatCentsToYuan(0)).toBe('¥0.00');
    expect(formatCentsToYuan(-50000)).toBe('-¥500.00');
    expect(formatTransactionAmount('expense', 3250)).toBe('-¥32.50');
    expect(formatTransactionAmount('income', 100000)).toBe('+¥1,000.00');
    expect(formatTransactionAmount('transfer', 50000)).toBe('¥500.00');
  });

  it('将分转换为易编辑的表单输入文本', () => {
    expect(centsToInputString(10000)).toBe('100');
    expect(centsToInputString(10050)).toBe('100.5');
    expect(centsToInputString(10055)).toBe('100.55');
    expect(centsToInputString(0)).toBe('0');
  });

  it('正数金额输入规整：自动补前导零、去多余前导零、直接截断超两位小数且拒绝非正数', () => {
    expect(truncateExcessDecimalsInput('0.123')).toBe('0.12');
    expect(truncateExcessDecimalsInput('12.999')).toBe('12.99');
    expect(truncateExcessDecimalsInput('.5')).toBe('.5');
    expect(truncateExcessDecimalsInput('0001')).toBe('0001');

    expect(normalizePositiveAmountInput('')).toEqual({ kind: 'empty', normalized: '' });
    expect(normalizePositiveAmountInput('   ')).toEqual({ kind: 'empty', normalized: '' });
    expect(normalizePositiveAmountInput('.5')).toEqual({
      kind: 'valid',
      normalized: '0.5',
      cents: 50,
    });
    expect(normalizePositiveAmountInput('0001')).toEqual({
      kind: 'valid',
      normalized: '1',
      cents: 100,
    });
    expect(normalizePositiveAmountInput('000.5')).toEqual({
      kind: 'valid',
      normalized: '0.5',
      cents: 50,
    });
    expect(normalizePositiveAmountInput('0.123')).toEqual({
      kind: 'valid',
      normalized: '0.12',
      cents: 12,
    });
    expect(normalizePositiveAmountInput('0.129')).toEqual({
      kind: 'valid',
      normalized: '0.12',
      cents: 12,
    });
    expect(normalizePositiveAmountInput('5.')).toEqual({
      kind: 'valid',
      normalized: '5',
      cents: 500,
    });
    expect(normalizePositiveAmountInput('0').kind).toBe('invalid');
    expect(normalizePositiveAmountInput('000').kind).toBe('invalid');
    expect(normalizePositiveAmountInput('0.00').kind).toBe('invalid');
    expect(normalizePositiveAmountInput('.009').kind).toBe('invalid');
    expect(normalizePositiveAmountInput('-5').kind).toBe('invalid');
    expect(normalizePositiveAmountInput('1.2.3').kind).toBe('invalid');
    expect(normalizePositiveAmountInput('.').kind).toBe('invalid');
    expect(normalizePositiveAmountInput('abc').kind).toBe('invalid');
  });
});
