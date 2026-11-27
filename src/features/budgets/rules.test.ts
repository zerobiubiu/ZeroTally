import { describe, expect, it } from 'vitest';
import {
  computeBudgetProgress,
  DEFAULT_BUDGET_CONFIG,
  parseBudgetConfig,
} from './rules';

describe('budgets 可选预算管理纯规则', () => {
  it('默认关闭不打扰，损坏 JSON 安全回退并过滤非法金额', () => {
    expect(DEFAULT_BUDGET_CONFIG.enabled).toBe(false);
    expect(parseBudgetConfig(null)).toEqual(DEFAULT_BUDGET_CONFIG);
    expect(parseBudgetConfig('bad')).toEqual(DEFAULT_BUDGET_CONFIG);

    const parsed = parseBudgetConfig(
      JSON.stringify({
        enabled: true,
        monthlyTotalCents: 300_000,
        warningPercent: 85,
        categoryBudgetsCents: {
          cat_exp_food: 100_000,
          cat_invalid: -50,
        },
      })
    );
    expect(parsed).toEqual({
      enabled: true,
      monthlyTotalCents: 300_000,
      warningPercent: 85,
      categoryBudgetsCents: { cat_exp_food: 100_000 },
    });
  });

  it('按净支出计算剩余金额、使用百分比与安全/预警/超支状态', () => {
    expect(computeBudgetProgress({ budgetCents: 0, spentCents: 1000 })).toBeNull();

    expect(
      computeBudgetProgress({ budgetCents: 100_000, spentCents: 50_000, warningPercent: 80 })
    ).toEqual({
      budgetCents: 100_000,
      spentCents: 50_000,
      remainingCents: 50_000,
      usedPercent: 50,
      status: 'safe',
    });

    expect(
      computeBudgetProgress({ budgetCents: 100_000, spentCents: 85_000, warningPercent: 80 })
    ).toEqual({
      budgetCents: 100_000,
      spentCents: 85_000,
      remainingCents: 15_000,
      usedPercent: 85,
      status: 'warning',
    });

    expect(
      computeBudgetProgress({ budgetCents: 100_000, spentCents: 120_000, warningPercent: 80 })
    ).toEqual({
      budgetCents: 100_000,
      spentCents: 120_000,
      remainingCents: -20_000,
      usedPercent: 120,
      status: 'exceeded',
    });
  });
});
