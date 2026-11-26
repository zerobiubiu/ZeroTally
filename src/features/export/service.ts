import type { SqlExecutor } from '../../db/types';
import type { ThemePreference } from '../../theme/theme-context';
import { findAllAccounts } from '../accounts/repository';
import { findCategories } from '../categories/repository';
import { findAllQuickTemplates } from '../quick-record/repository';
import { getThemePreferenceSetting, setThemePreferenceSetting } from '../settings/repository';
import { findAllTransactionsForExport } from '../transactions/repository';
import {
  buildExportFilename,
  buildLedgerExportPayload,
  serializeLedgerToJson,
  validateLedgerImportJson,
} from './formatter';
import type { GeneratedExportArtifact, LedgerExportPayload, ValidatedLedgerImport } from './types';

/**
 * 从 SQLite 读取全量账本数据与应用配置，生成附带完整性校验指纹的标准可读 JSON 备份产物。
 */
export async function generateLedgerExport(
  db: SqlExecutor,
  now: Date = new Date()
): Promise<GeneratedExportArtifact> {
  const [accounts, categories, transactions, quickTemplates, themePreference] = await Promise.all([
    findAllAccounts(db, true),
    findCategories(db, { includeArchived: true }),
    findAllTransactionsForExport(db),
    findAllQuickTemplates(db),
    getThemePreferenceSetting(db),
  ]);

  const payload = buildLedgerExportPayload({
    accounts,
    categories,
    transactions,
    quickTemplates,
    themePreference,
    exportedAt: now.toISOString(),
  });

  return {
    filename: buildExportFilename(now),
    mimeType: 'application/json',
    content: serializeLedgerToJson(payload),
    transactionCount: payload.transactions.length,
    accountCount: payload.accounts.length,
    categoryCount: payload.categories.length,
    quickTemplateCount: payload.quickTemplates.length,
  };
}

/**
 * 校验待导入的全量 JSON 文本，返回规范化预览结果与完整性提示。
 */
export function parseAndValidateFullBackup(rawText: string): ValidatedLedgerImport {
  return validateLedgerImportJson(rawText);
}

/**
 * 在单一 SQLite 事务内原子恢复全量配置与账本数据（账户、分类、快捷模板、明细与外观主题）。
 * 任何写入错误均完整回滚，绝不损坏原有账本。
 */
export async function importFullLedgerBackup(
  db: SqlExecutor,
  payload: LedgerExportPayload
): Promise<{
  themePreference: ThemePreference;
  accountCount: number;
  categoryCount: number;
  quickTemplateCount: number;
  transactionCount: number;
}> {
  const now = new Date().toISOString();

  await db.withTransaction(async (tx) => {
    // 1. 按外键依赖逆序清空
    await tx.run('DELETE FROM transactions');
    await tx.run('DELETE FROM quick_templates');
    await tx.run('DELETE FROM accounts');
    await tx.run('DELETE FROM categories');

    // 2. 写入账户
    for (const acc of payload.accounts) {
      await tx.run(
        `INSERT INTO accounts (
           id, name, kind, category, balance_cents, include_in_net_worth,
           icon, color, note, is_archived, sort_order, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          acc.id,
          acc.name,
          acc.kind,
          acc.category,
          acc.balanceCents,
          acc.includeInNetWorth ? 1 : 0,
          acc.icon,
          acc.color,
          acc.note,
          acc.isArchived ? 1 : 0,
          acc.sortOrder,
          acc.createdAt,
          acc.updatedAt,
        ]
      );
    }

    // 3. 写入分类（严格先一级后二级，满足 parent_id 外键）
    const rootCats = payload.categories.filter((c) => c.parentId === null);
    const childCats = payload.categories.filter((c) => c.parentId !== null);
    for (const cat of [...rootCats, ...childCats]) {
      await tx.run(
        `INSERT INTO categories (
           id, name, type, icon, color, parent_id, is_system, is_archived, sort_order, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cat.id,
          cat.name,
          cat.type,
          cat.icon,
          cat.color,
          cat.parentId,
          cat.isSystem ? 1 : 0,
          cat.isArchived ? 1 : 0,
          cat.sortOrder,
          cat.createdAt,
        ]
      );
    }

    // 4. 写入快捷模板
    for (const tpl of payload.quickTemplates) {
      await tx.run(
        `INSERT INTO quick_templates (
           id, name, type, amount_cents, category_id, account_id, note, sort_order, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tpl.id,
          tpl.name,
          tpl.type,
          tpl.amountCents,
          tpl.categoryId,
          tpl.accountId,
          tpl.note,
          tpl.sortOrder,
          tpl.createdAt,
          tpl.updatedAt,
        ]
      );
    }

    // 5. 写入交易（严格先普通交易后退款交易，满足 refund_of_id 自引用外键）
    const baseTxs = payload.transactions.filter((t) => t.type !== 'refund');
    const refundTxs = payload.transactions.filter((t) => t.type === 'refund');
    for (const txRow of [...baseTxs, ...refundTxs]) {
      await tx.run(
        `INSERT INTO transactions (
           id, type, amount_cents, category_id, account_id, to_account_id, refund_of_id,
           occurred_on, note, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          txRow.id,
          txRow.type,
          txRow.amountCents,
          txRow.categoryId,
          txRow.accountId,
          txRow.toAccountId,
          txRow.refundOfId,
          txRow.occurredOn,
          txRow.note,
          txRow.createdAt,
          txRow.updatedAt,
        ]
      );
    }

    // 6. 写入应用配置（外观主题）
    await setThemePreferenceSetting(tx, payload.settings.themePreference, now);
  });

  return {
    themePreference: payload.settings.themePreference,
    accountCount: payload.accounts.length,
    categoryCount: payload.categories.length,
    quickTemplateCount: payload.quickTemplates.length,
    transactionCount: payload.transactions.length,
  };
}
