/**
 * 约束简报（Workflow B）：
 * - 分类删除与账务迁移确认浮窗：若待删分类（或其子分类）下有历史账务，要求用户从同类型可用分类中选择目标迁移分类，并在单一事务内完成迁移与物理删除
 */
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { hapticMedium, hapticSelection } from '../../../shared/haptics/haptics';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { useTheme } from '../../../theme/theme-context';
import type { Category } from '../types';

export interface CategoryDeleteDialogProps {
  target: {
    category: Category;
    childCount: number;
    transactionCount: number;
  } | null;
  /** 全部同类型分类，用于筛选可选迁移目标 */
  allSameTypeCategories: readonly Category[];
  loading: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (migrateToCategoryId: string | null) => void;
}

export function CategoryDeleteDialog({
  target,
  allSameTypeCategories,
  loading,
  error,
  onCancel,
  onConfirm,
}: CategoryDeleteDialogProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const targetId = target?.category.id ?? '';

  const migrationCandidates = useMemo(() => {
    if (!target) {
      return [];
    }
    const rootById = new Map(
      allSameTypeCategories.filter((c) => c.parentId === null).map((c) => [c.id, c])
    );

    const eligible = allSameTypeCategories.filter(
      (c) =>
        !c.isArchived &&
        c.id !== target.category.id &&
        c.parentId !== target.category.id
    );

    return eligible.map((cat) => {
      const parent = cat.parentId ? rootById.get(cat.parentId) : null;
      return {
        category: cat,
        displayLabel: parent ? `${parent.name} · ${cat.name}` : cat.name,
      };
    });
  }, [allSameTypeCategories, target]);

  const [lastTargetId, setLastTargetId] = useState(targetId);
  const [selectedMigrateId, setSelectedMigrateId] = useState<string>('');

  if (targetId !== lastTargetId) {
    setLastTargetId(targetId);
    setSelectedMigrateId(migrationCandidates[0]?.category.id ?? '');
  }

  if (!target) {
    return null;
  }

  const needsMigration = target.transactionCount > 0;
  const effectiveMigrateId = needsMigration
    ? selectedMigrateId || migrationCandidates[0]?.category.id || ''
    : null;
  const canConfirm = !loading && (!needsMigration || Boolean(effectiveMigrateId));

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!loading) {
          onCancel();
        }
      }}
    >
      <View style={[styles.backdrop, { backgroundColor: theme.colors.scrim }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="取消删除分类"
          onPress={() => {
            if (!loading) {
              onCancel();
            }
          }}
          style={StyleSheet.absoluteFill}
        />

        <View
          style={[
            styles.dialog,
            theme.elevation.floating,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderColor: theme.colors.border,
              borderWidth: theme.borderWidth.hairline,
              borderRadius: theme.radius.lg,
              padding: theme.spacing.lg,
            },
          ]}
        >
          <View
            style={[
              styles.iconBadge,
              {
                backgroundColor: theme.colors.expenseSubtle,
                borderRadius: theme.radius.full,
              },
            ]}
          >
            <AppIcon name="trash-outline" size={24} color={theme.colors.expense} />
          </View>

          <Text
            style={[
              styles.title,
              {
                color: theme.colors.text,
                fontSize: theme.fontSize.lg,
                fontWeight: theme.fontWeight.semibold,
                marginTop: theme.spacing.md,
              },
            ]}
          >
            删除「{target.category.name}」？
          </Text>

          <Text
            style={[
              styles.message,
              {
                color: theme.colors.textSecondary,
                fontSize: theme.fontSize.sm,
                marginTop: theme.spacing.xs,
              },
            ]}
          >
            {needsMigration
              ? `该分类${target.childCount > 0 ? `（含 ${target.childCount} 个子分类）` : ''}关联了 ${target.transactionCount} 笔历史账目，请选择目标分类迁移账务后再删除。`
              : target.childCount > 0
                ? `将连同删除其下 ${target.childCount} 个子分类，且删除后不可撤销。`
                : '该分类下暂无关联账目，删除后不可撤销。'}
          </Text>

          {needsMigration ? (
            <View style={{ marginTop: theme.spacing.md }}>
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: theme.fontSize.xs,
                  fontWeight: theme.fontWeight.semibold,
                  marginBottom: theme.spacing.xs,
                }}
              >
                迁移账务至：
              </Text>

              {migrationCandidates.length === 0 ? (
                <View
                  style={[
                    styles.errorBox,
                    {
                      backgroundColor: theme.colors.warningSubtle,
                      borderLeftColor: theme.colors.warning,
                      borderRadius: theme.radius.sm,
                      padding: theme.spacing.sm,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: theme.colors.warningTextOnSubtle,
                      fontSize: theme.fontSize.xs,
                    }}
                  >
                    暂无其他可用分类可承接账务，请先新建或启用一个同类型分类。
                  </Text>
                </View>
              ) : (
                <ScrollView
                  style={[
                    styles.candidateScroll,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                      borderWidth: theme.borderWidth.hairline,
                      borderRadius: theme.radius.md,
                    },
                  ]}
                >
                  {migrationCandidates.map((cand, idx) => {
                    const selected = cand.category.id === effectiveMigrateId;
                    return (
                      <Pressable
                        key={cand.category.id}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        onPress={() => {
                          hapticSelection();
                          setSelectedMigrateId(cand.category.id);
                        }}
                        style={({ pressed }) => [
                          styles.candidateRow,
                          {
                            paddingHorizontal: theme.spacing.md,
                            backgroundColor: selected
                              ? theme.colors.actionSubtle
                              : 'transparent',
                            borderBottomColor: theme.colors.border,
                            borderBottomWidth:
                              idx < migrationCandidates.length - 1
                                ? theme.borderWidth.hairline
                                : 0,
                          },
                          pressed && { opacity: theme.opacity.pressed },
                        ]}
                      >
                        <View
                          style={[
                            styles.candIcon,
                            {
                              backgroundColor: `${cand.category.color}1F`,
                              borderRadius: theme.radius.full,
                            },
                          ]}
                        >
                          <AppIcon
                            name={cand.category.icon}
                            size={16}
                            color={cand.category.color}
                          />
                        </View>
                        <Text
                          numberOfLines={1}
                          style={{
                            flex: 1,
                            color: selected
                              ? theme.colors.actionTextOnSubtle
                              : theme.colors.text,
                            fontSize: theme.fontSize.sm,
                            fontWeight: selected
                              ? theme.fontWeight.semibold
                              : theme.fontWeight.regular,
                          }}
                        >
                          {cand.displayLabel}
                        </Text>
                        {selected ? (
                          <AppIcon name="checkmark" size={18} color={theme.colors.action} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          ) : null}

          {error ? (
            <View
              style={[
                styles.errorBox,
                {
                  backgroundColor: theme.colors.expenseSubtle,
                  borderLeftColor: theme.colors.expense,
                  borderRadius: theme.radius.sm,
                  marginTop: theme.spacing.sm,
                  paddingHorizontal: theme.spacing.sm,
                  paddingVertical: theme.spacing.xs,
                },
              ]}
            >
              <AppIcon
                name="alert-circle-outline"
                size={15}
                color={theme.colors.expenseTextOnSubtle}
              />
              <Text
                style={{
                  color: theme.colors.expenseTextOnSubtle,
                  fontSize: theme.fontSize.xs,
                  fontWeight: theme.fontWeight.semibold,
                  marginLeft: theme.spacing.xs,
                  flex: 1,
                }}
              >
                {error}
              </Text>
            </View>
          ) : null}

          <View style={[styles.actionsRow, { marginTop: theme.spacing.lg, gap: theme.spacing.sm }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="取消"
              disabled={loading}
              onPress={onCancel}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderWidth: theme.borderWidth.hairline,
                  borderRadius: theme.radius.md,
                  opacity: loading ? theme.opacity.disabled : 1,
                },
                pressed && !loading && { opacity: theme.opacity.pressed },
              ]}
            >
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: theme.fontSize.base,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                取消
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={needsMigration ? '迁移并删除' : '确认删除'}
              disabled={!canConfirm}
              onPress={() => {
                hapticMedium();
                onConfirm(effectiveMigrateId);
              }}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: theme.colors.expense,
                  borderRadius: theme.radius.md,
                  opacity: canConfirm ? 1 : theme.opacity.disabled,
                },
                pressed && canConfirm && { opacity: theme.opacity.pressed },
              ]}
            >
              {loading ? (
                <ActivityIndicator size="small" color={theme.colors.onAction} />
              ) : (
                <Text
                  style={{
                    color: theme.colors.onAction,
                    fontSize: theme.fontSize.base,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  {needsMigration ? '迁移并删除' : '确认删除'}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '82%',
  },
  iconBadge: {
    width: 48,
    height: 48,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    lineHeight: 20,
  },
  candidateScroll: {
    maxHeight: 216,
  },
  candidateRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  candIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
  },
  actionsRow: {
    flexDirection: 'row',
  },
  actionBtn: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
});
