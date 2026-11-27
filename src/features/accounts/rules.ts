import { isValidIsoDate } from '../../shared/date/date';
import { formatCentsToYuan, MAX_AMOUNT_CENTS } from '../../shared/money/money';
import {
  ACCOUNT_CATEGORY_METAS,
  type Account,
  type AccountCategory,
  type AccountCategoryMeta,
  type AccountKind,
  type CreateAccountInput,
  type NetWorthSummary,
  type UpdateAccountInput,
} from './types';

export const MAX_ACCOUNT_NAME_LENGTH = 24;
export const MAX_ACCOUNT_NOTE_LENGTH = 80;
export const MAX_CARD_NUMBER_LENGTH = 32;
export const MAX_BANK_TEXT_LENGTH = 40;

/** 账户性质由类型唯一决定：信用卡 / 信用付与借款 / 负债为负债，其余均为资产 */
export function kindForCategory(category: AccountCategory): AccountKind {
  return getAccountCategoryMeta(category).defaultKind;
}

/** 仅储蓄卡与信用卡两类银行卡账户支持卡号 / 银行 / 开户行 / 开户日期信息 */
export function supportsCardInfo(category: AccountCategory): boolean {
  return category === 'bank' || category === 'credit';
}

export function getAccountCategoryMeta(category: AccountCategory): AccountCategoryMeta {
  return (
    ACCOUNT_CATEGORY_METAS.find((item) => item.value === category) ??
    ACCOUNT_CATEGORY_METAS[ACCOUNT_CATEGORY_METAS.length - 1]!
  );
}

export function validateAccountName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('请输入账户名称');
  }
  if (trimmed.length > MAX_ACCOUNT_NAME_LENGTH) {
    throw new Error(`账户名称不能超过 ${MAX_ACCOUNT_NAME_LENGTH} 个字符`);
  }
  return trimmed;
}

export function validateAccountBalanceCents(balanceCents: number): number {
  if (
    !Number.isSafeInteger(balanceCents) ||
    Math.abs(balanceCents) > MAX_AMOUNT_CENTS
  ) {
    throw new Error('账户余额超出有效范围');
  }
  return balanceCents;
}

/** 银行卡信息字段统一裁剪；非银行卡类型一律清空，开户日期须为合法 ISO 日期或空串 */
export function normalizeAccountCardInfo(
  category: AccountCategory,
  input: { cardNumber?: string; bankName?: string; bankBranch?: string; openedOn?: string }
): { cardNumber: string; bankName: string; bankBranch: string; openedOn: string } {
  if (!supportsCardInfo(category)) {
    return { cardNumber: '', bankName: '', bankBranch: '', openedOn: '' };
  }
  const cardNumber = (input.cardNumber ?? '').trim();
  const bankName = (input.bankName ?? '').trim();
  const bankBranch = (input.bankBranch ?? '').trim();
  const openedOn = (input.openedOn ?? '').trim();
  if (cardNumber.length > MAX_CARD_NUMBER_LENGTH) {
    throw new Error(`卡号不能超过 ${MAX_CARD_NUMBER_LENGTH} 个字符`);
  }
  if (bankName.length > MAX_BANK_TEXT_LENGTH || bankBranch.length > MAX_BANK_TEXT_LENGTH) {
    throw new Error(`银行信息不能超过 ${MAX_BANK_TEXT_LENGTH} 个字符`);
  }
  if (openedOn && !isValidIsoDate(openedOn)) {
    throw new Error('开户日期格式无效');
  }
  return { cardNumber, bankName, bankBranch, openedOn };
}

/** 汇总可一键复制的账户基础信息文本（用于银行卡详情快捷整段复制，空项自动省略） */
export function formatAccountCardCopyText(
  account: Pick<Account, 'name' | 'cardNumber' | 'bankName' | 'bankBranch' | 'openedOn'>
): string {
  const lines: string[] = [`名称：${account.name}`];
  if (account.bankName) {
    lines.push(`银行：${account.bankName}`);
  }
  if (account.bankBranch) {
    lines.push(`开户行：${account.bankBranch}`);
  }
  if (account.cardNumber) {
    lines.push(`卡号：${account.cardNumber}`);
  }
  if (account.openedOn) {
    lines.push(`开户日期：${account.openedOn}`);
  }
  return lines.join('\n');
}

export function normalizeCreateAccountInput(input: CreateAccountInput): CreateAccountInput {
  const name = validateAccountName(input.name);
  const initialBalanceCents = validateAccountBalanceCents(input.initialBalanceCents);
  const note = (input.note ?? '').trim();
  if (note.length > MAX_ACCOUNT_NOTE_LENGTH) {
    throw new Error(`账户备注不能超过 ${MAX_ACCOUNT_NOTE_LENGTH} 个字符`);
  }
  const includeInNetWorth = input.includeInNetWorth ?? true;
  return {
    ...input,
    name,
    initialBalanceCents,
    includeInNetWorth,
    includeInTotalAssets: input.includeInTotalAssets ?? includeInNetWorth,
    isSelectable: input.isSelectable ?? true,
    note,
    ...normalizeAccountCardInfo(input.category, input),
  };
}

export function normalizeUpdateAccountInput(input: UpdateAccountInput): UpdateAccountInput {
  const name = validateAccountName(input.name);
  const note = input.note.trim();
  if (note.length > MAX_ACCOUNT_NOTE_LENGTH) {
    throw new Error(`账户备注不能超过 ${MAX_ACCOUNT_NOTE_LENGTH} 个字符`);
  }
  return {
    ...input,
    name,
    note,
    ...normalizeAccountCardInfo(input.category, input),
  };
}

/**
 * 权威汇总规则：计算总资产、总负债与净资产（三开关相互独立）。
 * - 已归档账户一律不参与任何统计。
 * - 总资产 = 未归档且 includeInTotalAssets 的账户中 balanceCents >= 0 之和。
 * - 总负债 = 未归档且 includeInNetWorth 的账户中 balanceCents < 0 的绝对值之和。
 * - 净资产 = 未归档且 includeInNetWorth 的账户 balanceCents 之和（正余额自然计入净资产）。
 */
export function computeNetWorthSummary(accounts: readonly Account[]): NetWorthSummary {
  let totalAssetsCents = 0;
  let totalLiabilitiesCents = 0;
  let netWorthCents = 0;
  let includedCount = 0;
  let excludedCount = 0;

  for (const account of accounts) {
    if (account.isArchived) {
      continue;
    }
    if (account.includeInTotalAssets && account.balanceCents >= 0) {
      totalAssetsCents += account.balanceCents;
    }
    if (account.includeInNetWorth) {
      netWorthCents += account.balanceCents;
      if (account.balanceCents < 0) {
        totalLiabilitiesCents += Math.abs(account.balanceCents);
      }
    }
    if (account.includeInNetWorth || account.includeInTotalAssets) {
      includedCount += 1;
    } else {
      excludedCount += 1;
    }
  }

  return {
    totalAssetsCents,
    totalLiabilitiesCents,
    netWorthCents,
    includedCount,
    excludedCount,
  };
}

/**
 * 将账户净余额转为清晰的中文展示语义（避免负债账户负号造成理解负担）。
 */
export function describeAccountBalance(account: Pick<Account, 'kind' | 'balanceCents'>): {
  caption: string;
  amountText: string;
  isDebt: boolean;
} {
  if (account.kind === 'liability') {
    if (account.balanceCents < 0) {
      return {
        caption: '待还欠款',
        amountText: formatCentsToYuan(Math.abs(account.balanceCents)),
        isDebt: true,
      };
    }
    if (account.balanceCents > 0) {
      return {
        caption: '溢缴款',
        amountText: formatCentsToYuan(account.balanceCents),
        isDebt: false,
      };
    }
    return {
      caption: '暂无欠款',
      amountText: formatCentsToYuan(0),
      isDebt: false,
    };
  }

  if (account.balanceCents < 0) {
    return {
      caption: '已透支',
      amountText: formatCentsToYuan(account.balanceCents),
      isDebt: true,
    };
  }
  return {
    caption: '当前余额',
    amountText: formatCentsToYuan(account.balanceCents),
    isDebt: false,
  };
}
