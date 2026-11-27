import { describe, expect, it } from 'vitest';
import { formatCardNumberInput, truncateSignedDecimalsInput } from './form-rules';

describe('accounts 表单输入格式化规则', () => {
  it('纯数字卡号输入或粘贴时自动按每 4 位空格分组且末尾不留悬空空格', () => {
    expect(formatCardNumberInput('')).toBe('');
    expect(formatCardNumberInput('   ')).toBe('');
    expect(formatCardNumberInput('6225')).toBe('6225');
    expect(formatCardNumberInput('6225 ')).toBe('6225');
    expect(formatCardNumberInput('62258')).toBe('6225 8');
    expect(formatCardNumberInput('6225880123456789')).toBe('6225 8801 2345 6789');
    expect(formatCardNumberInput('6225  8801\t2345 6789123')).toBe('6225 8801 2345 6789 123');
  });

  it('兼容含脱敏符号的历史卡号并严格限制最大长度 32', () => {
    expect(formatCardNumberInput('6225****6789')).toBe('6225****6789');
    const longDigits = '1'.repeat(40);
    expect(formatCardNumberInput(longDigits)).toHaveLength(32);
    const longMixed = 'ABCD-'.repeat(10);
    expect(formatCardNumberInput(longMixed)).toHaveLength(32);
  });

  it('带符号金额即时截断超出两位的尾数小数且保留负号编辑态', () => {
    expect(truncateSignedDecimalsInput('123.456')).toBe('123.45');
    expect(truncateSignedDecimalsInput('-88.999')).toBe('-88.99');
    expect(truncateSignedDecimalsInput('-')).toBe('-');
    expect(truncateSignedDecimalsInput('.5')).toBe('.5');
  });
});
