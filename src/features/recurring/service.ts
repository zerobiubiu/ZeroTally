import type { SqlExecutor } from '../../db/types';
import { getTodayIsoDate } from '../../shared/date/date';
import { createId } from '../../shared/id/id';
import { formatCentsToYuan } from '../../shared/money/money';
import { getAppSetting, setAppSetting } from '../settings/repository';
import { createTransaction } from '../transactions/service';
import type { Transaction } from '../transactions/types';
import {
  computeNextMortgageInstallment,
  simulateMortgagePrepayment,
} from './mortgage-rules';
import {
  getPeriodKeyForDate,
  isPlanDueForDate,
  parseRecurringPlans,
  RECURRING_PLANS_SETTING_KEY,
  resolveSalaryPosting,
} from './rules';
import type {
  MortgagePrepaymentMode,
  RecurringPlan,
  SalaryAdjustmentInput,
} from './types';

export async function listRecurringPlans(db: SqlExecutor): Promise<RecurringPlan[]> {
  const raw = await getAppSetting(db, RECURRING_PLANS_SETTING_KEY);
  return parseRecurringPlans(raw);
}

export async function saveRecurringPlans(
  db: SqlExecutor,
  plans: readonly RecurringPlan[]
): Promise<void> {
  await setAppSetting(db, RECURRING_PLANS_SETTING_KEY, JSON.stringify(plans));
}

export async function upsertRecurringPlan(
  db: SqlExecutor,
  input: Omit<RecurringPlan, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<RecurringPlan> {
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error('请输入计划名称');
  }
  const existing = await listRecurringPlans(db);
  const now = new Date().toISOString();

  if (input.id) {
    const idx = existing.findIndex((p) => p.id === input.id);
    if (idx >= 0) {
      const updated: RecurringPlan = {
        ...existing[idx]!,
        ...input,
        name: trimmedName,
        updatedAt: now,
      };
      const next = [...existing];
      next[idx] = updated;
      await saveRecurringPlans(db, next);
      return updated;
    }
  }

  const created: RecurringPlan = {
    ...input,
    id: input.id ?? createId('rec'),
    name: trimmedName,
    createdAt: now,
    updatedAt: now,
  };
  await saveRecurringPlans(db, [created, ...existing]);
  return created;
}

export async function deleteRecurringPlan(db: SqlExecutor, id: string): Promise<void> {
  const existing = await listRecurringPlans(db);
  await saveRecurringPlans(
    db,
    existing.filter((p) => p.id !== id)
  );
}

/**
 * 固定周期支出当期入账（房租 / 宽带 / 订阅等），写入真实支出流水并标记当期幂等键。
 */
export async function postFixedExpensePlan(
  db: SqlExecutor,
  planId: string,
  occurredOn: string = getTodayIsoDate(),
  overrideAmountCents?: number
): Promise<{ plan: RecurringPlan; transaction: Transaction }> {
  const plans = await listRecurringPlans(db);
  const idx = plans.findIndex((p) => p.id === planId);
  if (idx < 0) {
    throw new Error('周期计划不存在');
  }
  const plan = plans[idx]!;
  if (plan.kind !== 'fixed_expense') {
    throw new Error('该计划不属于固定周期支出');
  }
  const amountCents = overrideAmountCents ?? plan.amountCents;
  const tx = await createTransaction(db, {
    type: 'expense',
    amountCents,
    categoryId: plan.categoryId,
    accountId: plan.accountId,
    toAccountId: null,
    occurredOn,
    note: plan.note ? `${plan.name} · ${plan.note}` : plan.name,
  });

  const periodKey = getPeriodKeyForDate(occurredOn, plan.frequency);
  const updated: RecurringPlan = {
    ...plan,
    lastPostedPeriod: periodKey,
    lastPostedDate: occurredOn,
    updatedAt: new Date().toISOString(),
  };
  const next = [...plans];
  next[idx] = updated;
  await saveRecurringPlans(db, next);
  return { plan: updated, transaction: tx };
}

/**
 * 弹性月薪入账：支持提前/延时发放日期及当月扣款/加项动态核算实发金额。
 */
export async function postSalaryPlan(
  db: SqlExecutor,
  planId: string,
  adjustment: SalaryAdjustmentInput
): Promise<{ plan: RecurringPlan; transaction: Transaction }> {
  const plans = await listRecurringPlans(db);
  const idx = plans.findIndex((p) => p.id === planId);
  if (idx < 0) {
    throw new Error('薪资计划不存在');
  }
  const plan = plans[idx]!;
  if (plan.kind !== 'salary') {
    throw new Error('该计划不属于弹性月薪');
  }

  const resolved = resolveSalaryPosting({ plan, adjustment });
  const tx = await createTransaction(db, {
    type: 'income',
    amountCents: resolved.netAmountCents,
    categoryId: plan.categoryId,
    accountId: plan.accountId,
    toAccountId: null,
    occurredOn: resolved.occurredOn,
    note: resolved.note,
  });

  const periodKey = getPeriodKeyForDate(resolved.occurredOn, 'monthly');
  const updated: RecurringPlan = {
    ...plan,
    lastPostedPeriod: periodKey,
    lastPostedDate: resolved.occurredOn,
    updatedAt: new Date().toISOString(),
  };
  const next = [...plans];
  next[idx] = updated;
  await saveRecurringPlans(db, next);
  return { plan: updated, transaction: tx };
}

/**
 * 房贷按期记账：自动按等额本息/等额本金拆解当期本息写入支出流水，并扣减剩余本金与剩余期数 1 期。
 */
export async function postMortgageInstallment(
  db: SqlExecutor,
  planId: string,
  occurredOn: string = getTodayIsoDate()
): Promise<{ plan: RecurringPlan; transaction: Transaction }> {
  const plans = await listRecurringPlans(db);
  const idx = plans.findIndex((p) => p.id === planId);
  if (idx < 0) {
    throw new Error('房贷计划不存在');
  }
  const plan = plans[idx]!;
  if (plan.kind !== 'mortgage' || !plan.mortgage) {
    throw new Error('该计划不属于房贷还款');
  }
  if (plan.mortgage.remainingPrincipalCents <= 0 || plan.mortgage.remainingMonths <= 0) {
    throw new Error('该房贷已全部结清');
  }

  const preview = computeNextMortgageInstallment({
    method: plan.mortgage.method,
    remainingPrincipalCents: plan.mortgage.remainingPrincipalCents,
    annualRateBps: plan.mortgage.annualRateBps,
    remainingMonths: plan.mortgage.remainingMonths,
  });

  const tx = await createTransaction(db, {
    type: 'expense',
    amountCents: preview.paymentCents,
    categoryId: plan.categoryId,
    accountId: plan.accountId,
    toAccountId: null,
    occurredOn,
    note: `${plan.name}月供（本金 ${formatCentsToYuan(preview.principalCents)} + 利息 ${formatCentsToYuan(preview.interestCents)}）`,
  });

  const nextRemainingMonths = Math.max(0, plan.mortgage.remainingMonths - 1);
  const updated: RecurringPlan = {
    ...plan,
    amountCents: preview.paymentCents,
    lastPostedPeriod: getPeriodKeyForDate(occurredOn, 'monthly'),
    lastPostedDate: occurredOn,
    mortgage: {
      ...plan.mortgage,
      remainingPrincipalCents: preview.remainingPrincipalAfterCents,
      remainingMonths: preview.remainingPrincipalAfterCents === 0 ? 0 : nextRemainingMonths,
      lastPaymentDate: occurredOn,
    },
    updatedAt: new Date().toISOString(),
  };

  const next = [...plans];
  next[idx] = updated;
  await saveRecurringPlans(db, next);
  return { plan: updated, transaction: tx };
}

/**
 * 执行房贷提前还款：
 * 1. 按试算结果写入一笔真实支出（提前还本 + 当期按日结清利息）；
 * 2. 自动更新房贷剩余本金、剩余期数与上次计息日，立即生效次月新月供。
 */
export async function executeMortgagePrepayment(
  db: SqlExecutor,
  planId: string,
  params: {
    prepayPrincipalCents: number;
    interestDays: number;
    mode: MortgagePrepaymentMode;
    occurredOn: string;
    accountId?: string;
  }
): Promise<{
  plan: RecurringPlan;
  transaction: Transaction;
  simulation: ReturnType<typeof simulateMortgagePrepayment>;
}> {
  const plans = await listRecurringPlans(db);
  const idx = plans.findIndex((p) => p.id === planId);
  if (idx < 0) {
    throw new Error('房贷计划不存在');
  }
  const plan = plans[idx]!;
  if (plan.kind !== 'mortgage' || !plan.mortgage) {
    throw new Error('该计划不属于房贷还款');
  }
  if (params.prepayPrincipalCents <= 0) {
    throw new Error('提前还本金额须大于 0');
  }

  const sim = simulateMortgagePrepayment({
    mortgage: plan.mortgage,
    prepayPrincipalCents: params.prepayPrincipalCents,
    interestDays: params.interestDays,
    mode: params.mode,
  });

  const modeLabel = params.mode === 'shorten_term' ? '缩短期限' : '减少月供';
  const tx = await createTransaction(db, {
    type: 'expense',
    amountCents: sim.totalCashOutCents,
    categoryId: plan.categoryId,
    accountId: params.accountId ?? plan.accountId,
    toAccountId: null,
    occurredOn: params.occurredOn,
    note: `${plan.name}提前还款-${modeLabel}（还本 ${formatCentsToYuan(sim.prepayPrincipalCents)} + 结息 ${formatCentsToYuan(sim.accruedInterestCents)}）`,
  });

  const updated: RecurringPlan = {
    ...plan,
    amountCents: sim.newFirstMonthPaymentCents,
    lastPostedDate: params.occurredOn,
    mortgage: {
      ...plan.mortgage,
      remainingPrincipalCents: sim.newRemainingPrincipalCents,
      remainingMonths: sim.newRemainingMonths,
      lastPaymentDate: params.occurredOn,
    },
    updatedAt: new Date().toISOString(),
  };

  const next = [...plans];
  next[idx] = updated;
  await saveRecurringPlans(db, next);
  return { plan: updated, transaction: tx, simulation: sim };
}

/**
 * 启动时静默运行到期自动记账：仅对启用且开启 autoPost 的计划幂等执行，单个计划失败不影响其他计划。
 */
export async function processAutoDueRecurringPlans(
  db: SqlExecutor,
  todayIso: string = getTodayIsoDate()
): Promise<{ postedCount: number }> {
  const plans = await listRecurringPlans(db);
  let postedCount = 0;

  for (const plan of plans) {
    if (!plan.autoPost || !isPlanDueForDate(plan, todayIso)) {
      continue;
    }
    try {
      if (plan.kind === 'fixed_expense') {
        await postFixedExpensePlan(db, plan.id, todayIso);
        postedCount += 1;
      } else if (plan.kind === 'salary') {
        await postSalaryPlan(db, plan.id, {
          occurredOn: todayIso,
          deductionCents: 0,
          bonusCents: 0,
        });
        postedCount += 1;
      } else if (plan.kind === 'mortgage') {
        await postMortgageInstallment(db, plan.id, todayIso);
        postedCount += 1;
      }
    } catch {
      // 如关联账户已归档或被删除，静默跳过以免阻塞启动
    }
  }

  return { postedCount };
}
