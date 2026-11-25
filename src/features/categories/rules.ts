import type { CreateCategoryInput, UpdateCategoryInput } from './types';

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
  };
}

export function normalizeUpdateCategoryInput(input: UpdateCategoryInput): UpdateCategoryInput {
  return {
    ...input,
    name: validateCategoryName(input.name),
  };
}
