import { formatCentsPlain } from '../../shared/money/money';
import { computeNetWorthSummary, getAccountCategoryMeta } from '../accounts/rules';
import type { Account } from '../accounts/types';
import type { Category } from '../categories/types';
import type { TransactionListItem, TransactionType } from '../transactions/types';
import type {
  ExportedAccount,
  ExportedCategory,
  ExportedTransaction,
  ExportFormat,
  LedgerExportPayload,
} from './types';

export const EXPORT_SCHEMA_VERSION = 1;

const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  expense: '支出',
  income: '收入',
  transfer: '转账',
};

const FORMULA_TRIGGER_PATTERN = /^[=+\-@\t\r]/;

/**
 * 构建标准可读的结构化账本导出对象，同时保留精确整数「分」与两位小数「元」口径。
 */
export function buildLedgerExportPayload(params: {
  accounts: readonly Account[];
  categories: readonly Category[];
  transactions: readonly TransactionListItem[];
  exportedAt?: string;
}): LedgerExportPayload {
  const exportedAt = params.exportedAt ?? new Date().toISOString();
  const netWorth = computeNetWorthSummary(params.accounts);

  const accounts: ExportedAccount[] = params.accounts.map((acc) => ({
    id: acc.id,
    name: acc.name,
    kind: acc.kind,
    kindLabel: acc.kind === 'liability' ? '负债' : '资产',
    category: acc.category,
    categoryLabel: getAccountCategoryMeta(acc.category).label,
    balanceCents: acc.balanceCents,
    balanceYuan: formatCentsPlain(acc.balanceCents, false),
    includeInNetWorth: acc.includeInNetWorth,
    isArchived: acc.isArchived,
    note: acc.note,
  }));

  const categories: ExportedCategory[] = params.categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    type: cat.type,
    typeLabel: cat.type === 'income' ? '收入' : '支出',
    isSystem: cat.isSystem,
    isArchived: cat.isArchived,
  }));

  const transactions: ExportedTransaction[] = params.transactions.map((tx) => ({
    id: tx.id,
    occurredOn: tx.occurredOn,
    type: tx.type,
    typeLabel: TRANSACTION_TYPE_LABELS[tx.type],
    amountCents: tx.amountCents,
    amountYuan: formatCentsPlain(tx.amountCents, false),
    categoryId: tx.categoryId,
    categoryName: tx.categoryName,
    accountId: tx.accountId,
    accountName: tx.accountName,
    toAccountId: tx.toAccountId,
    toAccountName: tx.toAccountName,
    note: tx.note,
    createdAt: tx.createdAt,
  }));

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    app: 'keep-accounts',
    currency: 'CNY',
    exportedAt,
    summary: {
      netWorthCents: netWorth.netWorthCents,
      netWorthYuan: formatCentsPlain(netWorth.netWorthCents, false),
      totalAssetsCents: netWorth.totalAssetsCents,
      totalAssetsYuan: formatCentsPlain(netWorth.totalAssetsCents, false),
      totalLiabilitiesCents: netWorth.totalLiabilitiesCents,
      totalLiabilitiesYuan: formatCentsPlain(netWorth.totalLiabilitiesCents, false),
      accountCount: accounts.length,
      categoryCount: categories.length,
      transactionCount: transactions.length,
    },
    accounts,
    categories,
    transactions,
  };
}

/**
 * 序列化为带 2 空格缩进的标准 JSON 文本。
 */
export function serializeLedgerToJson(payload: LedgerExportPayload): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function escapeCsvCell(value: string, sanitizeFormula: boolean): string {
  const safeValue =
    sanitizeFormula && FORMULA_TRIGGER_PATTERN.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(safeValue)) {
    return `"${safeValue.replaceAll('"', '""')}"`;
  }
  return safeValue;
}

/**
 * 序列化为带 UTF-8 BOM 的标准 RFC 4180 CSV（兼容 Excel / WPS 直接打开中文不乱码），
 * 并对用户自由文本字段执行 CSV 公式注入防护。
 */
export function serializeLedgerToCsv(payload: LedgerExportPayload): string {
  const header = ['日期', '类型', '分类', '金额(元)', '账户', '转入账户', '备注', '记录ID'];
  const lines: string[] = [header.join(',')];

  for (const tx of payload.transactions) {
    const signedYuan =
      tx.type === 'expense' ? `-${tx.amountYuan}` : tx.amountYuan;
    const cells = [
      escapeCsvCell(tx.occurredOn, false),
      escapeCsvCell(tx.typeLabel, false),
      escapeCsvCell(tx.categoryName ?? '', true),
      escapeCsvCell(signedYuan, false),
      escapeCsvCell(tx.accountName, true),
      escapeCsvCell(tx.toAccountName ?? '', true),
      escapeCsvCell(tx.note, true),
      escapeCsvCell(tx.id, false),
    ];
    lines.push(cells.join(','));
  }

  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function buildExportFilename(format: ExportFormat, now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `keep-accounts-${y}-${m}-${d}.${format}`;
}
