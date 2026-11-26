import type { SqlExecutor } from '../../db/types';
import { getTodayIsoDate, shiftIsoDate } from '../../shared/date/date';
import { createId } from '../../shared/id/id';
import { MAX_AMOUNT_CENTS } from '../../shared/money/money';
import { findAccountById } from '../accounts/repository';
import { findCategoryById } from '../categories/repository';
import { createTransaction } from '../transactions/service';
import type { Transaction } from '../transactions/types';
import {
  deleteQuickTemplateRow,
  findActiveQuickTemplateButtons,
  findAllQuickTemplates,
  findQuickTemplateById,
  findRecommendedQuickButtons,
  getNextQuickTemplateSortOrder,
  insertQuickTemplateRow,
  updateQuickTemplateRow,
} from './repository';
import type {
  CreateQuickTemplateInput,
  QuickRecordButtonItem,
  QuickTemplate,
  UpdateQuickTemplateInput,
} from './types';

function normalizeQuickTemplateInput(input: CreateQuickTemplateInput): CreateQuickTemplateInput {
  const name = input.name.trim();
  if (!name) {
    throw new Error('请输入快捷项名称');
  }
  if (name.length > 12) {
    throw new Error('快捷项名称不能超过 12 个字符');
  }
  if (
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents <= 0 ||
    input.amountCents > MAX_AMOUNT_CENTS
  ) {
    throw new Error('请输入大于 0 且在有效范围内的金额');
  }
  const note = (input.note ?? '').trim();
  if (note.length > 60) {
    throw new Error('默认备注不能超过 60 个字符');
  }
  return {
    ...input,
    name,
    note,
  };
}

async function verifyTemplateReferences(
  db: SqlExecutor,
  input: CreateQuickTemplateInput
): Promise<void> {
  const [category, account] = await Promise.all([
    findCategoryById(db, input.categoryId),
    findAccountById(db, input.accountId),
  ]);
  if (!category || category.isArchived) {
    throw new Error('所选分类不可用');
  }
  if (category.type !== input.type) {
    throw new Error('所选分类与收支类型不匹配');
  }
  if (!account || account.isArchived) {
    throw new Error('所选账户不可用');
  }
}

export async function listAllQuickTemplates(db: SqlExecutor): Promise<QuickTemplate[]> {
  return findAllQuickTemplates(db);
}

/**
 * 加载快捷记账面板按钮列表：
 * - 若用户已自定义模板，优先展示自定义模板；
 * - 若尚未自定义，自动回退为近 30 天高频消费/收入推荐按钮。
 */
export async function listQuickRecordButtons(
  db: SqlExecutor,
  todayIso: string = getTodayIsoDate()
): Promise<{ mode: 'custom' | 'recommended'; items: QuickRecordButtonItem[] }> {
  const custom = await findActiveQuickTemplateButtons(db);
  if (custom.length > 0) {
    return { mode: 'custom', items: custom };
  }
  const sinceIso = shiftIsoDate(todayIso, -30);
  const recommended = await findRecommendedQuickButtons(db, sinceIso, 8);
  return { mode: 'recommended', items: recommended };
}

export async function createQuickTemplate(
  db: SqlExecutor,
  rawInput: CreateQuickTemplateInput
): Promise<QuickTemplate> {
  const input = normalizeQuickTemplateInput(rawInput);
  await verifyTemplateReferences(db, input);

  const now = new Date().toISOString();
  const sortOrder = await getNextQuickTemplateSortOrder(db);
  const record: QuickTemplate = {
    id: createId('qtp'),
    name: input.name,
    type: input.type,
    amountCents: input.amountCents,
    categoryId: input.categoryId,
    accountId: input.accountId,
    note: input.note ?? '',
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
  await insertQuickTemplateRow(db, record);
  return record;
}

export async function updateQuickTemplate(
  db: SqlExecutor,
  id: string,
  rawInput: UpdateQuickTemplateInput
): Promise<QuickTemplate> {
  const existing = await findQuickTemplateById(db, id);
  if (!existing) {
    throw new Error('快捷项不存在');
  }
  const input = normalizeQuickTemplateInput(rawInput);
  await verifyTemplateReferences(db, input);

  const updated: QuickTemplate = {
    ...existing,
    name: input.name,
    type: input.type,
    amountCents: input.amountCents,
    categoryId: input.categoryId,
    accountId: input.accountId,
    note: input.note ?? '',
    updatedAt: new Date().toISOString(),
  };
  await updateQuickTemplateRow(db, updated);
  return updated;
}

export async function deleteQuickTemplate(db: SqlExecutor, id: string): Promise<void> {
  await deleteQuickTemplateRow(db, id);
}

/**
 * 一键快捷记账：直接根据按钮配置原子写入当日交易并联动余额。
 */
export async function executeQuickRecord(
  db: SqlExecutor,
  item: Pick<QuickRecordButtonItem, 'type' | 'amountCents' | 'categoryId' | 'accountId' | 'note'>,
  occurredOn: string = getTodayIsoDate()
): Promise<Transaction> {
  return createTransaction(db, {
    type: item.type,
    amountCents: item.amountCents,
    categoryId: item.categoryId,
    accountId: item.accountId,
    toAccountId: null,
    occurredOn,
    note: item.note,
  });
}
