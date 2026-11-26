/**
 * 约束简报（Workflow B / C）：
 * - 单列表呈现：取消独立「已停用」分区，停用的一级与二级分类分别沉至所在队列末尾并整体灰显；一级停用后其下二级同步不可用，历史账务不删除
 * - 层级交互分工：一级行默认右侧仅显示「+」（直接添加二级），左滑带出「编辑 / 停用(启用) / 删除」；展开的二级子表无底部添加按钮，每行直接显示「编辑 / 停用(启用) / 删除」
 * - 拖拽排序：长按一级先合拢所有展开的二级再触发一级间拖动排序；长按二级仅在所属子表内排序，不交叉
 * - 独立配置流转：顶栏支持分类树 JSON 单独导出与增量/覆盖导入，新增与编辑均走居中浮窗 + 9 主题分类图标库
 */
import { Stack } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../src/db/database-context';
import { CategoryDeleteDialog } from '../src/features/categories/components/CategoryDeleteDialog';
import { CategoryEditorDialog } from '../src/features/categories/components/CategoryEditorDialog';
import {
  CategoryChildRow,
  CategoryRootRow,
  CHILD_ROW_HEIGHT,
  ROOT_CARD_GAP,
  ROOT_DRAG_STRIDE,
} from '../src/features/categories/components/CategoryManageRows';
import {
  generateCategoriesExport,
  importCategoriesFromValidated,
  validateCategoriesImportJson,
  type CategoryImportMode,
  type ValidatedCategoriesImport,
} from '../src/features/categories/portability';
import { buildCategoryTree } from '../src/features/categories/rules';
import {
  archiveCategory,
  createCategory,
  deleteCategoryWithMigration,
  getCategoryTreeTransactionCount,
  listCategories,
  reorderCategories,
  restoreCategory,
  updateCategory,
} from '../src/features/categories/service';
import type { Category, CategoryTreeNode, CategoryType } from '../src/features/categories/types';
import {
  pickJsonFileText,
  saveExportArtifactToDirectory,
  shareExportArtifact,
} from '../src/features/export/native-io';
import {
  hapticLight,
  hapticSelection,
  hapticSuccess,
  hapticWarning,
} from '../src/shared/haptics/haptics';
import { ActionSheet } from '../src/shared/ui/ActionSheet';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { ConfirmDialog } from '../src/shared/ui/ConfirmDialog';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { SlidingSegmentedControl } from '../src/shared/ui/SlidingSegmentedControl';
import { useTheme } from '../src/theme/theme-context';

const CATEGORY_TYPE_OPTIONS: readonly { value: CategoryType; label: string }[] = [
  { value: 'expense', label: '支出分类' },
  { value: 'income', label: '收入分类' },
];

interface DragSortState {
  scope: 'root' | 'child';
  parentId: string | null;
  itemId: string;
  fromIndex: number;
  toIndex: number;
  activeCount: number;
}

function moveItemInArray<T>(list: readonly T[], from: number, to: number): T[] {
  const copy = [...list];
  const [moved] = copy.splice(from, 1);
  if (moved !== undefined) {
    copy.splice(to, 0, moved);
  }
  return copy;
}

function computeRowShiftOffset(
  rowIndex: number,
  rowHeight: number,
  fromIndex: number,
  toIndex: number
): number {
  if (fromIndex === toIndex || rowIndex === fromIndex) {
    return 0;
  }
  if (fromIndex < toIndex && rowIndex > fromIndex && rowIndex <= toIndex) {
    return -rowHeight;
  }
  if (fromIndex > toIndex && rowIndex >= toIndex && rowIndex < fromIndex) {
    return rowHeight;
  }
  return 0;
}

export default function CategoriesScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { db, revision, notifyChange } = useDatabase();

  const [type, setType] = useState<CategoryType>('expense');
  const [categories, setCategories] = useState<Category[]>([]);
  const [expandedRootIds, setExpandedRootIds] = useState<Record<string, boolean>>({});
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragSortState | null>(null);
  const dragStateRef = useRef<DragSortState | null>(null);

  // 居中浮窗：新增或编辑分类
  const [editorTarget, setEditorTarget] = useState<{
    editing: Category | null;
    parent: Category | null;
  } | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  // 删除与账务迁移浮窗
  const [deleteTarget, setDeleteTarget] = useState<{
    category: Category;
    childCount: number;
    transactionCount: number;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // 分类单独 JSON 导入导出
  const [portabilityMenuOpen, setPortabilityMenuOpen] = useState(false);
  const [exportMethodOpen, setExportMethodOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<{
    mode: CategoryImportMode;
    filename: string;
    validated: ValidatedCategoriesImport;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [noticeDialog, setNoticeDialog] = useState<{
    title: string;
    message: string;
    tone?: 'primary' | 'destructive';
    icon?: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const list = await listCategories(db, { type, includeArchived: true });
      if (active) {
        setCategories(list);
      }
    })();
    return () => {
      active = false;
    };
  }, [db, type, revision]);

  // 构造单一列表分类树：启用在前按 sortOrder，停用沉底变灰
  const orderedTree = useMemo<CategoryTreeNode[]>(() => {
    const rawTree = buildCategoryTree(categories);
    return rawTree
      .map((node) => ({
        category: node.category,
        children: [...node.children].sort((a, b) => {
          if (a.isArchived !== b.isArchived) {
            return a.isArchived ? 1 : -1;
          }
          return a.sortOrder - b.sortOrder;
        }),
      }))
      .sort((a, b) => {
        if (a.category.isArchived !== b.category.isArchived) {
          return a.category.isArchived ? 1 : -1;
        }
        return a.category.sortOrder - b.category.sortOrder;
      });
  }, [categories]);

  const activeRootNodes = useMemo(
    () => orderedTree.filter((n) => !n.category.isArchived),
    [orderedTree]
  );

  const orderedTreeRef = useRef(orderedTree);
  useEffect(() => {
    orderedTreeRef.current = orderedTree;
  }, [orderedTree]);

  const closeAllSwipes = useCallback(() => {
    setOpenSwipeId(null);
  }, []);

  const handleToggleExpand = useCallback((rootId: string) => {
    setOpenSwipeId(null);
    setExpandedRootIds((prev) => ({
      ...prev,
      [rootId]: !prev[rootId],
    }));
  }, []);

  // --- 新增 / 编辑分类（居中浮窗） ---
  const openCreateRoot = useCallback(() => {
    hapticLight();
    setOpenSwipeId(null);
    setEditorError(null);
    setEditorTarget({ editing: null, parent: null });
  }, []);

  const openCreateChild = useCallback((parent: Category) => {
    setOpenSwipeId(null);
    setEditorError(null);
    setEditorTarget({ editing: null, parent });
  }, []);

  const openEdit = useCallback(
    (cat: Category) => {
      setOpenSwipeId(null);
      setEditorError(null);
      const parent = cat.parentId
        ? (categories.find((c) => c.id === cat.parentId) ?? null)
        : null;
      setEditorTarget({ editing: cat, parent });
    },
    [categories]
  );

  const handleSaveEditor = async (values: { name: string; icon: string; color: string }) => {
    if (!editorTarget || editorSaving) {
      return;
    }
    setEditorSaving(true);
    setEditorError(null);
    try {
      if (editorTarget.editing) {
        await updateCategory(db, editorTarget.editing.id, values);
      } else {
        await createCategory(db, {
          name: values.name,
          type,
          icon: values.icon,
          color: editorTarget.parent ? editorTarget.parent.color : values.color,
          parentId: editorTarget.parent?.id ?? null,
        });
        if (editorTarget.parent) {
          const parentId = editorTarget.parent.id;
          setExpandedRootIds((prev) => ({ ...prev, [parentId]: true }));
        }
      }
      setEditorTarget(null);
      notifyChange();
      hapticSuccess();
    } catch (err) {
      hapticWarning();
      setEditorError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setEditorSaving(false);
    }
  };

  // --- 停用 / 启用 ---
  const handleToggleArchive = useCallback(
    async (cat: Category) => {
      setOpenSwipeId(null);
      try {
        if (cat.isArchived) {
          await restoreCategory(db, cat.id);
        } else {
          await archiveCategory(db, cat.id);
          if (cat.parentId === null) {
            setExpandedRootIds((prev) => ({ ...prev, [cat.id]: false }));
          }
        }
        notifyChange();
        hapticSuccess();
      } catch (err) {
        hapticWarning();
        setNoticeDialog({
          title: cat.isArchived ? '启用失败' : '无法停用',
          message: err instanceof Error ? err.message : '操作失败',
          tone: 'destructive',
          icon: 'alert-circle-outline',
        });
      }
    },
    [db, notifyChange]
  );

  // --- 物理删除 + 账务迁移 ---
  const handleRequestDelete = useCallback(
    async (cat: Category) => {
      setOpenSwipeId(null);
      const childCount =
        cat.parentId === null
          ? (orderedTreeRef.current.find((n) => n.category.id === cat.id)?.children.length ?? 0)
          : 0;
      const transactionCount = await getCategoryTreeTransactionCount(db, cat.id);
      setDeleteError(null);
      setDeleteTarget({
        category: cat,
        childCount,
        transactionCount,
      });
    },
    [db]
  );

  const handleConfirmDelete = async (migrateToCategoryId: string | null) => {
    if (!deleteTarget || deleting) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteCategoryWithMigration(db, deleteTarget.category.id, migrateToCategoryId);
      setDeleteTarget(null);
      notifyChange();
      hapticSuccess();
    } catch (err) {
      hapticWarning();
      setDeleteError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  // --- 长按拖拽排序（一级先自动合拢二级，二级仅在所属子表内排，不交叉） ---
  const handleRootDragStart = useCallback((rootId: string, fromIndex: number) => {
    setOpenSwipeId(null);
    // 严格遵守规则：一级分类排序时先合拢全部已展开的二级分类
    setExpandedRootIds({});
    const activeCount = orderedTreeRef.current.filter((n) => !n.category.isArchived).length;
    const next: DragSortState = {
      scope: 'root',
      parentId: null,
      itemId: rootId,
      fromIndex,
      toIndex: fromIndex,
      activeCount,
    };
    dragStateRef.current = next;
    setDragState(next);
  }, []);

  const handleChildDragStart = useCallback(
    (parentId: string, childId: string, fromIndex: number) => {
      setOpenSwipeId(null);
      const parentNode = orderedTreeRef.current.find((n) => n.category.id === parentId);
      const activeCount = parentNode
        ? parentNode.children.filter((c) => !c.isArchived).length
        : 0;
      const next: DragSortState = {
        scope: 'child',
        parentId,
        itemId: childId,
        fromIndex,
        toIndex: fromIndex,
        activeCount,
      };
      dragStateRef.current = next;
      setDragState(next);
    },
    []
  );

  const handleDragMove = useCallback((translationY: number) => {
    const current = dragStateRef.current;
    if (!current) {
      return;
    }
    const rowStride = current.scope === 'root' ? ROOT_DRAG_STRIDE : CHILD_ROW_HEIGHT;
    const stepDelta = Math.round(translationY / rowStride);
    const nextTo = Math.max(0, Math.min(current.activeCount - 1, current.fromIndex + stepDelta));
    if (nextTo !== current.toIndex) {
      hapticSelection();
      const updated = { ...current, toIndex: nextTo };
      dragStateRef.current = updated;
      setDragState(updated);
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    const current = dragStateRef.current;
    dragStateRef.current = null;
    setDragState(null);

    if (!current || current.fromIndex === current.toIndex) {
      return;
    }

    if (current.scope === 'root') {
      const activeRoots = orderedTreeRef.current
        .filter((n) => !n.category.isArchived)
        .map((n) => n.category);
      const reordered = moveItemInArray(activeRoots, current.fromIndex, current.toIndex);
      const orderedIds = reordered.map((c) => c.id);

      // 乐观更新当前内存排序，避免松手瞬间闪烁回跳
      setCategories((prev) => {
        const orderMap = new Map(orderedIds.map((id, i) => [id, (i + 1) * 10]));
        return prev.map((c) => (orderMap.has(c.id) ? { ...c, sortOrder: orderMap.get(c.id)! } : c));
      });
      void reorderCategories(db, type, null, orderedIds).then(() => {
        notifyChange();
      });
    } else if (current.parentId) {
      const parentNode = orderedTreeRef.current.find((n) => n.category.id === current.parentId);
      if (!parentNode) {
        return;
      }
      const activeChildren = parentNode.children.filter((c) => !c.isArchived);
      const reordered = moveItemInArray(activeChildren, current.fromIndex, current.toIndex);
      const orderedIds = reordered.map((c) => c.id);

      setCategories((prev) => {
        const orderMap = new Map(orderedIds.map((id, i) => [id, (i + 1) * 10]));
        return prev.map((c) => (orderMap.has(c.id) ? { ...c, sortOrder: orderMap.get(c.id)! } : c));
      });
      void reorderCategories(db, type, current.parentId, orderedIds).then(() => {
        notifyChange();
      });
    }
  }, [db, notifyChange, type]);

  // --- 分类单独 JSON 导出与导入（增量 / 覆盖） ---
  const handleExportCategories = async (target: 'save' | 'share') => {
    try {
      const artifact = await generateCategoriesExport(db);
      if (target === 'save') {
        const res = await saveExportArtifactToDirectory(artifact);
        if (res.saved) {
          hapticSuccess();
          setNoticeDialog({
            title: '分类导出成功',
            message: `${artifact.filename}（共 ${artifact.categoryCount} 个支出与收入分类，支持手动编辑后再导入）`,
            tone: 'primary',
            icon: 'checkmark-circle-outline',
          });
        }
      } else {
        await shareExportArtifact(artifact);
      }
    } catch (err) {
      hapticWarning();
      setNoticeDialog({
        title: '导出失败',
        message: err instanceof Error ? err.message : '无法导出分类文件',
        tone: 'destructive',
        icon: 'alert-circle-outline',
      });
    }
  };

  const handlePickCategoryImport = async (mode: CategoryImportMode) => {
    try {
      const picked = await pickJsonFileText();
      if (picked.cancelled || picked.content === undefined) {
        return;
      }
      const validated = validateCategoriesImportJson(picked.content);
      setImportError(null);
      setPendingImport({
        mode,
        filename: picked.filename ?? 'categories.json',
        validated,
      });
    } catch (err) {
      hapticWarning();
      setNoticeDialog({
        title: '分类 JSON 校验未通过',
        message: err instanceof Error ? err.message : '无法解析分类配置',
        tone: 'destructive',
        icon: 'alert-circle-outline',
      });
    }
  };

  const handleConfirmCategoryImport = async () => {
    if (!pendingImport || importing) {
      return;
    }
    setImporting(true);
    setImportError(null);
    try {
      const res = await importCategoriesFromValidated(
        db,
        pendingImport.validated,
        pendingImport.mode
      );
      setPendingImport(null);
      notifyChange();
      hapticSuccess();
      const parts = [`新增 ${res.createdCount} 项`, `更新 ${res.updatedCount} 项`];
      if (res.deletedCount > 0) {
        parts.push(`移除 ${res.deletedCount} 项`);
      }
      if (res.preservedArchivedCount > 0) {
        parts.push(`保留 ${res.preservedArchivedCount} 个含历史账目的旧分类为停用`);
      }
      setNoticeDialog({
        title: res.mode === 'replace' ? '覆盖导入完成' : '增量导入完成',
        message: parts.join('，') + '。',
        tone: 'primary',
        icon: 'checkmark-circle-outline',
      });
    } catch (err) {
      hapticWarning();
      setImportError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  return (
    <SafeScreen edges={['left', 'right']}>
      <Stack.Screen
        options={{
          title: '分类管理',
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="分类导入与导出"
                onPress={() => {
                  hapticLight();
                  closeAllSwipes();
                  setPortabilityMenuOpen(true);
                }}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.headerIconBtn,
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <AppIcon name="feather:database" size={19} color={theme.colors.text} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="新增一级分类"
                onPress={openCreateRoot}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.headerIconBtn,
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <AppIcon name="add" size={24} color={theme.colors.action} />
              </Pressable>
            </View>
          ),
        }}
      />

      {/* 顶部支出 / 收入统一滑动分段切换 */}
      <View
        style={[
          styles.typeSwitchWrap,
          {
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.md,
            paddingBottom: theme.spacing.sm,
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        <SlidingSegmentedControl
          options={CATEGORY_TYPE_OPTIONS}
          value={type}
          onChange={(nextType) => {
            if (nextType === type) {
              return;
            }
            closeAllSwipes();
            setExpandedRootIds({});
            setType(nextType);
          }}
          fullWidth
          height={42}
          shape="pill"
          trackTone="surfaceRaised"
          textSize="sm"
        />
      </View>

      <ScrollView
        style={styles.flex}
        scrollEnabled={dragState === null}
        onScrollBeginDrag={closeAllSwipes}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.xs,
          paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.xl,
          gap: ROOT_CARD_GAP,
        }}
      >
        {orderedTree.map((node, rootIdx) => {
          const root = node.category;
          const isExpanded = Boolean(expandedRootIds[root.id]) && dragState?.scope !== 'root';
          const isDraggingThisRoot =
            dragState?.scope === 'root' && dragState.itemId === root.id;
          const rootShift =
            dragState?.scope === 'root' && !root.isArchived
              ? computeRowShiftOffset(
                  rootIdx,
                  ROOT_DRAG_STRIDE,
                  dragState.fromIndex,
                  dragState.toIndex
                )
              : 0;

          const activeChildrenCount = node.children.filter((c) => !c.isArchived).length;

          return (
            <CategoryRootRow
              key={root.id}
              category={root}
              childCount={node.children.length}
              expanded={isExpanded}
              index={rootIdx}
              activeSiblingCount={activeRootNodes.length}
              isDraggingThis={isDraggingThisRoot}
              shiftOffsetY={rootShift}
              anyDragging={dragState !== null}
              isSwipeOpen={openSwipeId === root.id}
              onSwipeOpen={(id) => setOpenSwipeId(id)}
              onSwipeClose={(id) => setOpenSwipeId((prev) => (prev === id ? null : prev))}
              onToggleExpand={handleToggleExpand}
              onAddChild={openCreateChild}
              onEdit={openEdit}
              onToggleArchive={(cat) => void handleToggleArchive(cat)}
              onDelete={(cat) => void handleRequestDelete(cat)}
              onDragStart={handleRootDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
            >
              {isExpanded && node.children.length > 0
                ? node.children.map((child, childIdx) => {
                    const isDraggingThisChild =
                      dragState?.scope === 'child' &&
                      dragState.parentId === root.id &&
                      dragState.itemId === child.id;
                    const childShift =
                      dragState?.scope === 'child' &&
                      dragState.parentId === root.id &&
                      !child.isArchived
                        ? computeRowShiftOffset(
                            childIdx,
                            CHILD_ROW_HEIGHT,
                            dragState.fromIndex,
                            dragState.toIndex
                          )
                        : 0;

                    return (
                      <CategoryChildRow
                        key={child.id}
                        category={child}
                        parentArchived={root.isArchived}
                        showDivider={childIdx < node.children.length - 1}
                        index={childIdx}
                        activeSiblingCount={activeChildrenCount}
                        isDraggingThis={isDraggingThisChild}
                        shiftOffsetY={childShift}
                        onEdit={openEdit}
                        onToggleArchive={(cat) => void handleToggleArchive(cat)}
                        onDelete={(cat) => void handleRequestDelete(cat)}
                        onDragStart={handleChildDragStart}
                        onDragMove={handleDragMove}
                        onDragEnd={handleDragEnd}
                      />
                    );
                  })
                : null}
            </CategoryRootRow>
          );
        })}
      </ScrollView>

      {/* 居中浮窗：新增 / 编辑分类与 9 大主题图标选择器 */}
      <CategoryEditorDialog
        visible={editorTarget !== null}
        type={type}
        editingCategory={editorTarget?.editing ?? null}
        parentCategory={editorTarget?.parent ?? null}
        saving={editorSaving}
        error={editorError}
        onCancel={() => {
          if (!editorSaving) {
            setEditorTarget(null);
            setEditorError(null);
          }
        }}
        onSave={(vals) => void handleSaveEditor(vals)}
      />

      {/* 删除分类与账务迁移浮窗 */}
      <CategoryDeleteDialog
        target={deleteTarget}
        allSameTypeCategories={categories}
        loading={deleting}
        error={deleteError}
        onCancel={() => {
          if (!deleting) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        onConfirm={(migrateId) => void handleConfirmDelete(migrateId)}
      />

      {/* 分类单独导入/导出操作菜单 */}
      <ActionSheet
        visible={portabilityMenuOpen}
        title="分类配置 JSON"
        subtitle="导出后可手动编辑图标、名称与顺序再导入"
        onClose={() => setPortabilityMenuOpen(false)}
        options={[
          {
            key: 'export',
            label: '导出分类配置（JSON）',
            subtitle: '导出全部支出与收入分类树',
            icon: 'download-outline',
            onPress: () => setExportMethodOpen(true),
          },
          {
            key: 'import_merge',
            label: '增量导入（合并）',
            subtitle: '匹配项更新、新增项追加，保留现有其余分类',
            icon: 'git-merge-outline',
            onPress: () => void handlePickCategoryImport('merge'),
          },
          {
            key: 'import_replace',
            label: '覆盖导入（重建）',
            subtitle: '按文件完整重建分类与排序，含旧账目的分类自动停用保留',
            icon: 'layers-outline',
            tone: 'destructive',
            onPress: () => void handlePickCategoryImport('replace'),
          },
        ]}
      />

      <ActionSheet
        visible={exportMethodOpen}
        title="导出分类 JSON"
        onClose={() => setExportMethodOpen(false)}
        options={[
          {
            key: 'save',
            label: '保存到本地文件夹',
            icon: 'folder-open-outline',
            onPress: () => void handleExportCategories('save'),
          },
          {
            key: 'share',
            label: '通过系统分享',
            icon: 'share-social-outline',
            onPress: () => void handleExportCategories('share'),
          },
        ]}
      />

      <ConfirmDialog
        visible={pendingImport !== null}
        title={pendingImport?.mode === 'replace' ? '确认覆盖导入分类？' : '确认增量导入分类？'}
        message={
          pendingImport
            ? `文件「${pendingImport.filename}」校验通过：含 ${pendingImport.validated.rootCount} 个一级分类、${pendingImport.validated.childCount} 个二级分类。`
            : ''
        }
        icon="pricetags-outline"
        tone={pendingImport?.mode === 'replace' ? 'destructive' : 'primary'}
        confirmLabel={pendingImport?.mode === 'replace' ? '覆盖导入' : '增量导入'}
        loading={importing}
        error={importError}
        onCancel={() => {
          if (!importing) {
            setPendingImport(null);
            setImportError(null);
          }
        }}
        onConfirm={() => void handleConfirmCategoryImport()}
      />

      <ConfirmDialog
        visible={noticeDialog !== null}
        title={noticeDialog?.title ?? ''}
        message={noticeDialog?.message ?? ''}
        icon={noticeDialog?.icon ?? 'checkmark-circle-outline'}
        tone={noticeDialog?.tone ?? 'primary'}
        confirmLabel="知道了"
        hideCancel
        onCancel={() => setNoticeDialog(null)}
        onConfirm={() => setNoticeDialog(null)}
      />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeSwitchWrap: {},
});
