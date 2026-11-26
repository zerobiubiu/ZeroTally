/**
 * 记账金额键盘表达式规则：
 * - 输入仅由数字、小数点与「+ / -」组成，每个操作数最多两位小数、整数部分最多 9 位；
 * - 求值时逐个操作数经 money.ts 解析为整数「分」再加减，杜绝浮点误差。
 */
import { centsToInputString, parseYuanToCents } from '../../shared/money/money';

export type AmountOperator = '+' | '-';
export type AmountKey =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '.'
  | AmountOperator
  | 'backspace';

const MAX_INTEGER_DIGITS = 9;

function isOperator(char: string | undefined): char is AmountOperator {
  return char === '+' || char === '-';
}

function currentOperand(expr: string): string {
  const lastOp = Math.max(expr.lastIndexOf('+'), expr.lastIndexOf('-'));
  return expr.slice(lastOp + 1);
}

/** 根据按键返回新的表达式文本；非法输入（如第三位小数）原样返回 */
export function applyAmountKey(expr: string, key: AmountKey): string {
  if (key === 'backspace') {
    return expr.slice(0, -1);
  }

  if (isOperator(key)) {
    if (expr === '') {
      return expr;
    }
    return isOperator(expr.at(-1)) ? `${expr.slice(0, -1)}${key}` : `${expr}${key}`;
  }

  const operand = currentOperand(expr);

  if (key === '.') {
    if (operand.includes('.')) {
      return expr;
    }
    return `${expr}${operand === '' ? '0.' : '.'}`;
  }

  const [intPart = '', decPart] = operand.split('.');
  if (decPart !== undefined) {
    return decPart.length >= 2 ? expr : `${expr}${key}`;
  }
  if (intPart === '0') {
    return `${expr.slice(0, -1)}${key}`;
  }
  if (intPart.length >= MAX_INTEGER_DIGITS) {
    return expr;
  }
  return `${expr}${key}`;
}

/** 是否存在待计算的运算（至少一个运算符两侧都有数字） */
export function hasPendingOperation(expr: string): boolean {
  return /\d[+-]\d/.test(expr);
}

/** 求值为整数「分」（可能为负）；空表达式或非法操作数返回 null */
export function evaluateAmountExpression(expr: string): number | null {
  const trimmed = isOperator(expr.at(-1)) ? expr.slice(0, -1) : expr;
  if (trimmed === '') {
    return null;
  }

  let total = 0;
  let sign = 1;
  for (const token of trimmed.split(/([+-])/)) {
    if (token === '+') {
      sign = 1;
    } else if (token === '-') {
      sign = -1;
    } else {
      const cents = parseYuanToCents(token);
      if (cents === null) {
        return null;
      }
      total += sign * cents;
    }
  }
  return total;
}

/** 把计算结果写回为可继续编辑的表达式文本 */
export function centsToAmountExpression(cents: number): string {
  return cents > 0 ? centsToInputString(cents) : '';
}
