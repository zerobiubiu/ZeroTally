import { describe, expect, it } from 'vitest';
import {
  applyAmountKey,
  centsToAmountExpression,
  evaluateAmountExpression,
  hasPendingOperation,
  type AmountKey,
} from './amount-expression';

function typeKeys(keys: string, start = ''): string {
  return [...keys].reduce((expr, key) => applyAmountKey(expr, key as AmountKey), start);
}

describe('记账金额键盘表达式', () => {
  it('限制两位小数、整数 9 位，自动补零并替换前导零', () => {
    expect(typeKeys('12.345')).toBe('12.34');
    expect(typeKeys('.5')).toBe('0.5');
    expect(typeKeys('007')).toBe('7');
    expect(typeKeys('1..2')).toBe('1.2');
    expect(typeKeys('1234567890')).toBe('123456789');
  });

  it('运算符不能打头，连续输入时替换上一个运算符', () => {
    expect(typeKeys('+-')).toBe('');
    expect(typeKeys('12+-3')).toBe('12-3');
    expect(typeKeys('5+.5')).toBe('5+0.5');
    expect(applyAmountKey('12+', 'backspace')).toBe('12');
  });

  it('以整数「分」精确求值加减表达式', () => {
    expect(evaluateAmountExpression('0.1+0.2')).toBe(30);
    expect(evaluateAmountExpression('100-35.5+0.05')).toBe(6455);
    expect(evaluateAmountExpression('12+')).toBe(1200);
    expect(evaluateAmountExpression('5-8')).toBe(-300);
    expect(evaluateAmountExpression('')).toBeNull();
  });

  it('识别待计算状态并把结果写回表达式', () => {
    expect(hasPendingOperation('12+')).toBe(false);
    expect(hasPendingOperation('12+3')).toBe(true);
    expect(centsToAmountExpression(1550)).toBe('15.5');
    expect(centsToAmountExpression(0)).toBe('');
  });
});
