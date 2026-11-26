/**
 * 分类管理独立 JSON 导入导出（专为手动编辑后增量合并或覆盖导入设计）：
 * - 导出为清晰可读的两级树形 JSON（含校验指纹），支持手动增改名称、图标、颜色、顺序与停用态；
 * - 导入前执行严格结构、层级深度、重名、颜色、图标格式与至少保留一个可用一级分类的校验；
 * - 支持两种导入模式：
 *   1. merge（增量）：按 ID 或同级名称匹配，命中则更新属性与排序，未命中则新增，现有未提及分类保持不变；
 *   2. replace（覆盖）：按文件完整重建分类树与排序；若现有数据库中有含历史账目的旧分类不在文件中，
 *      自动转为停用并沉底保留以保护历史账目外键完整性。
 */
import type { SqlExecutor } from '../../db/types';
import { createId } from '../../shared/id/id';
import { CHECKSUM_ALGORITHM, computeJsonChecksum } from '../../shared/integrity/checksum';
import { findCategories } from './repository';
import { MAX_CATEGORY_NAME_LENGTH, buildCategoryTree } from './rules';
import type { Category, CategoryType } from './types';

export const CATEGORY_EXPORT_SCHEMA_VERSION = 1;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ICON_NAME_RE = /^(?:mci:)?[a-z0-9][a-z0-9-]{0,63}$/;

export interface ExportedCategoryChildItem {
  id?: string;
  name: string;
  icon: string;
  isArchived?: boolean;
}

export interface ExportedCategoryRootItem {
  id?: string;
  name: string;
  icon: string;
  color: string;
  isArchived?: boolean;
  children?: ExportedCategoryChildItem[];
}

export interface CategoriesExportPayload {
  app: 'ZeroTally';
  kind: 'categories';
  schemaVersion: number;
  exportedAt: string;
  integrity: {
    algorithm: typeof CHECKSUM_ALGORITHM;
    checksum: string;
  };
  expense: ExportedCategoryRootItem[];
  income: ExportedCategoryRootItem[];
}

export interface NormalizedImportCategoryChild {
  id?: string;
  name: string;
  icon: string;
  isArchived: boolean;
}

export interface NormalizedImportCategoryRoot {
  id?: string;
  name: string;
  icon: string;
  color: string;
  isArchived: boolean;
  children: NormalizedImportCategoryChild[];
}

export interface ValidatedCategoriesImport {
  expense: NormalizedImportCategoryRoot[];
  income: NormalizedImportCategoryRoot[];
  rootCount: number;
  childCount: number;
  checksumMatched: boolean;
  warnings: string[];
}

export type CategoryImportMode = 'merge' | 'replace';

export interface CategoryImportResult {
  mode: CategoryImportMode;
  createdCount: number;
  updatedCount: number;
  deletedCount: number;
  preservedArchivedCount: number;
}

export function buildCategoriesExportFilename(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `ZeroTally-categories-${y}-${m}-${d}.json`;
}

export function buildCategoriesExportPayload(
  categories: readonly Category[],
  exportedAt: string = new Date().toISOString()
): CategoriesExportPayload {
  const buildSide = (type: CategoryType): ExportedCategoryRootItem[] => {
    const filtered = categories.filter((c) => c.type === type);
    const tree = buildCategoryTree(filtered);
    // 启用的一级在前、停用的一级沉底；子分类同样启用在前、停用沉底
    const sortedTree = [...tree].sort((a, b) => {
      if (a.category.isArchived !== b.category.isArchived) {
        return a.category.isArchived ? 1 : -1;
      }
      return a.category.sortOrder - b.category.sortOrder;
    });

    return sortedTree.map((node) => {
      const sortedChildren = [...node.children].sort((a, b) => {
        if (a.isArchived !== b.isArchived) {
          return a.isArchived ? 1 : -1;
        }
        return a.sortOrder - b.sortOrder;
      });
      return {
        id: node.category.id,
        name: node.category.name,
        icon: node.category.icon,
        color: node.category.color,
        isArchived: node.category.isArchived,
        children: sortedChildren.map((child) => ({
          id: child.id,
          name: child.name,
          icon: child.icon,
          isArchived: child.isArchived,
        })),
      };
    });
  };

  const expense = buildSide('expense');
  const income = buildSide('income');
  const checksum = computeJsonChecksum({ expense, income });

  return {
    app: 'ZeroTally',
    kind: 'categories',
    schemaVersion: CATEGORY_EXPORT_SCHEMA_VERSION,
    exportedAt,
    integrity: {
      algorithm: CHECKSUM_ALGORITHM,
      checksum,
    },
    expense,
    income,
  };
}

export async function generateCategoriesExport(
  db: SqlExecutor,
  now: Date = new Date()
): Promise<{
  filename: string;
  mimeType: string;
  content: string;
  categoryCount: number;
}> {
  const categories = await findCategories(db, { includeArchived: true });
  const payload = buildCategoriesExportPayload(categories, now.toISOString());
  return {
    filename: buildCategoriesExportFilename(now),
    mimeType: 'application/json',
    content: `${JSON.stringify(payload, null, 2)}\n`,
    categoryCount: categories.length,
  };
}

function parseRootList(
  rawList: unknown,
  typeLabel: string,
  defaultColor: string,
  seenIds: Set<string>
): NormalizedImportCategoryRoot[] {
  if (!Array.isArray(rawList)) {
    throw new Error(`「${typeLabel}」字段必须为分类数组`);
  }
  const activeRootNames = new Set<string>();
  const result: NormalizedImportCategoryRoot[] = [];

  for (let i = 0; i < rawList.length; i += 1) {
    const raw = rawList[i];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`${typeLabel}第 ${i + 1} 项分类格式无效`);
    }
    const obj = raw as Record<string, unknown>;
    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    if (!name || name.length > MAX_CATEGORY_NAME_LENGTH) {
      throw new Error(`${typeLabel}第 ${i + 1} 项名称须为 1~${MAX_CATEGORY_NAME_LENGTH} 个字符`);
    }

    const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : undefined;
    if (id) {
      if (seenIds.has(id)) {
        throw new Error(`存在重复的分类 ID：${id}`);
      }
      seenIds.add(id);
    }

    const icon =
      typeof obj.icon === 'string' && obj.icon.trim() ? obj.icon.trim() : 'pricetag-outline';
    if (!ICON_NAME_RE.test(icon)) {
      throw new Error(`分类「${name}」的图标格式无效：${icon}`);
    }

    const color =
      typeof obj.color === 'string' && obj.color.trim() ? obj.color.trim() : defaultColor;
    if (!HEX_COLOR_RE.test(color)) {
      throw new Error(`分类「${name}」的颜色格式须为 #RRGGBB：${color}`);
    }

    const isArchived = obj.isArchived === true;
    if (!isArchived) {
      if (activeRootNames.has(name)) {
        throw new Error(`${typeLabel}中存在重名的启用一级分类「${name}」`);
      }
      activeRootNames.add(name);
    }

    const rawChildren = obj.children ?? [];
    if (!Array.isArray(rawChildren)) {
      throw new Error(`分类「${name}」的 children 必须为数组`);
    }

    const activeChildNames = new Set<string>();
    const children: NormalizedImportCategoryChild[] = [];
    for (let j = 0; j < rawChildren.length; j += 1) {
      const rawChild = rawChildren[j];
      if (!rawChild || typeof rawChild !== 'object' || Array.isArray(rawChild)) {
        throw new Error(`分类「${name}」的第 ${j + 1} 个子分类格式无效`);
      }
      const cObj = rawChild as Record<string, unknown>;
      if ('children' in cObj && Array.isArray(cObj.children) && cObj.children.length > 0) {
        throw new Error(`分类「${name}」下不允许超过两级子分类`);
      }
      const childName = typeof cObj.name === 'string' ? cObj.name.trim() : '';
      if (!childName || childName.length > MAX_CATEGORY_NAME_LENGTH) {
        throw new Error(
          `分类「${name}」第 ${j + 1} 个子分类名称须为 1~${MAX_CATEGORY_NAME_LENGTH} 个字符`
        );
      }

      const childId = typeof cObj.id === 'string' && cObj.id.trim() ? cObj.id.trim() : undefined;
      if (childId) {
        if (seenIds.has(childId)) {
          throw new Error(`存在重复的分类 ID：${childId}`);
        }
        seenIds.add(childId);
      }

      const childIcon =
        typeof cObj.icon === 'string' && cObj.icon.trim() ? cObj.icon.trim() : icon;
      if (!ICON_NAME_RE.test(childIcon)) {
        throw new Error(`子分类「${childName}」的图标格式无效：${childIcon}`);
      }

      const childArchived = isArchived || cObj.isArchived === true;
      if (!childArchived) {
        if (activeChildNames.has(childName)) {
          throw new Error(`分类「${name}」下存在重名的启用子分类「${childName}」`);
        }
        activeChildNames.add(childName);
      }

      children.push({
        id: childId,
        name: childName,
        icon: childIcon,
        isArchived: childArchived,
      });
    }

    result.push({
      id,
      name,
      icon,
      color,
      isArchived,
      children,
    });
  }

  return result;
}

/**
 * 校验并解析分类 JSON 文本（支持用户手动编辑后的分类配置导入）
 */
export function validateCategoriesImportJson(rawText: string): ValidatedCategoriesImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('JSON 解析失败，请检查文件格式与标点符号');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('分类配置文件根节点必须为 JSON 对象');
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.app !== undefined && obj.app !== 'ZeroTally') {
    throw new Error('不支持的应用标识，仅支持 ZeroTally 分类配置');
  }
  if (obj.kind === 'full-backup' || ('accounts' in obj && 'transactions' in obj)) {
    throw new Error('检测到全量账本备份文件，请前往「高级设置 → 导入数据」恢复');
  }
  if (obj.kind !== undefined && obj.kind !== 'categories') {
    throw new Error(`不支持的配置文件类型：${String(obj.kind)}`);
  }

  const seenIds = new Set<string>();
  const expense = parseRootList(obj.expense ?? [], '支出分类', '#D97706', seenIds);
  const income = parseRootList(obj.income ?? [], '收入分类', '#059669', seenIds);

  if (expense.length === 0 && income.length === 0) {
    throw new Error('文件中未包含任何支出或收入分类');
  }

  const warnings: string[] = [];
  let checksumMatched = true;
  const integrity = obj.integrity;
  if (integrity && typeof integrity === 'object' && !Array.isArray(integrity)) {
    const expected = (integrity as Record<string, unknown>).checksum;
    if (typeof expected === 'string' && expected.length > 0) {
      const actual = computeJsonChecksum({ expense: obj.expense ?? [], income: obj.income ?? [] });
      if (actual !== expected) {
        checksumMatched = false;
        warnings.push('文件内容已手动调整（校验指纹变更），结构校验已通过');
      }
    }
  } else {
    checksumMatched = false;
  }

  const rootCount = expense.length + income.length;
  const childCount =
    expense.reduce((acc, r) => acc + r.children.length, 0) +
    income.reduce((acc, r) => acc + r.children.length, 0);

  return {
    expense,
    income,
    rootCount,
    childCount,
    checksumMatched,
    warnings,
  };
}

/**
 * 将已校验的分类 JSON 导入本地数据库：
 * - merge（增量）：匹配同 ID 或同级名称更新，未匹配新增，原有其余分类保留；
 * - replace（覆盖）：完整按文件重建排序与内容，含历史账目或快捷模板引用的旧分类自动转为停用沉底保护。
 */
export async function importCategoriesFromValidated(
  db: SqlExecutor,
  validated: ValidatedCategoriesImport,
  mode: CategoryImportMode
): Promise<CategoryImportResult> {
  if (mode === 'replace') {
    if (!validated.expense.some((r) => !r.isArchived)) {
      throw new Error('覆盖导入至少需要包含 1 个启用的支出一级分类');
    }
    if (!validated.income.some((r) => !r.isArchived)) {
      throw new Error('覆盖导入至少需要包含 1 个启用的收入一级分类');
    }
  }

  const now = new Date().toISOString();

  return db.withTransaction(async (tx) => {
    const existingList = await findCategories(tx, { includeArchived: true });
    const existingById = new Map(existingList.map((c) => [c.id, c]));
    const referencedRows = await tx.getAll<{ category_id: string }>(
      `SELECT DISTINCT category_id FROM transactions WHERE category_id IS NOT NULL
       UNION
       SELECT DISTINCT category_id FROM quick_templates`
    );
    const referencedIds = new Set(referencedRows.map((r) => r.category_id));

    let createdCount = 0;
    let updatedCount = 0;
    let deletedCount = 0;
    let preservedArchivedCount = 0;

    const touchedIds = new Set<string>();

    const processSide = async (
      type: CategoryType,
      roots: readonly NormalizedImportCategoryRoot[]
    ) => {
      const existingRoots = existingList.filter((c) => c.type === type && c.parentId === null);

      for (let rIdx = 0; rIdx < roots.length; rIdx += 1) {
        const rootSpec = roots[rIdx]!;
        const rootSort = (rIdx + 1) * 10;

        let matchedRoot: Category | undefined;
        if (rootSpec.id) {
          const byId = existingById.get(rootSpec.id);
          if (byId && byId.type === type && byId.parentId === null) {
            matchedRoot = byId;
          }
        }
        if (!matchedRoot) {
          matchedRoot = existingRoots.find(
            (c) => !touchedIds.has(c.id) && c.name === rootSpec.name
          );
        }

        let resolvedRootId: string;
        if (matchedRoot) {
          resolvedRootId = matchedRoot.id;
          touchedIds.add(resolvedRootId);
          await tx.run(
            `UPDATE categories
             SET name = ?, icon = ?, color = ?, is_archived = ?, sort_order = ?
             WHERE id = ?`,
            [
              rootSpec.name,
              rootSpec.icon,
              rootSpec.color,
              rootSpec.isArchived ? 1 : 0,
              rootSort,
              resolvedRootId,
            ]
          );
          updatedCount += 1;
        } else {
          resolvedRootId =
            rootSpec.id && !existingById.has(rootSpec.id) && !touchedIds.has(rootSpec.id)
              ? rootSpec.id
              : createId('cat');
          touchedIds.add(resolvedRootId);
          await tx.run(
            `INSERT INTO categories (id, name, type, icon, color, parent_id, is_system, is_archived, sort_order, created_at)
             VALUES (?, ?, ?, ?, ?, NULL, 0, ?, ?, ?)`,
            [
              resolvedRootId,
              rootSpec.name,
              type,
              rootSpec.icon,
              rootSpec.color,
              rootSpec.isArchived ? 1 : 0,
              rootSort,
              now,
            ]
          );
          createdCount += 1;
        }

        const existingChildren = existingList.filter(
          (c) => c.type === type && c.parentId === resolvedRootId
        );

        for (let cIdx = 0; cIdx < rootSpec.children.length; cIdx += 1) {
          const childSpec = rootSpec.children[cIdx]!;
          const childSort = (cIdx + 1) * 10;
          const childArchived = rootSpec.isArchived || childSpec.isArchived;

          let matchedChild: Category | undefined;
          if (childSpec.id) {
            const byId = existingById.get(childSpec.id);
            if (byId && byId.type === type && byId.parentId === resolvedRootId) {
              matchedChild = byId;
            }
          }
          if (!matchedChild) {
            matchedChild = existingChildren.find(
              (c) => !touchedIds.has(c.id) && c.name === childSpec.name
            );
          }

          if (matchedChild) {
            touchedIds.add(matchedChild.id);
            await tx.run(
              `UPDATE categories
               SET name = ?, icon = ?, color = ?, parent_id = ?, is_archived = ?, sort_order = ?
               WHERE id = ?`,
              [
                childSpec.name,
                childSpec.icon,
                rootSpec.color,
                resolvedRootId,
                childArchived ? 1 : 0,
                childSort,
                matchedChild.id,
              ]
            );
            updatedCount += 1;
          } else {
            const newChildId =
              childSpec.id && !existingById.has(childSpec.id) && !touchedIds.has(childSpec.id)
                ? childSpec.id
                : createId('cat');
            touchedIds.add(newChildId);
            await tx.run(
              `INSERT INTO categories (id, name, type, icon, color, parent_id, is_system, is_archived, sort_order, created_at)
               VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
              [
                newChildId,
                childSpec.name,
                type,
                childSpec.icon,
                rootSpec.color,
                resolvedRootId,
                childArchived ? 1 : 0,
                childSort,
                now,
              ]
            );
            createdCount += 1;
          }
        }
      }
    };

    await processSide('expense', validated.expense);
    await processSide('income', validated.income);

    if (mode === 'replace') {
      // 先处理未命中的二级分类，再处理未命中的一级分类
      const untouchedChildren = existingList.filter(
        (c) => c.parentId !== null && !touchedIds.has(c.id)
      );
      const preservedParentIds = new Set<string>();

      for (const child of untouchedChildren) {
        if (referencedIds.has(child.id)) {
          await tx.run('UPDATE categories SET is_archived = 1, sort_order = 9990 WHERE id = ?', [
            child.id,
          ]);
          preservedArchivedCount += 1;
          if (child.parentId) {
            preservedParentIds.add(child.parentId);
          }
        } else {
          await tx.run('DELETE FROM categories WHERE id = ?', [child.id]);
          deletedCount += 1;
        }
      }

      const untouchedRoots = existingList.filter(
        (c) => c.parentId === null && !touchedIds.has(c.id)
      );
      for (const root of untouchedRoots) {
        if (referencedIds.has(root.id) || preservedParentIds.has(root.id)) {
          await tx.run('UPDATE categories SET is_archived = 1, sort_order = 9990 WHERE id = ?', [
            root.id,
          ]);
          preservedArchivedCount += 1;
        } else {
          await tx.run('DELETE FROM categories WHERE id = ?', [root.id]);
          deletedCount += 1;
        }
      }
    }

    return {
      mode,
      createdCount,
      updatedCount,
      deletedCount,
      preservedArchivedCount,
    };
  });
}
