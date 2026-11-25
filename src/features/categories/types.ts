/**
 * 收支分类领域类型定义
 */

export type CategoryType = 'expense' | 'income';

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  isSystem: boolean;
  isArchived: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface CreateCategoryInput {
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
}

export interface UpdateCategoryInput {
  name: string;
  icon: string;
  color: string;
}
