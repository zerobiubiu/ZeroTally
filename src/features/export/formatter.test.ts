import { describe, expect, it } from 'vitest';
import type { Account } from '../accounts/types';
import type { Category } from '../categories/types';
import type { QuickTemplate } from '../quick-record/types';
import type { TransactionListItem } from '../transactions/types';
import {
  buildExportFilename,
  buildLedgerExportPayload,
  EXPORT_SCHEMA_VERSION,
  serializeLedgerToJson,
  validateLedgerImportJson,
} from './formatter';

const SAMPLE_ACCOUNTS: Account[] = [
  {
    id: 'acc_wallet',
    name: '钱包',
    kind: 'asset',
    category: 'cash',
    balanceCents: 250000,
    includeInNetWorth: true,
    includeInTotalAssets: true,
    isSelectable: true,
    icon: 'wallet-outline',
    color: '#017853',
    note: '',
    cardNumber: '',
    bankName: '',
    bankBranch: '',
    openedOn: '',
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
    includeInTotalAssets: true,
    isSelectable: true,
    icon: 'card-outline',
    color: '#E11D48',
    note: '',
    cardNumber: '',
    bankName: '',
    bankBranch: '',
    openedOn: '',
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
    parentId: null,
    isSystem: true,
    isArchived: false,
    sortOrder: 10,
    createdAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'cat_exp_food_lunch',
    name: '午餐',
    type: 'expense',
    icon: 'fast-food-outline',
    color: '#D97706',
    parentId: 'cat_exp_food',
    isSystem: true,
    isArchived: false,
    sortOrder: 20,
    createdAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'cat_inc_salary',
    name: '工资薪金',
    type: 'income',
    icon: 'briefcase-outline',
    color: '#059669',
    parentId: null,
    isSystem: true,
    isArchived: false,
    sortOrder: 10,
    createdAt: '2026-11-01T00:00:00.000Z',
  },
];

const SAMPLE_QUICK_TEMPLATES: QuickTemplate[] = [
  {
    id: 'qtp_lunch',
    name: '工作午餐',
    type: 'expense',
    amountCents: 2200,
    categoryId: 'cat_exp_food_lunch',
    accountId: 'acc_wallet',
    note: '食堂',
    sortOrder: 10,
    createdAt: '2026-11-20T00:00:00.000Z',
    updatedAt: '2026-11-20T00:00:00.000Z',
  },
];

const SAMPLE_TRANSACTIONS: TransactionListItem[] = [
  {
    id: 'tx_1',
    type: 'expense',
    amountCents: 3250,
    categoryId: 'cat_exp_food_lunch',
    accountId: 'acc_wallet',
    toAccountId: null,
    refundOfId: null,
    occurredOn: '2026-11-25',
    note: '牛肉面',
    createdAt: '2026-11-25T12:00:00.000Z',
    updatedAt: '2026-11-25T12:00:00.000Z',
    categoryName: '午餐',
    categoryIcon: 'fast-food-outline',
    categoryColor: '#D97706',
    categoryParentId: 'cat_exp_food',
    categoryParentName: '餐饮美食',
    categoryParentIcon: 'restaurant-outline',
    categoryParentColor: '#D97706',
    accountName: '钱包',
    toAccountName: null,
    refundedCents: 0,
  },
];

describe('export 完整 JSON 备份格式化与导入校验', () => {
  it('生成带完整配置与确定性校验指纹的 v4 标准 JSON 备份', () => {
    const payload = buildLedgerExportPayload({
      accounts: SAMPLE_ACCOUNTS,
      categories: SAMPLE_CATEGORIES,
      transactions: SAMPLE_TRANSACTIONS,
      quickTemplates: SAMPLE_QUICK_TEMPLATES,
      themePreference: 'dark',
      exportedAt: '2026-11-26T13:00:00.000Z',
    });

    const jsonText = serializeLedgerToJson(payload);
    const validated = validateLedgerImportJson(jsonText);

    expect(validated.checksumMatched).toBe(true);
    expect(validated.warnings).toHaveLength(0);
    expect(validated.payload.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(validated.payload.kind).toBe('full-backup');
    expect(validated.payload.settings.themePreference).toBe('dark');
    expect(validated.payload.summary.netWorthCents).toBe(200000);
    expect(validated.payload.summary.totalLiabilitiesYuan).toBe('500.00');
    expect(validated.payload.quickTemplates).toHaveLength(1);
    expect(validated.payload.categories[1]?.parentId).toBe('cat_exp_food');
    expect(validated.payload.transactions[0]?.parentCategoryName).toBe('餐饮美食');
  });

  it('手动修改 JSON 数值后检测出指纹变更，但合法结构仍给出警告并放行', () => {
    const payload = buildLedgerExportPayload({
      accounts: SAMPLE_ACCOUNTS,
      categories: SAMPLE_CATEGORIES,
      transactions: SAMPLE_TRANSACTIONS,
      quickTemplates: SAMPLE_QUICK_TEMPLATES,
      themePreference: 'light',
      exportedAt: '2026-11-26T13:00:00.000Z',
    });

    const edited = JSON.parse(serializeLedgerToJson(payload)) as typeof payload;
    edited.transactions[0]!.note = '手动修改过的备注';

    const validated = validateLedgerImportJson(JSON.stringify(edited));
    expect(validated.checksumMatched).toBe(false);
    expect(validated.warnings.length).toBeGreaterThan(0);
    expect(validated.payload.transactions[0]?.note).toBe('手动修改过的备注');
  });

  it('拦截损坏 JSON、分类配置文件误导与缺失外键引用', () => {
    expect(() => validateLedgerImportJson('{broken')).toThrow('JSON 解析失败');

    expect(() =>
      validateLedgerImportJson(
        JSON.stringify({ app: 'ZeroTally', kind: 'categories', expense: [], income: [] })
      )
    ).toThrow('分类单独配置文件');

    const payload = buildLedgerExportPayload({
      accounts: SAMPLE_ACCOUNTS,
      categories: SAMPLE_CATEGORIES,
      transactions: SAMPLE_TRANSACTIONS,
      quickTemplates: [],
      themePreference: 'system',
    });
    const brokenRef = JSON.parse(serializeLedgerToJson(payload)) as typeof payload;
    brokenRef.transactions[0]!.accountId = 'acc_not_exists';
    expect(() => validateLedgerImportJson(JSON.stringify(brokenRef))).toThrow('引用的账户不存在');
  });

  it('生成规范的带日期导出文件名', () => {
    const date = new Date(2026, 10, 26);
    expect(buildExportFilename(date)).toBe('ZeroTally-2026-11-26.json');
  });

  it('兼容 v3 旧备份导入（按类型归一 kind、继承开关、裁剪非卡字段），拒绝无可选账户并放行超额退款', () => {
    const base = buildLedgerExportPayload({
      accounts: SAMPLE_ACCOUNTS,
      categories: SAMPLE_CATEGORIES,
      transactions: SAMPLE_TRANSACTIONS,
      quickTemplates: [],
      themePreference: 'system',
    });

    // 1. v3 兼容：旧备份 credit 误标为 asset 时自动归一为 liability；cash 夹带卡号自动清空；缺省开关正确回退
    const legacy = JSON.parse(serializeLedgerToJson(base)) as Record<string, unknown>;
    legacy.schemaVersion = 3;
    const legacyAccounts = legacy.accounts as Record<string, unknown>[];
    legacyAccounts[0] = {
      ...legacyAccounts[0],
      includeInNetWorth: false,
      includeInTotalAssets: undefined,
      isSelectable: undefined,
      cardNumber: 'SHOULD_BE_STRIPPED',
    };
    legacyAccounts[1] = {
      ...legacyAccounts[1],
      kind: 'asset', // 旧版错误手选性质
      category: 'credit',
      cardNumber: '6225 1234',
      openedOn: '2024-05-20',
    };
    const validatedLegacy = validateLedgerImportJson(JSON.stringify(legacy));
    expect(validatedLegacy.payload.accounts[0]?.includeInTotalAssets).toBe(false);
    expect(validatedLegacy.payload.accounts[0]?.isSelectable).toBe(true);
    expect(validatedLegacy.payload.accounts[0]?.cardNumber).toBe('');
    expect(validatedLegacy.payload.accounts[1]?.kind).toBe('liability');
    expect(validatedLegacy.payload.accounts[1]?.cardNumber).toBe('6225 1234');

    // 2. 拒绝所有未归档账户均不可选的备份
    const noSelectable = JSON.parse(serializeLedgerToJson(base)) as typeof base;
    for (const acc of noSelectable.accounts) {
      acc.isSelectable = false;
    }
    expect(() => validateLedgerImportJson(JSON.stringify(noSelectable))).toThrow(
      '未归档且交易可选的账户'
    );

    // 3. 放行超额退款（原支出 32.50，退款 50.00）
    const overRefundPayload = JSON.parse(serializeLedgerToJson(base)) as typeof base;
    overRefundPayload.transactions.push({
      ...overRefundPayload.transactions[0]!,
      id: 'tx_over_refund',
      type: 'refund',
      typeLabel: '退款',
      amountCents: 5000,
      amountYuan: '50.00',
      refundOfId: 'tx_1',
      refundedCents: 0,
      note: '含运费补偿',
    });
    const validatedOverRefund = validateLedgerImportJson(JSON.stringify(overRefundPayload));
    expect(validatedOverRefund.payload.transactions).toHaveLength(2);
  });
});
