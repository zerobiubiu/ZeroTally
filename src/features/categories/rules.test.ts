import { describe, expect, it } from 'vitest';
import { buildCategoryTree } from './rules';
import type { Category } from './types';

function makeCategory(overrides: Partial<Category>): Category {
  return {
    id: 'c',
    name: '分类',
    type: 'expense',
    icon: 'pricetag-outline',
    color: '#5C6479',
    parentId: null,
    isSystem: false,
    isArchived: false,
    sortOrder: 10,
    createdAt: '2026-11-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('categories 层级规则', () => {
  it('按输入顺序组装一级与二级，并把上级缺失的二级提升为独立分组', () => {
    const tree = buildCategoryTree([
      makeCategory({ id: 'food', name: '餐饮' }),
      makeCategory({ id: 'lunch', name: '午餐', parentId: 'food' }),
      makeCategory({ id: 'traffic', name: '交通' }),
      makeCategory({ id: 'orphan', name: '孤儿', parentId: 'missing' }),
      makeCategory({ id: 'dinner', name: '晚餐', parentId: 'food' }),
    ]);

    expect(tree.map((n) => n.category.id)).toEqual(['food', 'traffic', 'orphan']);
    expect(tree[0]?.children.map((c) => c.id)).toEqual(['lunch', 'dinner']);
    expect(tree[1]?.children).toHaveLength(0);
  });
});
