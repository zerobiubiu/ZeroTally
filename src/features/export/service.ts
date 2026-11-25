import type { SqlExecutor } from '../../db/types';
import { findAllAccounts } from '../accounts/repository';
import { findCategories } from '../categories/repository';
import { findAllTransactionsForExport } from '../transactions/repository';
import {
  buildExportFilename,
  buildLedgerExportPayload,
  serializeLedgerToCsv,
  serializeLedgerToJson,
} from './formatter';
import type { ExportFormat, GeneratedExportArtifact } from './types';

/**
 * 从 SQLite 读取全量账本数据并生成标准可读的 JSON 或 CSV 文本产物。
 */
export async function generateLedgerExport(
  db: SqlExecutor,
  format: ExportFormat,
  now: Date = new Date()
): Promise<GeneratedExportArtifact> {
  const [accounts, categories, transactions] = await Promise.all([
    findAllAccounts(db, true),
    findCategories(db, { includeArchived: true }),
    findAllTransactionsForExport(db),
  ]);

  const payload = buildLedgerExportPayload({
    accounts,
    categories,
    transactions,
    exportedAt: now.toISOString(),
  });

  const content =
    format === 'json' ? serializeLedgerToJson(payload) : serializeLedgerToCsv(payload);

  return {
    format,
    filename: buildExportFilename(format, now),
    mimeType: format === 'json' ? 'application/json' : 'text/csv',
    content,
    transactionCount: payload.transactions.length,
    accountCount: payload.accounts.length,
  };
}
