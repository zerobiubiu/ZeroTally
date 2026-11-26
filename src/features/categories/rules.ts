import type {
  Category,
  CategoryTreeNode,
  CreateCategoryInput,
  UpdateCategoryInput,
} from './types';

export const MAX_CATEGORY_NAME_LENGTH = 16;

export function validateCategoryName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('请输入分类名称');
  }
  if (trimmed.length > MAX_CATEGORY_NAME_LENGTH) {
    throw new Error(`分类名称不能超过 ${MAX_CATEGORY_NAME_LENGTH} 个字符`);
  }
  return trimmed;
}

export function normalizeCreateCategoryInput(input: CreateCategoryInput): CreateCategoryInput {
  return {
    ...input,
    name: validateCategoryName(input.name),
    parentId: input.parentId ?? null,
  };
}

export function normalizeUpdateCategoryInput(input: UpdateCategoryInput): UpdateCategoryInput {
  return {
    ...input,
    name: validateCategoryName(input.name),
  };
}

/**
 * 层级规则（权威定义）：分类最多两级，二级分类的上级必须是同类型、启用中的一级分类。
 */
export function assertValidParentCategory(parent: Category | null, childType: Category['type']): void {
  if (!parent) {
    throw new Error('上级分类不存在');
  }
  if (parent.parentId !== null) {
    throw new Error('分类最多两级，不能在二级分类下继续添加');
  }
  if (parent.type !== childType) {
    throw new Error('上级分类类型与当前分类类型不一致');
  }
  if (parent.isArchived) {
    throw new Error(`上级分类「${parent.name}」已停用`);
  }
}

/**
 * 将平铺分类列表组装为「一级 + 二级」分组，保持输入顺序（即 sort_order）。
 * 上级不在列表中的二级分类（如上级被过滤）提升为独立分组，避免选中项丢失。
 */
export function buildCategoryTree(categories: readonly Category[]): CategoryTreeNode[] {
  const nodes = new Map<string, CategoryTreeNode>();
  const roots: CategoryTreeNode[] = [];

  for (const cat of categories) {
    if (cat.parentId === null) {
      const node: CategoryTreeNode = { category: cat, children: [] };
      nodes.set(cat.id, node);
      roots.push(node);
    }
  }

  for (const cat of categories) {
    if (cat.parentId === null) {
      continue;
    }
    const parentNode = nodes.get(cat.parentId);
    if (parentNode) {
      parentNode.children.push(cat);
    } else {
      roots.push({ category: cat, children: [] });
    }
  }

  return roots;
}
