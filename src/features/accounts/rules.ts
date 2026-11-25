import { formatCentsToYuan, MAX_AMOUNT_CENTS } from '../../shared/money/money';
import {
  ACCOUNT_CATEGORY_METAS,
  type Account,
  type AccountCategory,
  type AccountCategoryMeta,
  type CreateAccountInput,
  type NetWorthSummary,
  type UpdateAccountInput,
} from './types';

export const MAX_ACCOUNT_NAME_LENGTH = 24;
export const MAX_ACCOUNT_NOTE_LENGTH = 80;

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

export function normalizeCreateAccountInput(input: CreateAccountInput): CreateAccountInput {
  const name = validateAccountName(input.name);
  const initialBalanceCents = validateAccountBalanceCents(input.initialBalanceCents);
  const note = (input.note ?? '').trim();
  if (note.length > MAX_ACCOUNT_NOTE_LENGTH) {
    throw new Error(`账户备注不能超过 ${MAX_ACCOUNT_NOTE_LENGTH} 个字符`);
  }
  return {
    ...input,
    name,
    initialBalanceCents,
    includeInNetWorth: input.includeInNetWorth ?? true,
    note,
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
  };
}

/**
 * 权威汇总规则：计算总资产、总负债与净资产。
 * - 仅统计未归档且 includeInNetWorth 为 true 的账户。
 * - 余额 >= 0 计入总资产；余额 < 0 其绝对值计入总负债。
 * - 净资产严格等于 总资产 - 总负债（即全部计入账户 balanceCents 之和）。
 */
export function computeNetWorthSummary(accounts: readonly Account[]): NetWorthSummary {
  let totalAssetsCents = 0;
  let totalLiabilitiesCents = 0;
  let includedCount = 0;
  let excludedCount = 0;

  for (const account of accounts) {
    if (account.isArchived) {
      continue;
    }
    if (!account.includeInNetWorth) {
      excludedCount += 1;
      continue;
    }
    includedCount += 1;
    if (account.balanceCents >= 0) {
      totalAssetsCents += account.balanceCents;
    } else {
      totalLiabilitiesCents += Math.abs(account.balanceCents);
    }
  }

  return {
    totalAssetsCents,
    totalLiabilitiesCents,
    netWorthCents: totalAssetsCents - totalLiabilitiesCents,
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
