/**
 * 收支分类领域类型定义
 * 分类最多两级：一级分类 parentId 为 null；二级分类的 parentId 指向同类型的一级分类。
 */

export type CategoryType = 'expense' | 'income';

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  /** 上级分类 ID；一级分类为 null */
  parentId: string | null;
  isSystem: boolean;
  isArchived: boolean;
  sortOrder: number;
  createdAt: string;
}

/** 一级分类及其下属二级分类（用于选择器与管理页的分组展示） */
export interface CategoryTreeNode {
  category: Category;
  children: Category[];
}

export interface CreateCategoryInput {
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  /** 指定上级一级分类即创建二级分类；缺省或 null 创建一级分类 */
  parentId?: string | null;
}

export interface UpdateCategoryInput {
  name: string;
  icon: string;
  color: string;
}
