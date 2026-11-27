import { MAX_AMOUNT_CENTS } from '../../shared/money/money';
import type { BudgetConfig, BudgetProgress, BudgetStatus } from './types';

export const BUDGET_CONFIG_SETTING_KEY = 'budget_config_v1';

export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  enabled: false,
  monthlyTotalCents: 0,
  categoryBudgetsCents: {},
  warningPercent: 80,
};

function normalizeBudgetCents(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  const rounded = Math.trunc(value);
  if (rounded <= 0 || rounded > MAX_AMOUNT_CENTS) {
    return 0;
  }
  return rounded;
}

/** 安全解析持久化在 app_settings 中的预算配置，损坏时回退默认关闭态 */
export function parseBudgetConfig(raw: string | null): BudgetConfig {
  if (!raw) {
    return { ...DEFAULT_BUDGET_CONFIG, categoryBudgetsCents: {} };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const rawMap =
      parsed.categoryBudgetsCents && typeof parsed.categoryBudgetsCents === 'object'
        ? (parsed.categoryBudgetsCents as Record<string, unknown>)
        : {};
    const categoryBudgetsCents: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawMap)) {
      const normalized = normalizeBudgetCents(v);
      if (k.trim() && normalized > 0) {
        categoryBudgetsCents[k] = normalized;
      }
    }

    const rawWarn = typeof parsed.warningPercent === 'number' ? Math.trunc(parsed.warningPercent) : 80;
    const warningPercent = rawWarn >= 50 && rawWarn <= 95 ? rawWarn : 80;

    return {
      enabled: Boolean(parsed.enabled),
      monthlyTotalCents: normalizeBudgetCents(parsed.monthlyTotalCents),
      categoryBudgetsCents,
      warningPercent,
    };
  } catch {
    return { ...DEFAULT_BUDGET_CONFIG, categoryBudgetsCents: {} };
  }
}

/**
 * 计算单项预算执行进度（支持退款抵扣后净支出 <= 0 的边界情况）。
 */
export function computeBudgetProgress(params: {
  budgetCents: number;
  spentCents: number;
  warningPercent?: number;
}): BudgetProgress | null {
  if (params.budgetCents <= 0) {
    return null;
  }
  const effectiveSpent = Math.max(0, params.spentCents);
  const remainingCents = params.budgetCents - effectiveSpent;
  const usedPercent = Math.round((effectiveSpent / params.budgetCents) * 100);
  const warn = params.warningPercent ?? 80;

  let status: BudgetStatus = 'safe';
  if (effectiveSpent > params.budgetCents) {
    status = 'exceeded';
  } else if (usedPercent >= warn) {
    status = 'warning';
  }

  return {
    budgetCents: params.budgetCents,
    spentCents: effectiveSpent,
    remainingCents,
    usedPercent,
    status,
  };
}
