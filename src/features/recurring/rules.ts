import { isValidIsoDate } from '../../shared/date/date';
import { formatCentsToYuan } from '../../shared/money/money';
import type {
  CreditCardCycleDetails,
  RecurringFrequency,
  RecurringPlan,
  SalaryAdjustmentInput,
} from './types';

export const RECURRING_PLANS_SETTING_KEY = 'recurring_plans_v1';

/** 安全反序列化周期计划列表 */
export function parseRecurringPlans(raw: string | null): RecurringPlan[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is RecurringPlan =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as RecurringPlan).id === 'string' &&
        typeof (item as RecurringPlan).name === 'string' &&
        typeof (item as RecurringPlan).kind === 'string'
    );
  } catch {
    return [];
  }
}

/** 计算给定日期所在周期的唯一幂等键（用于防重入账） */
export function getPeriodKeyForDate(
  isoDate: string,
  frequency: RecurringFrequency
): string {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  if (frequency === 'yearly') {
    return `${year}`;
  }
  if (frequency === 'quarterly') {
    const quarter = Math.floor((month - 1) / 3) + 1;
    return `${year}-Q${quarter}`;
  }
  if (frequency === 'weekly') {
    const d = new Date(`${isoDate}T00:00:00Z`);
    const startOfYear = new Date(Date.UTC(year, 0, 1));
    const dayOfYear = Math.floor((d.getTime() - startOfYear.getTime()) / 86_400_000);
    const week = Math.floor(dayOfYear / 7) + 1;
    return `${year}-W${String(week).padStart(2, '0')}`;
  }
  return isoDate.slice(0, 7);
}

/** 判定周期计划在今天是否已到达应执行节点且当前周期尚未入账 */
export function isPlanDueForDate(plan: RecurringPlan, todayIso: string): boolean {
  if (!plan.enabled || !isValidIsoDate(todayIso)) {
    return false;
  }
  if (plan.kind === 'credit_card') {
    return false;
  }
  if (plan.kind === 'mortgage' && (plan.mortgage?.remainingPrincipalCents ?? 0) <= 0) {
    return false;
  }

  const currentPeriod = getPeriodKeyForDate(todayIso, plan.frequency);
  if (plan.lastPostedPeriod === currentPeriod) {
    return false;
  }

  const dayOfMonth = Number(todayIso.slice(8, 10));
  if (plan.frequency === 'weekly') {
    const d = new Date(`${todayIso}T00:00:00Z`);
    const weekday = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // 1..7 (周一..周日)
    return weekday >= Math.max(1, Math.min(7, plan.dayOfCycle));
  }

  return dayOfMonth >= Math.max(1, Math.min(28, plan.dayOfCycle));
}

/** 计算弹性月薪实发金额与带明细标注的备注文本（支持提前/延时日期及当月扣款/补贴） */
export function resolveSalaryPosting(params: {
  plan: Pick<RecurringPlan, 'name' | 'amountCents' | 'dayOfCycle' | 'note'>;
  adjustment: SalaryAdjustmentInput;
}): {
  netAmountCents: number;
  occurredOn: string;
  note: string;
  timingTag: 'on_time' | 'early' | 'delayed';
} {
  const { plan, adjustment } = params;
  const deduction = Math.max(0, Math.trunc(adjustment.deductionCents));
  const bonus = Math.max(0, Math.trunc(adjustment.bonusCents));
  const netAmountCents = Math.max(0, plan.amountCents + bonus - deduction);
  if (netAmountCents <= 0) {
    throw new Error('扣款后实发金额须大于 0');
  }
  if (!isValidIsoDate(adjustment.occurredOn)) {
    throw new Error('到账日期格式无效');
  }

  const actualDay = Number(adjustment.occurredOn.slice(8, 10));
  const expectedDay = Math.max(1, Math.min(28, plan.dayOfCycle));
  const timingTag: 'on_time' | 'early' | 'delayed' =
    actualDay < expectedDay ? 'early' : actualDay > expectedDay ? 'delayed' : 'on_time';

  const parts: string[] = [plan.name];
  if (timingTag === 'early') {
    parts.push('提前发放');
  } else if (timingTag === 'delayed') {
    parts.push('延时发放');
  }
  if (bonus > 0) {
    parts.push(`加项 +${formatCentsToYuan(bonus)}`);
  }
  if (deduction > 0) {
    parts.push(`扣款 -${formatCentsToYuan(deduction)}`);
  }
  const extra = (adjustment.extraNote ?? plan.note ?? '').trim();
  if (extra) {
    parts.push(extra);
  }

  return {
    netAmountCents,
    occurredOn: adjustment.occurredOn,
    note: parts.join(' · ').slice(0, 120),
    timingTag,
  };
}

/** 计算信用卡距离下一个账单日与还款日的剩余天数 */
export function computeCreditCardCycleStatus(
  cycle: CreditCardCycleDetails,
  todayIso: string
): {
  daysUntilStatement: number;
  daysUntilDue: number;
  dueSoon: boolean;
} {
  const year = Number(todayIso.slice(0, 4));
  const month = Number(todayIso.slice(5, 7));
  const todayUtc = Date.UTC(year, month - 1, Number(todayIso.slice(8, 10)));

  const daysUntil = (targetDay: number): number => {
    const safeDay = Math.max(1, Math.min(28, Math.trunc(targetDay)));
    let candidate = Date.UTC(year, month - 1, safeDay);
    if (candidate < todayUtc) {
      candidate = Date.UTC(year, month, safeDay);
    }
    return Math.round((candidate - todayUtc) / 86_400_000);
  };

  const daysUntilStatement = daysUntil(cycle.statementDay);
  const daysUntilDue = daysUntil(cycle.dueDay);
  return {
    daysUntilStatement,
    daysUntilDue,
    dueSoon: daysUntilDue <= 5,
  };
}

/** 计算两个 ISO 日期之间相隔的非负天数（用于提前还款计息天数默认估算） */
export function diffIsoDays(fromIso: string, toIso: string): number {
  if (!isValidIsoDate(fromIso) || !isValidIsoDate(toIso)) {
    return 0;
  }
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
