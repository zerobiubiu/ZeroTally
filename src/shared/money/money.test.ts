import { describe, expect, it } from 'vitest';
import {
  centsToInputString,
  formatCentsPlain,
  formatCentsToYuan,
  formatTransactionAmount,
  MAX_AMOUNT_CENTS,
  parseSignedYuanToCents,
  parseYuanToCents,
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
});
