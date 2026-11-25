import type { SqlExecutor } from '../../db/types';
import { createId } from '../../shared/id/id';
import {
  countAccountTransactions,
  deleteAccountRow,
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
    kind: input.kind,
    category: input.category,
    balanceCents: input.initialBalanceCents,
    includeInNetWorth: input.includeInNetWorth ?? true,
    icon: input.icon,
    color: input.color,
    note: input.note ?? '',
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

  const now = new Date().toISOString();
  await updateAccountRow(db, id, {
    ...input,
    updatedAt: now,
  });

  const updated = await findAccountById(db, id);
  if (!updated) {
    throw new Error('更新账户后读取失败');
  }
  return updated;
}

/**
 * 手动校准账户余额（调账），直接将账户当前净余额更新为目标值并返回差额。
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
    throw new Error('调账后读取账户失败');
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

export async function deleteAccount(db: SqlExecutor, id: string): Promise<void> {
  const existing = await findAccountById(db, id);
  if (!existing) {
    throw new Error('账户不存在');
  }

  const txCount = await countAccountTransactions(db, id);
  if (txCount > 0) {
    throw new Error(`该账户关联了 ${txCount} 笔历史账目，请改用「停用归档」以保留完整账单`);
  }

  const activeAccounts = await findAllAccounts(db, false);
  if (!existing.isArchived && activeAccounts.length <= 1) {
    throw new Error('至少需要保留一个可用账户');
  }

  await deleteAccountRow(db, id);
}
