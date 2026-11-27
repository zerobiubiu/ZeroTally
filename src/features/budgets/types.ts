/**
 * 可选预算管理领域类型定义（默认关闭，仅作为补充能力在设置中按需启用）
 */

export type BudgetStatus = 'safe' | 'warning' | 'exceeded';

export interface BudgetConfig {
  /** 总开关：关闭时主界面零任何预算视觉元素 */
  enabled: boolean;
  /** 月度总预算（分；0 表示未设总预算） */
  monthlyTotalCents: number;
  /** 一级支出分类月度预算映射（rootCategoryId -> cents） */
  categoryBudgetsCents: Record<string, number>;
  /** 预警百分比阈值（默认 80%） */
  warningPercent: number;
}

export interface BudgetProgress {
  budgetCents: number;
  spentCents: number;
  /** 剩余预算（正数表示剩余，负数表示超支金额） */
  remainingCents: number;
  /** 已用比例（0~100+，保留整数百分比便于进度展示） */
  usedPercent: number;
  status: BudgetStatus;
}

export interface CategoryBudgetItem {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  budgetCents: number;
  spentCents: number;
  progress: BudgetProgress | null;
}
