/**
 * 约束简报（Workflow B / C）：
 * - 居中浮窗表单：取代原先页内展开编辑区，新增一级/二级与编辑分类统一在此完成
 * - 多分类图标选择器：支持 9 大生活主题横向标签切换 + 5 列双图库（MaterialCommunityIcons + Ionicons）网格点选，打开编辑时自动定位到原图标所属分组
 */
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { hapticLight, hapticSelection, hapticWarning } from '../../../shared/haptics/haptics';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { CATEGORY_ICON_GROUPS } from '../../../shared/ui/icon-catalog';
import { useTheme } from '../../../theme/theme-context';
import { CUSTOM_CATEGORY_COLORS } from '../presets';
import type { Category, CategoryType } from '../types';

export interface CategoryEditorDialogProps {
  visible: boolean;
  type: CategoryType;
  /** 非空时表示编辑已有分类；为空时表示新增 */
  editingCategory: Category | null;
  /** 新增二级分类时的所属一级分类；新增一级时为 null */
  parentCategory: Category | null;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (values: { name: string; icon: string; color: string }) => void;
}

function findGroupKeyForIcon(iconName: string): string {
  for (const group of CATEGORY_ICON_GROUPS) {
    if (group.icons.includes(iconName)) {
      return group.key;
    }
  }
  return CATEGORY_ICON_GROUPS[0]!.key;
}

function chunkItems<T>(items: readonly T[], cols: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += cols) {
    rows.push(items.slice(i, i + cols));
  }
  return rows;
}

export function CategoryEditorDialog({
  visible,
  type,
  editingCategory,
  parentCategory,
  saving,
  error,
  onCancel,
  onSave,
}: CategoryEditorDialogProps): React.JSX.Element | null {
  const { theme } = useTheme();

  const defaultIcon = editingCategory?.icon ?? parentCategory?.icon ?? 'restaurant-outline';
  const defaultColor =
    editingCategory?.color ??
    parentCategory?.color ??
    (type === 'income' ? '#059669' : CUSTOM_CATEGORY_COLORS[0] ?? '#D97706');

  const sessionKey = visible
    ? `${editingCategory?.id ?? 'new'}|${parentCategory?.id ?? 'root'}|${type}`
    : 'closed';
  const [lastKey, setLastKey] = useState(sessionKey);
  const [name, setName] = useState(editingCategory?.name ?? '');
  const [icon, setIcon] = useState(defaultIcon);
  const [color, setColor] = useState(defaultColor);
  const [activeGroupKey, setActiveGroupKey] = useState(() => findGroupKeyForIcon(defaultIcon));
  const [localError, setLocalError] = useState<string | null>(null);

  if (sessionKey !== lastKey) {
    setLastKey(sessionKey);
    if (visible) {
      setName(editingCategory?.name ?? '');
      setIcon(defaultIcon);
      setColor(defaultColor);
      setActiveGroupKey(findGroupKeyForIcon(defaultIcon));
      setLocalError(null);
    }
  }

  const activeGroup = useMemo(
    () => CATEGORY_ICON_GROUPS.find((g) => g.key === activeGroupKey) ?? CATEGORY_ICON_GROUPS[0]!,
    [activeGroupKey]
  );
  const iconRows = useMemo(() => chunkItems(activeGroup.icons, 5), [activeGroup]);

  if (!visible) {
    return null;
  }

  const isChild = Boolean(editingCategory ? editingCategory.parentId : parentCategory);
  const effectiveColor = isChild && parentCategory ? parentCategory.color : color;
  const displayError = error ?? localError;

  const dialogTitle = editingCategory
    ? `编辑「${editingCategory.name}」`
    : parentCategory
      ? `添加「${parentCategory.name}」子分类`
      : `新增${type === 'income' ? '收入' : '支出'}分类`;

  const handlePressSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      hapticWarning();
      setLocalError('请输入分类名称');
      return;
    }
    if (trimmed.length > 12) {
      hapticWarning();
      setLocalError('分类名称不能超过 12 个字符');
      return;
    }
    Keyboard.dismiss();
    setLocalError(null);
    hapticLight();
    onSave({ name: trimmed, icon, color: effectiveColor });
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!saving) {
          onCancel();
        }
      }}
    >
      <KeyboardAvoidingView
        style={[styles.backdrop, { backgroundColor: theme.colors.scrim }]}
        behavior="padding"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="取消编辑分类"
          onPress={() => {
            if (!saving) {
              Keyboard.dismiss();
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
          {/* 标题栏 */}
          <View style={styles.headerRow}>
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                color: theme.colors.text,
                fontSize: theme.fontSize.lg,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              {dialogTitle}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭"
              disabled={saving}
              onPress={onCancel}
              hitSlop={10}
              style={({ pressed }) => [
                styles.closeBtn,
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <AppIcon name="close" size={20} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          {/* 实时预览 + 名称输入 */}
          <View style={[styles.nameRow, { marginTop: theme.spacing.md, gap: theme.spacing.sm }]}>
            <View
              style={[
                styles.previewBadge,
                {
                  backgroundColor: `${effectiveColor}1F`,
                  borderColor: effectiveColor,
                  borderWidth: theme.borderWidth.hairline,
                  borderRadius: theme.radius.full,
                },
              ]}
            >
              <AppIcon name={icon} size={22} color={effectiveColor} />
            </View>
            <TextInput
              accessibilityLabel="分类名称"
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (localError) {
                  setLocalError(null);
                }
              }}
              maxLength={12}
              placeholder="输入分类名称（最多 12 字）"
              placeholderTextColor={theme.colors.textMuted}
              returnKeyType="done"
              onSubmitEditing={handlePressSave}
              style={[
                styles.nameInput,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  color: theme.colors.text,
                  borderRadius: theme.radius.md,
                  fontSize: theme.fontSize.base,
                },
              ]}
            />
          </View>

          {/* 一级分类支持选色，二级分类自动继承所属一级颜色 */}
          {!isChild ? (
            <View style={{ marginTop: theme.spacing.md }}>
              <View style={styles.colorRow}>
                {CUSTOM_CATEGORY_COLORS.map((hex) => {
                  const selected = hex.toLowerCase() === effectiveColor.toLowerCase();
                  return (
                    <Pressable
                      key={hex}
                      accessibilityRole="button"
                      accessibilityLabel={`颜色 ${hex}`}
                      accessibilityState={{ selected }}
                      onPress={() => {
                        hapticSelection();
                        setColor(hex);
                      }}
                      style={[
                        styles.colorOuter,
                        {
                          borderColor: selected ? hex : 'transparent',
                          borderRadius: theme.radius.full,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.colorDot,
                          {
                            backgroundColor: hex,
                            borderRadius: theme.radius.full,
                          },
                        ]}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* 图标分组横向标签栏 */}
          <View style={{ marginTop: theme.spacing.md }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: theme.spacing.xs, paddingBottom: theme.spacing.xs }}
            >
              {CATEGORY_ICON_GROUPS.map((group) => {
                const selected = group.key === activeGroup.key;
                return (
                  <Pressable
                    key={group.key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      hapticSelection();
                      setActiveGroupKey(group.key);
                    }}
                    style={[
                      styles.groupChip,
                      {
                        backgroundColor: selected
                          ? theme.colors.actionSubtle
                          : theme.colors.surface,
                        borderColor: selected ? theme.colors.action : theme.colors.border,
                        borderWidth: theme.borderWidth.hairline,
                        borderRadius: theme.radius.full,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: selected
                          ? theme.colors.actionTextOnSubtle
                          : theme.colors.textSecondary,
                        fontSize: theme.fontSize.xs,
                        fontWeight: selected ? theme.fontWeight.semibold : theme.fontWeight.regular,
                      }}
                    >
                      {group.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* 5 列图标网格 */}
            <ScrollView
              style={[
                styles.iconGridScroll,
                {
                  backgroundColor: theme.colors.surface,
                  borderRadius: theme.radius.md,
                  marginTop: theme.spacing.xs,
                },
              ]}
              contentContainerStyle={{ padding: theme.spacing.sm, gap: theme.spacing.xs }}
              keyboardShouldPersistTaps="handled"
            >
              {iconRows.map((row, rIdx) => (
                <View key={rIdx} style={[styles.iconRow, { gap: theme.spacing.xs }]}>
                  {row.map((iconName) => {
                    const selected = iconName === icon;
                    return (
                      <Pressable
                        key={iconName}
                        accessibilityRole="button"
                        accessibilityLabel={`图标 ${iconName}`}
                        accessibilityState={{ selected }}
                        onPress={() => {
                          Keyboard.dismiss();
                          hapticSelection();
                          setIcon(iconName);
                        }}
                        style={({ pressed }) => [
                          styles.iconCell,
                          {
                            backgroundColor: selected
                              ? theme.colors.surfaceRaised
                              : 'transparent',
                            borderColor: selected ? effectiveColor : 'transparent',
                            borderWidth: selected ? theme.borderWidth.focus : 0,
                            borderRadius: theme.radius.md,
                          },
                          pressed && { opacity: theme.opacity.pressed },
                        ]}
                      >
                        <AppIcon
                          name={iconName}
                          size={22}
                          color={selected ? effectiveColor : theme.colors.textSecondary}
                        />
                      </Pressable>
                    );
                  })}
                  {row.length < 5
                    ? Array.from({ length: 5 - row.length }).map((_, padIdx) => (
                        <View key={`pad_${padIdx}`} style={styles.iconCell} />
                      ))
                    : null}
                </View>
              ))}
            </ScrollView>
          </View>

          {displayError ? (
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
                {displayError}
              </Text>
            </View>
          ) : null}

          <View style={[styles.actionsRow, { marginTop: theme.spacing.md, gap: theme.spacing.sm }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="取消"
              disabled={saving}
              onPress={onCancel}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderWidth: theme.borderWidth.hairline,
                  borderRadius: theme.radius.md,
                  opacity: saving ? theme.opacity.disabled : 1,
                },
                pressed && !saving && { opacity: theme.opacity.pressed },
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
              accessibilityLabel="保存分类"
              disabled={saving}
              onPress={handlePressSave}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: theme.colors.action,
                  borderRadius: theme.radius.md,
                  opacity: saving ? theme.opacity.disabled : 1,
                },
                pressed && !saving && { opacity: theme.opacity.pressed },
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={theme.colors.onAction} />
              ) : (
                <Text
                  style={{
                    color: theme.colors.onAction,
                    fontSize: theme.fontSize.base,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  保存
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  dialog: {
    width: '100%',
    maxWidth: 384,
    maxHeight: '86%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewBadge: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameInput: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  colorOuter: {
    width: 32,
    height: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDot: {
    width: 22,
    height: 22,
  },
  groupChip: {
    minHeight: 30,
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGridScroll: {
    maxHeight: 204,
  },
  iconRow: {
    flexDirection: 'row',
  },
  iconCell: {
    flex: 1,
    height: 44,
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
  },
});
