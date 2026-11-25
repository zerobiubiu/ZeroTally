/**
 * 约束简报（Workflow B / C）：
 * - 信息层级：主（支出/收入切换 + 启用分类清单）、次（新增/编辑面板与 5 列等宽图标网格）、弱（已停用分类恢复区）
 * - 布局规整：顶部切换条与紧凑新增按钮等高对齐；图标网格使用显式 5 列行避免右端参差
 */
import { Stack } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../src/db/database-context';
import {
  CUSTOM_CATEGORY_COLORS,
  CUSTOM_CATEGORY_ICONS,
} from '../src/features/categories/presets';
import {
  createCategory,
  listCategories,
  removeOrArchiveCategory,
  restoreCategory,
  updateCategory,
} from '../src/features/categories/service';
import type { Category, CategoryType } from '../src/features/categories/types';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { Button } from '../src/shared/ui/Button';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { useTheme } from '../src/theme/theme-context';

function chunkIcons(items: readonly string[], columns: number): string[][] {
  const rows: string[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}

export default function CategoriesScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { db, revision, notifyChange } = useDatabase();

  const [type, setType] = useState<CategoryType>('expense');
  const [categories, setCategories] = useState<Category[]>([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [iconInput, setIconInput] = useState<string>(CUSTOM_CATEGORY_ICONS[0] ?? 'pricetag-outline');
  const [colorInput, setColorInput] = useState<string>(CUSTOM_CATEGORY_COLORS[0] ?? '#0F766E');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const iconRows = useMemo(() => chunkIcons(CUSTOM_CATEGORY_ICONS, 5), []);

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

  const activeCategories = categories.filter((c) => !c.isArchived);
  const archivedCategories = categories.filter((c) => c.isArchived);

  const openCreateEditor = () => {
    setEditingCategory(null);
    setNameInput('');
    setIconInput(CUSTOM_CATEGORY_ICONS[0] ?? 'pricetag-outline');
    setColorInput(CUSTOM_CATEGORY_COLORS[0] ?? '#0F766E');
    setFormError(null);
    setEditorOpen(true);
  };

  const openEditEditor = (cat: Category) => {
    setEditingCategory(cat);
    setNameInput(cat.name);
    setIconInput(cat.icon);
    setColorInput(cat.color);
    setFormError(null);
    setEditorOpen(true);
  };

  const handleSaveCategory = async () => {
    setFormError(null);
    setSaving(true);
    try {
      if (editingCategory) {
        await updateCategory(db, editingCategory.id, {
          name: nameInput,
          icon: iconInput,
          color: colorInput,
        });
      } else {
        await createCategory(db, {
          name: nameInput,
          type,
          icon: iconInput,
          color: colorInput,
        });
      }
      notifyChange();
      setEditorOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveOrArchive = (cat: Category) => {
    Alert.alert(
      cat.isSystem ? '停用分类' : '删除分类',
      cat.isSystem
        ? `停用「${cat.name}」后历史账目不受影响，可随时恢复。`
        : `若「${cat.name}」已关联账目将转为停用，否则永久删除。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: cat.isSystem ? '停用' : '确认',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await removeOrArchiveCategory(db, cat.id);
                notifyChange();
              } catch (err) {
                Alert.alert('操作失败', err instanceof Error ? err.message : '无法处理该分类');
              }
            })();
          },
        },
      ]
    );
  };

  const handleRestore = async (cat: Category) => {
    try {
      await restoreCategory(db, cat.id);
      notifyChange();
    } catch (err) {
      Alert.alert('恢复失败', err instanceof Error ? err.message : '无法恢复分类');
    }
  };

  return (
    <SafeScreen edges={['left', 'right']}>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.xl,
        }}
      >
        <Stack.Screen options={{ title: '分类管理' }} />

        <View style={styles.topRow}>
          <View
            style={[
              styles.segmentBar,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderRadius: theme.radius.md,
                padding: theme.spacing.xs,
              },
            ]}
          >
            {(['expense', 'income'] as const).map((tab) => {
              const selected = type === tab;
              return (
                <Pressable
                  key={tab}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setType(tab);
                    setEditorOpen(false);
                  }}
                  style={[
                    styles.segmentItem,
                    {
                      borderRadius: theme.radius.sm,
                      backgroundColor: selected ? theme.colors.actionSubtle : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: selected ? theme.colors.actionTextOnSubtle : theme.colors.textMuted,
                      fontSize: theme.fontSize.sm,
                      fontWeight: selected ? theme.fontWeight.semibold : theme.fontWeight.regular,
                    }}
                  >
                    {tab === 'expense' ? '支出' : '收入'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Button
            label="新增"
            size="sm"
            onPress={openCreateEditor}
            style={{ marginLeft: theme.spacing.sm, minWidth: 76 }}
          />
        </View>

        {editorOpen ? (
          <View
            style={[
              styles.editorCard,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderColor: theme.colors.action,
                borderWidth: theme.borderWidth.hairline,
                borderRadius: theme.radius.lg,
                padding: theme.spacing.lg,
                marginTop: theme.spacing.lg,
              },
            ]}
          >
            <Text
              style={{
                color: theme.colors.text,
                fontSize: theme.fontSize.base,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              {editingCategory ? `编辑「${editingCategory.name}」` : '新增分类'}
            </Text>

            <TextInput
              accessibilityLabel="分类名称"
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="咖啡"
              placeholderTextColor={theme.colors.textMuted}
              maxLength={16}
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  color: theme.colors.text,
                  borderRadius: theme.radius.md,
                  fontSize: theme.fontSize.base,
                  marginTop: theme.spacing.md,
                },
              ]}
            />

            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
                marginTop: theme.spacing.lg,
                marginBottom: theme.spacing.sm,
              }}
            >
              图标
            </Text>
            <View style={{ gap: theme.spacing.sm }}>
              {iconRows.map((row, rowIdx) => (
                <View key={rowIdx} style={styles.iconRow}>
                  {row.map((ic) => {
                    const selected = ic === iconInput;
                    return (
                      <Pressable
                        key={ic}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => setIconInput(ic)}
                        style={[
                          styles.iconOption,
                          {
                            backgroundColor: selected
                              ? theme.colors.actionSubtle
                              : theme.colors.surface,
                            borderColor: selected ? theme.colors.action : theme.colors.border,
                            borderWidth: selected
                              ? theme.borderWidth.focus
                              : theme.borderWidth.hairline,
                            borderRadius: theme.radius.md,
                          },
                        ]}
                      >
                        <AppIcon
                          name={ic}
                          size={20}
                          color={
                            selected ? theme.colors.actionTextOnSubtle : theme.colors.textSecondary
                          }
                        />
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>

            {formError ? (
              <Text
                style={{
                  color: theme.colors.expense,
                  fontSize: theme.fontSize.xs,
                  marginTop: theme.spacing.md,
                }}
              >
                {formError}
              </Text>
            ) : null}

            <View style={[styles.editorBtns, { marginTop: theme.spacing.lg }]}>
              <Button
                label="取消"
                size="sm"
                variant="secondary"
                onPress={() => setEditorOpen(false)}
                style={{ flex: 1 }}
              />
              <Button
                label="保存"
                size="sm"
                onPress={() => void handleSaveCategory()}
                loading={saving}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        ) : null}

        <View style={{ marginTop: theme.spacing.xl }}>
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: theme.fontSize.xs,
              fontWeight: theme.fontWeight.semibold,
              marginBottom: theme.spacing.sm,
              paddingHorizontal: 4,
            }}
          >
            启用（{activeCategories.length}）
          </Text>
          <View
            style={[
              styles.listCard,
              theme.elevation.card,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderRadius: theme.radius.lg,
              },
            ]}
          >
            {activeCategories.map((cat, idx) => (
              <View
                key={cat.id}
                style={[
                  styles.catRow,
                  {
                    paddingHorizontal: theme.spacing.lg,
                    borderBottomColor: theme.colors.border,
                    borderBottomWidth:
                      idx < activeCategories.length - 1 ? theme.borderWidth.hairline : 0,
                  },
                ]}
              >
                <View
                  style={[
                    styles.catBadge,
                    {
                      backgroundColor: theme.colors.actionSubtle,
                      borderRadius: theme.radius.full,
                    },
                  ]}
                >
                  <AppIcon name={cat.icon} size={18} color={theme.colors.actionTextOnSubtle} />
                </View>

                <View style={{ flex: 1, marginRight: theme.spacing.sm }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: theme.colors.text,
                      fontSize: theme.fontSize.base,
                      fontWeight: theme.fontWeight.semibold,
                    }}
                  >
                    {cat.name}
                  </Text>
                  <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                    {cat.isSystem ? '预设' : '自定义'}
                  </Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`编辑 ${cat.name}`}
                  onPress={() => openEditEditor(cat)}
                  style={styles.rowAction}
                >
                  <Text
                    style={{
                      color: theme.colors.action,
                      fontSize: theme.fontSize.sm,
                      fontWeight: theme.fontWeight.semibold,
                    }}
                  >
                    编辑
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={cat.isSystem ? `停用 ${cat.name}` : `删除 ${cat.name}`}
                  onPress={() => handleRemoveOrArchive(cat)}
                  style={styles.rowAction}
                >
                  <Text
                    style={{
                      color: theme.colors.expense,
                      fontSize: theme.fontSize.sm,
                      fontWeight: theme.fontWeight.semibold,
                    }}
                  >
                    {cat.isSystem ? '停用' : '删除'}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>

        {archivedCategories.length > 0 ? (
          <View style={{ marginTop: theme.spacing.xl }}>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
                marginBottom: theme.spacing.sm,
                paddingHorizontal: 4,
              }}
            >
              已停用（{archivedCategories.length}）
            </Text>
            <View
              style={[
                styles.listCard,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderRadius: theme.radius.lg,
                },
              ]}
            >
              {archivedCategories.map((cat, idx) => (
                <View
                  key={cat.id}
                  style={[
                    styles.catRow,
                    {
                      paddingHorizontal: theme.spacing.lg,
                      borderBottomColor: theme.colors.border,
                      borderBottomWidth:
                        idx < archivedCategories.length - 1 ? theme.borderWidth.hairline : 0,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.catBadge,
                      {
                        backgroundColor: theme.colors.surface,
                        borderRadius: theme.radius.full,
                      },
                    ]}
                  >
                    <AppIcon name={cat.icon} size={18} color={theme.colors.textMuted} />
                  </View>

                  <Text
                    numberOfLines={1}
                    style={{
                      flex: 1,
                      color: theme.colors.textMuted,
                      fontSize: theme.fontSize.base,
                    }}
                  >
                    {cat.name}
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`恢复 ${cat.name}`}
                    onPress={() => void handleRestore(cat)}
                    style={styles.rowAction}
                  >
                    <Text
                      style={{
                        color: theme.colors.action,
                        fontSize: theme.fontSize.sm,
                        fontWeight: theme.fontWeight.semibold,
                      }}
                    >
                      恢复
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  segmentBar: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorCard: {},
  input: {
    minHeight: 48,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  iconRow: {
    flexDirection: 'row',
    gap: 8,
  },
  iconOption: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorBtns: {
    flexDirection: 'row',
    gap: 12,
  },
  listCard: {
    overflow: 'hidden',
  },
  catRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
  },
  catBadge: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowAction: {
    minHeight: 44,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
