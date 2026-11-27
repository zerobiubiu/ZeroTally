/**
 * 报销配置与状态记录轻量持久化仓储（基于 app_settings 键值表，零 Schema 破坏、零跨业务反向依赖）。
 */
import type { SqlExecutor } from '../../db/types';
import { getAppSetting, setAppSetting } from '../settings/repository';
import {
  MAX_REIMBURSEMENT_NOTE_LENGTH,
  parseReimbursementConfig,
  parseReimbursementRecords,
  REIMBURSEMENT_CONFIG_KEY,
  REIMBURSEMENT_RECORDS_KEY,
  validateReimbursementExpectedCents,
} from './rules';
import type { ReimbursementConfig, ReimbursementRecord } from './types';

export async function getReimbursementConfig(db: SqlExecutor): Promise<ReimbursementConfig> {
  const raw = await getAppSetting(db, REIMBURSEMENT_CONFIG_KEY);
  return parseReimbursementConfig(raw);
}

export async function saveReimbursementConfig(
  db: SqlExecutor,
  config: ReimbursementConfig
): Promise<ReimbursementConfig> {
  const normalized: ReimbursementConfig = {
    enabled: Boolean(config.enabled),
    defaultSettlementMode: config.defaultSettlementMode === 'income' ? 'income' : 'refund',
  };
  await setAppSetting(db, REIMBURSEMENT_CONFIG_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function listRawReimbursementRecords(db: SqlExecutor): Promise<ReimbursementRecord[]> {
  const raw = await getAppSetting(db, REIMBURSEMENT_RECORDS_KEY);
  return parseReimbursementRecords(raw);
}

export async function saveRawReimbursementRecords(
  db: SqlExecutor,
  records: readonly ReimbursementRecord[]
): Promise<void> {
  await setAppSetting(db, REIMBURSEMENT_RECORDS_KEY, JSON.stringify(records));
}

export async function getReimbursementRecordByTxId(
  db: SqlExecutor,
  transactionId: string
): Promise<ReimbursementRecord | null> {
  const records = await listRawReimbursementRecords(db);
  return records.find((item) => item.transactionId === transactionId) ?? null;
}

export async function upsertPendingReimbursementRecord(
  db: SqlExecutor,
  params: { transactionId: string; expectedCents: number; note?: string }
): Promise<ReimbursementRecord> {
  const expectedCents = validateReimbursementExpectedCents(params.expectedCents);
  const records = await listRawReimbursementRecords(db);
  const now = new Date().toISOString();
  const note = (params.note ?? '').trim().slice(0, MAX_REIMBURSEMENT_NOTE_LENGTH);

  const existingIdx = records.findIndex((item) => item.transactionId === params.transactionId);
  if (existingIdx >= 0) {
    const existing = records[existingIdx]!;
    if (existing.status === 'reimbursed') {
      throw new Error('该笔支出已完成报销，无法重新设为待报销');
    }
    const updated: ReimbursementRecord = {
      ...existing,
      expectedCents,
      note,
      updatedAt: now,
    };
    const next = [...records];
    next[existingIdx] = updated;
    await saveRawReimbursementRecords(db, next);
    return updated;
  }

  const created: ReimbursementRecord = {
    transactionId: params.transactionId,
    status: 'pending',
    expectedCents,
    settledCents: 0,
    settlementMode: null,
    settlementTransactionId: null,
    settledOn: null,
    settledAccountId: null,
    note,
    createdAt: now,
    updatedAt: now,
  };
  await saveRawReimbursementRecords(db, [created, ...records]);
  return created;
}

export async function removeReimbursementRecord(
  db: SqlExecutor,
  transactionId: string
): Promise<boolean> {
  const records = await listRawReimbursementRecords(db);
  const next = records.filter((item) => item.transactionId !== transactionId);
  if (next.length === records.length) {
    return false;
  }
  await saveRawReimbursementRecords(db, next);
  return true;
}
