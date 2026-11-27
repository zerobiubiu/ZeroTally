import type { SqlExecutor } from '../../db/types';
import { createId } from '../../shared/id/id';
import {
  findAccountById,
  findAllAccounts,
  getNextAccountSortOrder,
  insertAccountRow,
  setAccountArchivedFlag,
  setAccountBalanceExact,
  updateAccountRow,
} from './repository';
import {
  computeNetWorthSummary,
  kindForCategory,
  normalizeCreateAccountInput,
  normalizeUpdateAccountInput,
  validateAccountBalanceCents,
} from './rules';
import type { Account, CreateAccountInput, NetWorthSummary, UpdateAccountInput } from './types';

export interface AssetOverview {
  summary: NetWorthSummary;
  assetAccounts: Account[];
  liabilityAccounts: Account[];
  archivedAccounts: Account[];
}

export async function listAccounts(
  db: SqlExecutor,
  options?: { includeArchived?: boolean }
): Promise<Account[]> {
  return findAllAccounts(db, options?.includeArchived ?? false);
}

export async function getAccountById(db: SqlExecutor, id: string): Promise<Account | null> {
  return findAccountById(db, id);
}

export async function getAssetOverview(db: SqlExecutor): Promise<AssetOverview> {
  const allAccounts = await findAllAccounts(db, true);
  const summary = computeNetWorthSummary(allAccounts);

  const assetAccounts: Account[] = [];
  const liabilityAccounts: Account[] = [];
  const archivedAccounts: Account[] = [];

  for (const acc of allAccounts) {
    if (acc.isArchived) {
      archivedAccounts.push(acc);
    } else if (acc.kind === 'liability') {
      liabilityAccounts.push(acc);
    } else {
      assetAccounts.push(acc);
    }
  }

  return {
    summary,
    assetAccounts,
    liabilityAccounts,
    archivedAccounts,
  };
}

export async function createAccount(
  db: SqlExecutor,
  rawInput: CreateAccountInput
): Promise<Account> {
  const input = normalizeCreateAccountInput(rawInput);
  const now = new Date().toISOString();
  const sortOrder = await getNextAccountSortOrder(db);

  const account: Account = {
    id: createId('acc'),
    name: input.name,
    kind: kindForCategory(input.category),
    category: input.category,
    balanceCents: input.initialBalanceCents,
    includeInNetWorth: input.includeInNetWorth ?? true,
    includeInTotalAssets: input.includeInTotalAssets ?? true,
    isSelectable: input.isSelectable ?? true,
    icon: input.icon,
    color: input.color,
    note: input.note ?? '',
    cardNumber: input.cardNumber ?? '',
    bankName: input.bankName ?? '',
    bankBranch: input.bankBranch ?? '',
    openedOn: input.openedOn ?? '',
    isArchived: false,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };

  await insertAccountRow(db, account);
  return account;
}

export async function updateAccount(
  db: SqlExecutor,
  id: string,
  rawInput: UpdateAccountInput
): Promise<Account> {
  const input = normalizeUpdateAccountInput(rawInput);
  const existing = await findAccountById(db, id);
  if (!existing) {
    throw new Error('账户不存在');
  }

  // 关闭「交易可选」时须保证仍剩至少一个未归档且可选的账户，否则记一笔账户条为空
  if (existing.isSelectable && !input.isSelectable && !existing.isArchived) {
    const activeAccounts = await findAllAccounts(db, false);
    const remainingSelectable = activeAccounts.filter(
      (acc) => acc.id !== id && acc.isSelectable
    );
    if (remainingSelectable.length === 0) {
      throw new Error('至少需要保留一个可选账户');
    }
  }
  const now = new Date().toISOString();
  await updateAccountRow(db, id, {
    ...input,
    kind: kindForCategory(input.category),
    updatedAt: now,
  });

  const updated = await findAccountById(db, id);
  if (!updated) {
    throw new Error('更新账户后读取失败');
  }
  return updated;
}

/**
 * 平账原语：直接将账户当前净余额修改为目标值并返回差额（不生成任何流水记录）。
 * 需要可选生成平账收支记录时，由 transactions/service.ts 的 settleAccountBalance 统一事务编排。
 */
export async function adjustAccountBalance(
  db: SqlExecutor,
  id: string,
  targetBalanceCents: number
): Promise<{ account: Account; deltaCents: number }> {
  const validated = validateAccountBalanceCents(targetBalanceCents);
  const existing = await findAccountById(db, id);
  if (!existing) {
    throw new Error('账户不存在');
  }

  const deltaCents = validated - existing.balanceCents;
  const now = new Date().toISOString();
  await setAccountBalanceExact(db, id, validated, now);

  const updated = await findAccountById(db, id);
  if (!updated) {
    throw new Error('平账后读取账户失败');
  }
  return { account: updated, deltaCents };
}

export async function archiveAccount(db: SqlExecutor, id: string): Promise<Account> {
  const existing = await findAccountById(db, id);
  if (!existing) {
    throw new Error('账户不存在');
  }
  const activeAccounts = await findAllAccounts(db, false);
  if (!existing.isArchived && activeAccounts.length <= 1) {
    throw new Error('至少需要保留一个可用账户');
  }
  // 归档最后一个可选账户同样会让记一笔无账户可用
  if (!existing.isArchived && existing.isSelectable) {
    const remainingSelectable = activeAccounts.filter(
      (acc) => acc.id !== id && acc.isSelectable
    );
    if (remainingSelectable.length === 0) {
      throw new Error('至少需要保留一个可选账户');
    }
  }

  await setAccountArchivedFlag(db, id, true, new Date().toISOString());
  const updated = await findAccountById(db, id);
  if (!updated) {
    throw new Error('归档账户后读取失败');
  }
  return updated;
}

export async function restoreAccount(db: SqlExecutor, id: string): Promise<Account> {
  const existing = await findAccountById(db, id);
  if (!existing) {
    throw new Error('账户不存在');
  }
  await setAccountArchivedFlag(db, id, false, new Date().toISOString());
  const updated = await findAccountById(db, id);
  if (!updated) {
    throw new Error('恢复账户后读取失败');
  }
  return updated;
}
