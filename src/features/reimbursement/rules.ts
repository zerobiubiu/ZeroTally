import { isValidIsoDate } from '../../shared/date/date';
import { MAX_AMOUNT_CENTS } from '../../shared/money/money';
import type {
  ReimbursementConfig,
  ReimbursementRecord,
  ReimbursementSettlementMode,
  ReimbursementSummary,
} from './types';

export const REIMBURSEMENT_CONFIG_KEY = 'reimbursement_config_v1';
export const REIMBURSEMENT_RECORDS_KEY = 'reimbursement_records_v1';
export const MAX_REIMBURSEMENT_NOTE_LENGTH = 80;

export const DEFAULT_REIMBURSEMENT_CONFIG: ReimbursementConfig = {
  enabled: false,
  defaultSettlementMode: 'refund',
};

function isSettlementMode(val: unknown): val is ReimbursementSettlementMode {
  return val === 'refund' || val === 'income';
}

export function parseReimbursementConfig(raw: string | null): ReimbursementConfig {
  if (!raw) {
    return { ...DEFAULT_REIMBURSEMENT_CONFIG };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ReimbursementConfig>;
    return {
      enabled: parsed.enabled === true,
      defaultSettlementMode: isSettlementMode(parsed.defaultSettlementMode)
        ? parsed.defaultSettlementMode
        : 'refund',
    };
  } catch {
    return { ...DEFAULT_REIMBURSEMENT_CONFIG };
  }
}

export function parseReimbursementRecords(raw: string | null): ReimbursementRecord[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const valid: ReimbursementRecord[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Partial<ReimbursementRecord>;
      if (typeof rec.transactionId !== 'string' || rec.transactionId.trim().length === 0) continue;
      if (seen.has(rec.transactionId)) continue;
      if (rec.status !== 'pending' && rec.status !== 'reimbursed') continue;
      if (
        typeof rec.expectedCents !== 'number' ||
        !Number.isSafeInteger(rec.expectedCents) ||
        rec.expectedCents <= 0
      ) {
        continue;
      }
      seen.add(rec.transactionId);
      valid.push({
        transactionId: rec.transactionId,
        status: rec.status,
        expectedCents: Math.min(MAX_AMOUNT_CENTS, rec.expectedCents),
        settledCents:
          typeof rec.settledCents === 'number' &&
          Number.isSafeInteger(rec.settledCents) &&
          rec.settledCents >= 0
            ? Math.min(MAX_AMOUNT_CENTS, rec.settledCents)
            : 0,
        settlementMode: isSettlementMode(rec.settlementMode) ? rec.settlementMode : null,
        settlementTransactionId:
          typeof rec.settlementTransactionId === 'string' && rec.settlementTransactionId.length > 0
            ? rec.settlementTransactionId
            : null,
        settledOn:
          typeof rec.settledOn === 'string' && isValidIsoDate(rec.settledOn) ? rec.settledOn : null,
        settledAccountId:
          typeof rec.settledAccountId === 'string' && rec.settledAccountId.length > 0
            ? rec.settledAccountId
            : null,
        note: typeof rec.note === 'string' ? rec.note.slice(0, MAX_REIMBURSEMENT_NOTE_LENGTH) : '',
        createdAt: typeof rec.createdAt === 'string' ? rec.createdAt : new Date(0).toISOString(),
        updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : new Date(0).toISOString(),
      });
    }
    return valid;
  } catch {
    return [];
  }
}

export function validateReimbursementExpectedCents(expectedCents: number): number {
  if (!Number.isSafeInteger(expectedCents) || expectedCents <= 0) {
    throw new Error('预计报销金额必须大于 0');
  }
  if (expectedCents > MAX_AMOUNT_CENTS) {
    throw new Error('报销金额超出支持上限');
  }
  return expectedCents;
}

export function validateReimbursementSettleInput(params: {
  amountCents: number;
  occurredOn: string;
  accountId: string;
  mode: ReimbursementSettlementMode;
}): void {
  if (!Number.isSafeInteger(params.amountCents) || params.amountCents <= 0) {
    throw new Error('报销入账金额必须大于 0');
  }
  if (params.amountCents > MAX_AMOUNT_CENTS) {
    throw new Error('报销入账金额超出支持上限');
  }
  if (!isValidIsoDate(params.occurredOn)) {
    throw new Error('报销到账日期格式不正确');
  }
  if (!params.accountId.trim()) {
    throw new Error('请选择报销收款账户');
  }
  if (!isSettlementMode(params.mode)) {
    throw new Error('不支持的报销入账方式');
  }
}

export function computeReimbursementSummary(
  records: readonly Pick<ReimbursementRecord, 'status' | 'expectedCents' | 'settledCents'>[]
): ReimbursementSummary {
  let pendingCount = 0;
  let pendingTotalCents = 0;
  let reimbursedCount = 0;
  let reimbursedTotalCents = 0;

  for (const rec of records) {
    if (rec.status === 'pending') {
      pendingCount += 1;
      pendingTotalCents += rec.expectedCents;
    } else {
      reimbursedCount += 1;
      reimbursedTotalCents += rec.settledCents;
    }
  }

  return {
    pendingCount,
    pendingTotalCents,
    reimbursedCount,
    reimbursedTotalCents,
  };
}
