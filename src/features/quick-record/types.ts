/**
 * 快捷记账一键模板领域类型
 */

export type QuickRecordType = 'expense' | 'income';

export interface QuickTemplate {
  id: string;
  name: string;
  type: QuickRecordType;
  /** 固定金额（正整数，单位：分） */
  amountCents: number;
  categoryId: string;
  accountId: string;
  note: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** 附带分类图标/颜色与账户名称的快捷按钮展示项（支持自定义模板与历史高频推荐统一渲染） */
export interface QuickRecordButtonItem {
  id: string;
  source: 'template' | 'recommended';
  name: string;
  type: QuickRecordType;
  amountCents: number;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  accountId: string;
  accountName: string;
  note: string;
}

export interface CreateQuickTemplateInput {
  name: string;
  type: QuickRecordType;
  amountCents: number;
  categoryId: string;
  accountId: string;
  note?: string;
}

export type UpdateQuickTemplateInput = CreateQuickTemplateInput;
