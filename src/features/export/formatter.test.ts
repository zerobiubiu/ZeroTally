import { describe, expect, it } from 'vitest';
import type { Account } from '../accounts/types';
import type { Category } from '../categories/types';
import type { TransactionListItem } from '../transactions/types';
import {
  buildExportFilename,
  buildLedgerExportPayload,
  EXPORT_SCHEMA_VERSION,
  serializeLedgerToCsv,
  serializeLedgerToJson,
} from './formatter';

const SAMPLE_ACCOUNTS: Account[] = [
  {
    id: 'acc_bank',
    name: '银行储蓄卡',
    kind: 'asset',
    category: 'bank',
    balanceCents: 250000,
    includeInNetWorth: true,
    icon: 'card-outline',
    color: '#0F766E',
    note: '',
    isArchived: false,
    sortOrder: 10,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-25T00:00:00.000Z',
  },
  {
    id: 'acc_credit',
    name: '信用卡',
    kind: 'liability',
    category: 'credit',
    balanceCents: -50000,
    includeInNetWorth: true,
    icon: 'card-outline',
    color: '#E11D48',
    note: '',
    isArchived: false,
    sortOrder: 20,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-25T00:00:00.000Z',
  },
];

const SAMPLE_CATEGORIES: Category[] = [
  {
    id: 'cat_exp_food',
    name: '餐饮美食',
    type: 'expense',
    icon: 'restaurant-outline',
    color: '#D97706',
    isSystem: true,
    isArchived: false,
    sortOrder: 10,
    createdAt: '2026-11-01T00:00:00.000Z',
  },
];

const SAMPLE_TRANSACTIONS: TransactionListItem[] = [
  {
    id: 'tx_1',
    type: 'expense',
    amountCents: 3250,
    categoryId: 'cat_exp_food',
    accountId: 'acc_bank',
    toAccountId: null,
    occurredOn: '2026-11-25',
    note: '=SUM(A1), "午餐"',
    createdAt: '2026-11-25T12:00:00.000Z',
    updatedAt: '2026-11-25T12:00:00.000Z',
    categoryName: '餐饮美食',
    categoryIcon: 'restaurant-outline',
    categoryColor: '#D97706',
    accountName: '银行储蓄卡',
    toAccountName: null,
  },
];

describe('export 结构化导出格式化', () => {
  it('生成标准可读的 JSON 结构并保留精确分与元口径', () => {
    const payload = buildLedgerExportPayload({
      accounts: SAMPLE_ACCOUNTS,
      categories: SAMPLE_CATEGORIES,
      transactions: SAMPLE_TRANSACTIONS,
      exportedAt: '2026-11-25T13:00:00.000Z',
    });

    const jsonText = serializeLedgerToJson(payload);
    const parsed = JSON.parse(jsonText) as typeof payload;

    expect(parsed.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(parsed.currency).toBe('CNY');
    expect(parsed.summary.netWorthCents).toBe(200000);
    expect(parsed.summary.netWorthYuan).toBe('2000.00');
    expect(parsed.summary.totalLiabilitiesYuan).toBe('500.00');
    expect(parsed.transactions[0]?.typeLabel).toBe('支出');
    expect(parsed.transactions[0]?.amountYuan).toBe('32.50');
  });

  it('生成带 UTF-8 BOM 的 RFC 4180 CSV 并防御公式注入与特殊字符转义', () => {
    const payload = buildLedgerExportPayload({
      accounts: SAMPLE_ACCOUNTS,
      categories: SAMPLE_CATEGORIES,
      transactions: SAMPLE_TRANSACTIONS,
      exportedAt: '2026-11-25T13:00:00.000Z',
    });

    const csv = serializeLedgerToCsv(payload);
    expect(csv.startsWith('\uFEFF日期,类型,分类,金额(元),账户,转入账户,备注,记录ID\r\n')).toBe(
      true
    );
    expect(csv).toContain(
      '2026-11-25,支出,餐饮美食,-32.50,银行储蓄卡,,"\'=SUM(A1), ""午餐""",tx_1'
    );
  });

  it('生成规范的带日期导出文件名', () => {
    const date = new Date(2026, 10, 25);
    expect(buildExportFilename('json', date)).toBe('keep-accounts-2026-11-25.json');
    expect(buildExportFilename('csv', date)).toBe('keep-accounts-2026-11-25.csv');
  });
});
