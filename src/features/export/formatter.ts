import { isValidIsoDate } from '../../shared/date/date';
import { CHECKSUM_ALGORITHM, computeJsonChecksum } from '../../shared/integrity/checksum';
import { formatCentsPlain, MAX_AMOUNT_CENTS } from '../../shared/money/money';
import type { ThemePreference } from '../../theme/theme-context';
import { computeNetWorthSummary, getAccountCategoryMeta } from '../accounts/rules';
import type { Account, AccountCategory, AccountKind } from '../accounts/types';
import type { Category, CategoryType } from '../categories/types';
import type { QuickTemplate } from '../quick-record/types';
import type { TransactionListItem, TransactionType } from '../transactions/types';
import type {
  ExportedAccount,
  ExportedCategory,
  ExportedQuickTemplate,
  ExportedTransaction,
  LedgerExportPayload,
  ValidatedLedgerImport,
} from './types';

export const EXPORT_SCHEMA_VERSION = 3;

const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  expense: '支出',
  income: '收入',
  transfer: '转账',
  refund: '退款',
};

const VALID_ACCOUNT_KINDS: ReadonlySet<string> = new Set<AccountKind>(['asset', 'liability']);
const VALID_ACCOUNT_CATEGORIES: ReadonlySet<string> = new Set<AccountCategory>([
  'cash',
  'bank',
  'digital',
  'investment',
  'credit',
  'loan',
  'other',
]);
const VALID_CATEGORY_TYPES: ReadonlySet<string> = new Set<CategoryType>(['expense', 'income']);
const VALID_TX_TYPES: ReadonlySet<string> = new Set<TransactionType>([
  'expense',
  'income',
  'transfer',
  'refund',
]);
const VALID_THEME_PREFS: ReadonlySet<string> = new Set<ThemePreference>([
  'system',
  'light',
  'dark',
]);
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function computeBackupCoreChecksum(core: {
  settings: LedgerExportPayload['settings'];
  accounts: readonly ExportedAccount[];
  categories: readonly ExportedCategory[];
  quickTemplates: readonly ExportedQuickTemplate[];
  transactions: readonly ExportedTransaction[];
}): string {
  return computeJsonChecksum(core);
}

/**
 * 构建完整可恢复的 JSON 账本与配置导出对象（含外观设置、账户、分类、快捷模板、交易明细与完整性校验指纹）。
 */
export function buildLedgerExportPayload(params: {
  accounts: readonly Account[];
  categories: readonly Category[];
  transactions: readonly TransactionListItem[];
  quickTemplates?: readonly QuickTemplate[];
  themePreference?: ThemePreference;
  exportedAt?: string;
}): LedgerExportPayload {
  const exportedAt = params.exportedAt ?? new Date().toISOString();
  const themePreference: ThemePreference = params.themePreference ?? 'system';
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
    icon: acc.icon,
    color: acc.color,
    sortOrder: acc.sortOrder,
    isArchived: acc.isArchived,
    note: acc.note,
    createdAt: acc.createdAt,
    updatedAt: acc.updatedAt,
  }));

  const categoryNameById = new Map(params.categories.map((cat) => [cat.id, cat.name]));
  const categories: ExportedCategory[] = params.categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    type: cat.type,
    typeLabel: cat.type === 'income' ? '收入' : '支出',
    icon: cat.icon,
    color: cat.color,
    parentId: cat.parentId,
    parentName: cat.parentId ? (categoryNameById.get(cat.parentId) ?? null) : null,
    sortOrder: cat.sortOrder,
    isSystem: cat.isSystem,
    isArchived: cat.isArchived,
    createdAt: cat.createdAt,
  }));

  const quickTemplates: ExportedQuickTemplate[] = (params.quickTemplates ?? []).map((tpl) => ({
    id: tpl.id,
    name: tpl.name,
    type: tpl.type,
    amountCents: tpl.amountCents,
    amountYuan: formatCentsPlain(tpl.amountCents, false),
    categoryId: tpl.categoryId,
    accountId: tpl.accountId,
    note: tpl.note,
    sortOrder: tpl.sortOrder,
    createdAt: tpl.createdAt,
    updatedAt: tpl.updatedAt,
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
    parentCategoryName: tx.categoryParentName,
    accountId: tx.accountId,
    accountName: tx.accountName,
    toAccountId: tx.toAccountId,
    toAccountName: tx.toAccountName,
    refundOfId: tx.refundOfId,
    refundedCents: tx.refundedCents,
    note: tx.note,
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt,
  }));

  const settings = { themePreference };
  const checksum = computeBackupCoreChecksum({
    settings,
    accounts,
    categories,
    quickTemplates,
    transactions,
  });

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    app: 'ZeroTally',
    kind: 'full-backup',
    currency: 'CNY',
    exportedAt,
    integrity: {
      algorithm: CHECKSUM_ALGORITHM,
      checksum,
    },
    settings,
    summary: {
      netWorthCents: netWorth.netWorthCents,
      netWorthYuan: formatCentsPlain(netWorth.netWorthCents, false),
      totalAssetsCents: netWorth.totalAssetsCents,
      totalAssetsYuan: formatCentsPlain(netWorth.totalAssetsCents, false),
      totalLiabilitiesCents: netWorth.totalLiabilitiesCents,
      totalLiabilitiesYuan: formatCentsPlain(netWorth.totalLiabilitiesCents, false),
      accountCount: accounts.length,
      categoryCount: categories.length,
      quickTemplateCount: quickTemplates.length,
      transactionCount: transactions.length,
    },
    accounts,
    categories,
    quickTemplates,
    transactions,
  };
}

/**
 * 序列化为带 2 空格缩进的标准 JSON 文本。
 */
export function serializeLedgerToJson(payload: LedgerExportPayload): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function buildExportFilename(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `ZeroTally-${y}-${m}-${d}.json`;
}

/**
 * 严格校验全量账本与配置 JSON（兼容 v2 / v3，校验字段类型、引用外键、退款上限与完整性校验指纹）。
 */
export function validateLedgerImportJson(rawText: string): ValidatedLedgerImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('JSON 解析失败，文件可能已损坏或格式无效');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('备份文件根节点必须为 JSON 对象');
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.kind === 'categories') {
    throw new Error('检测到分类单独配置文件，请前往「分类管理」右上角导入');
  }
  if (obj.app !== 'ZeroTally' && obj.app !== 'keep-accounts') {
    throw new Error('仅支持导入 ZeroTally 导出的 JSON 备份文件');
  }

  const schemaVersion = typeof obj.schemaVersion === 'number' ? obj.schemaVersion : 0;
  if (schemaVersion < 1 || schemaVersion > EXPORT_SCHEMA_VERSION) {
    throw new Error(`不支持的备份格式版本：v${schemaVersion}`);
  }

  if (!Array.isArray(obj.accounts) || !Array.isArray(obj.categories) || !Array.isArray(obj.transactions)) {
    throw new Error('备份文件缺少必需的 accounts / categories / transactions 数组');
  }

  const fallbackNow =
    typeof obj.exportedAt === 'string' && obj.exportedAt ? obj.exportedAt : new Date().toISOString();

  // 1. 校验账户
  const accountIds = new Set<string>();
  const accounts: ExportedAccount[] = [];
  for (let i = 0; i < obj.accounts.length; i += 1) {
    const raw = obj.accounts[i];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`账户第 ${i + 1} 项格式无效`);
    }
    const a = raw as Record<string, unknown>;
    const id = typeof a.id === 'string' ? a.id.trim() : '';
    const name = typeof a.name === 'string' ? a.name.trim() : '';
    if (!id || !name) {
      throw new Error(`账户第 ${i + 1} 项缺少有效 id 或 name`);
    }
    if (accountIds.has(id)) {
      throw new Error(`存在重复的账户 ID：${id}`);
    }
    accountIds.add(id);

    const kind = a.kind;
    if (typeof kind !== 'string' || !VALID_ACCOUNT_KINDS.has(kind)) {
      throw new Error(`账户「${name}」的 kind 无效`);
    }
    const category = a.category;
    if (typeof category !== 'string' || !VALID_ACCOUNT_CATEGORIES.has(category)) {
      throw new Error(`账户「${name}」的 category 无效`);
    }
    const balanceCents = a.balanceCents;
    if (typeof balanceCents !== 'number' || !Number.isSafeInteger(balanceCents)) {
      throw new Error(`账户「${name}」的余额必须为安全整数（分）`);
    }

    const color =
      typeof a.color === 'string' && HEX_COLOR_RE.test(a.color) ? a.color : '#017853';
    const icon = typeof a.icon === 'string' && a.icon.trim() ? a.icon.trim() : 'wallet-outline';
    const sortOrder =
      typeof a.sortOrder === 'number' && Number.isFinite(a.sortOrder)
        ? Math.round(a.sortOrder)
        : (i + 1) * 10;

    accounts.push({
      id,
      name,
      kind: kind as AccountKind,
      kindLabel: kind === 'liability' ? '负债' : '资产',
      category: category as AccountCategory,
      categoryLabel: getAccountCategoryMeta(category as AccountCategory).label,
      balanceCents,
      balanceYuan: formatCentsPlain(balanceCents, false),
      includeInNetWorth: a.includeInNetWorth !== false,
      icon,
      color,
      sortOrder,
      isArchived: a.isArchived === true,
      note: typeof a.note === 'string' ? a.note : '',
      createdAt: typeof a.createdAt === 'string' && a.createdAt ? a.createdAt : fallbackNow,
      updatedAt: typeof a.updatedAt === 'string' && a.updatedAt ? a.updatedAt : fallbackNow,
    });
  }

  if (!accounts.some((a) => !a.isArchived)) {
    throw new Error('备份文件中至少需要包含 1 个可用（未停用）账户');
  }

  // 2. 校验分类
  const categoryMap = new Map<string, ExportedCategory>();
  const categories: ExportedCategory[] = [];
  for (let i = 0; i < obj.categories.length; i += 1) {
    const raw = obj.categories[i];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`分类第 ${i + 1} 项格式无效`);
    }
    const c = raw as Record<string, unknown>;
    const id = typeof c.id === 'string' ? c.id.trim() : '';
    const name = typeof c.name === 'string' ? c.name.trim() : '';
    if (!id || !name) {
      throw new Error(`分类第 ${i + 1} 项缺少有效 id 或 name`);
    }
    if (categoryMap.has(id)) {
      throw new Error(`存在重复的分类 ID：${id}`);
    }
    const type = c.type;
    if (typeof type !== 'string' || !VALID_CATEGORY_TYPES.has(type)) {
      throw new Error(`分类「${name}」的 type 无效`);
    }
    const parentId = typeof c.parentId === 'string' && c.parentId.trim() ? c.parentId.trim() : null;
    const color =
      typeof c.color === 'string' && HEX_COLOR_RE.test(c.color)
        ? c.color
        : type === 'income'
          ? '#059669'
          : '#D97706';
    const icon = typeof c.icon === 'string' && c.icon.trim() ? c.icon.trim() : 'pricetag-outline';
    const sortOrder =
      typeof c.sortOrder === 'number' && Number.isFinite(c.sortOrder)
        ? Math.round(c.sortOrder)
        : (i + 1) * 10;

    const item: ExportedCategory = {
      id,
      name,
      type: type as CategoryType,
      typeLabel: type === 'income' ? '收入' : '支出',
      icon,
      color,
      parentId,
      parentName: typeof c.parentName === 'string' ? c.parentName : null,
      sortOrder,
      isSystem: c.isSystem === true,
      isArchived: c.isArchived === true,
      createdAt: typeof c.createdAt === 'string' && c.createdAt ? c.createdAt : fallbackNow,
    };
    categoryMap.set(id, item);
    categories.push(item);
  }

  for (const cat of categories) {
    if (cat.parentId !== null) {
      if (cat.parentId === cat.id) {
        throw new Error(`分类「${cat.name}」存在循环父级引用`);
      }
      const parent = categoryMap.get(cat.parentId);
      if (!parent) {
        throw new Error(`分类「${cat.name}」引用的上级分类不存在：${cat.parentId}`);
      }
      if (parent.parentId !== null) {
        throw new Error(`分类「${cat.name}」超过两级层级限制`);
      }
      if (parent.type !== cat.type) {
        throw new Error(`分类「${cat.name}」与上级分类类型不一致`);
      }
    }
  }

  if (
    !categories.some((c) => c.type === 'expense' && c.parentId === null && !c.isArchived) ||
    !categories.some((c) => c.type === 'income' && c.parentId === null && !c.isArchived)
  ) {
    throw new Error('备份文件中支出与收入各自至少需包含 1 个启用的一级分类');
  }

  // 3. 校验交易明细（含外键与退款总额上限）
  const txMap = new Map<string, ExportedTransaction>();
  const transactions: ExportedTransaction[] = [];
  for (let i = 0; i < obj.transactions.length; i += 1) {
    const raw = obj.transactions[i];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`交易第 ${i + 1} 项格式无效`);
    }
    const t = raw as Record<string, unknown>;
    const id = typeof t.id === 'string' ? t.id.trim() : '';
    if (!id) {
      throw new Error(`交易第 ${i + 1} 项缺少 id`);
    }
    if (txMap.has(id)) {
      throw new Error(`存在重复的交易 ID：${id}`);
    }
    const type = t.type;
    if (typeof type !== 'string' || !VALID_TX_TYPES.has(type)) {
      throw new Error(`交易 ${id} 的 type 无效`);
    }
    const amountCents = t.amountCents;
    if (
      typeof amountCents !== 'number' ||
      !Number.isSafeInteger(amountCents) ||
      amountCents <= 0 ||
      amountCents > MAX_AMOUNT_CENTS
    ) {
      throw new Error(`交易 ${id} 的金额无效`);
    }
    const occurredOn = typeof t.occurredOn === 'string' ? t.occurredOn : '';
    if (!isValidIsoDate(occurredOn)) {
      throw new Error(`交易 ${id} 的日期格式无效：${occurredOn}`);
    }
    const accountId = typeof t.accountId === 'string' ? t.accountId.trim() : '';
    if (!accountIds.has(accountId)) {
      throw new Error(`交易 ${id} 引用的账户不存在：${accountId}`);
    }

    const toAccountId =
      typeof t.toAccountId === 'string' && t.toAccountId.trim() ? t.toAccountId.trim() : null;
    const categoryId =
      typeof t.categoryId === 'string' && t.categoryId.trim() ? t.categoryId.trim() : null;
    const refundOfId =
      typeof t.refundOfId === 'string' && t.refundOfId.trim() ? t.refundOfId.trim() : null;

    if (type === 'transfer') {
      if (!toAccountId || !accountIds.has(toAccountId) || toAccountId === accountId) {
        throw new Error(`转账交易 ${id} 的转入账户无效`);
      }
      if (categoryId !== null || refundOfId !== null) {
        throw new Error(`转账交易 ${id} 不能携带分类或退款关联`);
      }
    } else if (type === 'refund') {
      if (!categoryId || !categoryMap.has(categoryId) || !refundOfId || refundOfId === id) {
        throw new Error(`退款交易 ${id} 缺少有效的原支出或分类引用`);
      }
      if (toAccountId !== null) {
        throw new Error(`退款交易 ${id} 不能携带转入账户`);
      }
    } else {
      const cat = categoryId ? categoryMap.get(categoryId) : undefined;
      if (!cat || cat.type !== type) {
        throw new Error(`收支交易 ${id} 引用的分类不存在或类型不匹配`);
      }
      if (toAccountId !== null || refundOfId !== null) {
        throw new Error(`收支交易 ${id} 包含非法关联字段`);
      }
    }

    const item: ExportedTransaction = {
      id,
      occurredOn,
      type: type as TransactionType,
      typeLabel: TRANSACTION_TYPE_LABELS[type as TransactionType],
      amountCents,
      amountYuan: formatCentsPlain(amountCents, false),
      categoryId,
      categoryName: typeof t.categoryName === 'string' ? t.categoryName : null,
      parentCategoryName: typeof t.parentCategoryName === 'string' ? t.parentCategoryName : null,
      accountId,
      accountName: typeof t.accountName === 'string' ? t.accountName : '',
      toAccountId,
      toAccountName: typeof t.toAccountName === 'string' ? t.toAccountName : null,
      refundOfId,
      refundedCents: typeof t.refundedCents === 'number' ? t.refundedCents : 0,
      note: typeof t.note === 'string' ? t.note : '',
      createdAt: typeof t.createdAt === 'string' && t.createdAt ? t.createdAt : fallbackNow,
      updatedAt: typeof t.updatedAt === 'string' && t.updatedAt ? t.updatedAt : fallbackNow,
    };
    txMap.set(id, item);
    transactions.push(item);
  }

  // 校验退款外键与累计退款不超原支出
  const refundedSumByOrig = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type === 'refund') {
      const orig = tx.refundOfId ? txMap.get(tx.refundOfId) : undefined;
      if (!orig || orig.type !== 'expense') {
        throw new Error(`退款交易 ${tx.id} 指向的原支出记录不存在`);
      }
      const nextSum = (refundedSumByOrig.get(orig.id) ?? 0) + tx.amountCents;
      if (nextSum > orig.amountCents) {
        throw new Error(`原支出 ${orig.id} 的累计退款总额超过原支出金额`);
      }
      refundedSumByOrig.set(orig.id, nextSum);
    }
  }

  // 4. 校验快捷模板（v3 新增，旧版缺失时自动视为空数组）
  const rawQuickTemplates = obj.quickTemplates ?? [];
  if (!Array.isArray(rawQuickTemplates)) {
    throw new Error('quickTemplates 字段必须为数组');
  }
  const quickTemplateIds = new Set<string>();
  const quickTemplates: ExportedQuickTemplate[] = [];
  for (let i = 0; i < rawQuickTemplates.length; i += 1) {
    const raw = rawQuickTemplates[i];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`快捷模板第 ${i + 1} 项格式无效`);
    }
    const q = raw as Record<string, unknown>;
    const id = typeof q.id === 'string' ? q.id.trim() : '';
    const name = typeof q.name === 'string' ? q.name.trim() : '';
    const type = q.type;
    const amountCents = q.amountCents;
    const categoryId = typeof q.categoryId === 'string' ? q.categoryId.trim() : '';
    const accountId = typeof q.accountId === 'string' ? q.accountId.trim() : '';
    if (!id || !name || quickTemplateIds.has(id)) {
      throw new Error(`快捷模板第 ${i + 1} 项缺少唯一 id 或名称`);
    }
    quickTemplateIds.add(id);
    if (type !== 'expense' && type !== 'income') {
      throw new Error(`快捷模板「${name}」的类型无效`);
    }
    if (
      typeof amountCents !== 'number' ||
      !Number.isSafeInteger(amountCents) ||
      amountCents <= 0 ||
      amountCents > MAX_AMOUNT_CENTS
    ) {
      throw new Error(`快捷模板「${name}」的金额无效`);
    }
    const cat = categoryMap.get(categoryId);
    if (!cat || cat.type !== type) {
      throw new Error(`快捷模板「${name}」引用的分类无效`);
    }
    if (!accountIds.has(accountId)) {
      throw new Error(`快捷模板「${name}」引用的账户不存在`);
    }

    quickTemplates.push({
      id,
      name,
      type,
      amountCents,
      amountYuan: formatCentsPlain(amountCents, false),
      categoryId,
      accountId,
      note: typeof q.note === 'string' ? q.note : '',
      sortOrder:
        typeof q.sortOrder === 'number' && Number.isFinite(q.sortOrder)
          ? Math.round(q.sortOrder)
          : (i + 1) * 10,
      createdAt: typeof q.createdAt === 'string' && q.createdAt ? q.createdAt : fallbackNow,
      updatedAt: typeof q.updatedAt === 'string' && q.updatedAt ? q.updatedAt : fallbackNow,
    });
  }

  // 5. 解析外观配置
  let themePreference: ThemePreference = 'system';
  if (obj.settings && typeof obj.settings === 'object' && !Array.isArray(obj.settings)) {
    const pref = (obj.settings as Record<string, unknown>).themePreference;
    if (typeof pref === 'string' && VALID_THEME_PREFS.has(pref)) {
      themePreference = pref as ThemePreference;
    }
  }

  // 6. 校验完整性指纹（若存在指纹且与核心数据计算不一致，发出警示但允许确认后导入）
  const warnings: string[] = [];
  let checksumMatched = true;
  const integrity = obj.integrity;
  if (integrity && typeof integrity === 'object' && !Array.isArray(integrity)) {
    const expected = (integrity as Record<string, unknown>).checksum;
    if (typeof expected === 'string' && expected.length > 0) {
      const actual = computeJsonChecksum({
        settings: obj.settings,
        accounts: obj.accounts,
        categories: obj.categories,
        quickTemplates: obj.quickTemplates ?? [],
        transactions: obj.transactions,
      });
      if (actual !== expected) {
        checksumMatched = false;
        warnings.push('校验指纹已变更（文件可能经过外部手动编辑），数据结构与外键校验均已通过');
      }
    } else {
      checksumMatched = false;
      warnings.push('该备份未包含校验指纹（兼容旧版导出格式）');
    }
  } else {
    checksumMatched = false;
    warnings.push('该备份为旧版格式，未包含校验指纹，已按结构规则校验通过');
  }

  const netWorth = computeNetWorthSummary(accounts);

  const normalizedPayload: LedgerExportPayload = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    app: 'ZeroTally',
    kind: 'full-backup',
    currency: 'CNY',
    exportedAt: fallbackNow,
    integrity: {
      algorithm: CHECKSUM_ALGORITHM,
      checksum: computeBackupCoreChecksum({
        settings: { themePreference },
        accounts,
        categories,
        quickTemplates,
        transactions,
      }),
    },
    settings: { themePreference },
    summary: {
      netWorthCents: netWorth.netWorthCents,
      netWorthYuan: formatCentsPlain(netWorth.netWorthCents, false),
      totalAssetsCents: netWorth.totalAssetsCents,
      totalAssetsYuan: formatCentsPlain(netWorth.totalAssetsCents, false),
      totalLiabilitiesCents: netWorth.totalLiabilitiesCents,
      totalLiabilitiesYuan: formatCentsPlain(netWorth.totalLiabilitiesCents, false),
      accountCount: accounts.length,
      categoryCount: categories.length,
      quickTemplateCount: quickTemplates.length,
      transactionCount: transactions.length,
    },
    accounts,
    categories,
    quickTemplates,
    transactions,
  };

  return {
    payload: normalizedPayload,
    checksumMatched,
    warnings,
  };
}
