/**
 * 约束简报（Workflow B）：
 * - 信息层级：主（当前选中分类的高亮图标与文字）、次（未选中的一级分类与展开后的二级子类网格）、弱（一级分类右下角可展开角标）
 * - 令牌约束：全部间距/字号/圆角/颜色取自 useTheme()（surfaceRaised 承托二级抽屉面板、action/actionSubtle 表达选中态、textSecondary 弱化未选态）
 * - 交互规则：5 列紧凑等宽网格提升单行密度；点击一级即选中一级并展开其二级抽屉，点击二级细选，再次点击已选二级退回一级
 */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { hapticSelection } from '../../../shared/haptics/haptics';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { useTheme } from '../../../theme/theme-context';
import type { Category, CategoryTreeNode } from '../types';

const GRID_COLUMNS = 5;

interface CategoryHierarchyPickerProps {
  nodes: readonly CategoryTreeNode[];
  selectedCategoryId: string | null;
  expandedRootId: string | null;
  onSelectCategory: (categoryId: string) => void;
  onToggleExpand: (rootId: string | null) => void;
}

function chunkItems<T>(items: readonly T[], columns: number): (T | null)[][] {
  const rows: (T | null)[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    const row: (T | null)[] = items.slice(i, i + columns);
    while (row.length < columns) {
      row.push(null);
    }
    rows.push(row);
  }
  return rows;
}

export function CategoryHierarchyPicker({
  nodes,
  selectedCategoryId,
  expandedRootId,
  onSelectCategory,
  onToggleExpand,
}: CategoryHierarchyPickerProps): React.JSX.Element {
  const { theme } = useTheme();

  const rootRows = useMemo(() => chunkItems(nodes, GRID_COLUMNS), [nodes]);

  const handlePressRoot = (node: CategoryTreeNode) => {
    hapticSelection();
    const isRootSelected = selectedCategoryId === node.category.id;
    const isChildSelected = node.children.some((c) => c.id === selectedCategoryId);
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedRootId === node.category.id && hasChildren;

    if (isChildSelected) {
      // 已选二级时再点一级，切回一级本身并保持展开便于查看
      onSelectCategory(node.category.id);
      return;
    }

    if (isRootSelected) {
      if (hasChildren) {
        onToggleExpand(isExpanded ? null : node.category.id);
      }
      return;
    }

    onSelectCategory(node.category.id);
    onToggleExpand(hasChildren ? node.category.id : null);
  };

  const handlePressChild = (parent: Category, child: Category) => {
    hapticSelection();
    if (selectedCategoryId === child.id) {
      onSelectCategory(parent.id);
      return;
    }
    onSelectCategory(child.id);
  };

  return (
    <View style={{ gap: theme.spacing.xs }}>
      {rootRows.map((row, rowIndex) => {
        let expandedNode: CategoryTreeNode | null = null;
        let expandedColIndex = -1;

        row.forEach((cell, colIndex) => {
          if (cell && cell.category.id === expandedRootId && cell.children.length > 0) {
            expandedNode = cell;
            expandedColIndex = colIndex;
          }
        });

        return (
          <View key={rowIndex}>
            <View style={styles.gridRow}>
              {row.map((node, colIndex) => {
                if (!node) {
                  return <View key={`empty_${colIndex}`} style={styles.rootCell} />;
                }

                const hasChildren = node.children.length > 0;
                const isRootSelected = selectedCategoryId === node.category.id;
                const isChildSelected = node.children.some((c) => c.id === selectedCategoryId);
                const isHighlighted = isRootSelected || isChildSelected;
                const isExpanded = expandedRootId === node.category.id && hasChildren;

                const badgeBg = isRootSelected
                  ? theme.colors.action
                  : isChildSelected
                    ? theme.colors.actionSubtle
                    : theme.colors.surfaceRaised;

                const iconColor = isRootSelected
                  ? theme.colors.onAction
                  : isChildSelected
                    ? theme.colors.actionTextOnSubtle
                    : theme.colors.textSecondary;

                return (
                  <Pressable
                    key={node.category.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${node.category.name}${hasChildren ? '，含二级分类' : ''}`}
                    accessibilityState={{ selected: isHighlighted, expanded: isExpanded }}
                    onPress={() => handlePressRoot(node)}
                    style={({ pressed }) => [
                      styles.rootCell,
                      pressed && { opacity: theme.opacity.pressed },
                    ]}
                  >
                    <View style={styles.rootIconAnchor}>
                      <View
                        style={[
                          styles.rootIconCircle,
                          {
                            backgroundColor: badgeBg,
                            borderRadius: theme.radius.full,
                            borderColor: isChildSelected ? theme.colors.action : 'transparent',
                            borderWidth: isChildSelected ? theme.borderWidth.focus : 0,
                          },
                        ]}
                      >
                        <AppIcon name={node.category.icon} size={18} color={iconColor} />
                      </View>

                      {hasChildren ? (
                        <View
                          style={[
                            styles.expandIndicator,
                            {
                              backgroundColor: isHighlighted
                                ? theme.colors.actionSubtle
                                : theme.colors.surfaceRaised,
                              borderColor: theme.colors.surface,
                              borderRadius: theme.radius.full,
                            },
                          ]}
                        >
                          <AppIcon
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={9}
                            color={
                              isHighlighted
                                ? theme.colors.actionTextOnSubtle
                                : theme.colors.textMuted
                            }
                          />
                        </View>
                      ) : null}
                    </View>

                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.85}
                      style={{
                        color: isHighlighted
                          ? theme.colors.actionTextOnSubtle
                          : theme.colors.textSecondary,
                        fontSize: theme.fontSize.xs,
                        fontWeight: isHighlighted
                          ? theme.fontWeight.semibold
                          : theme.fontWeight.regular,
                        marginTop: theme.spacing.xs,
                        textAlign: 'center',
                      }}
                    >
                      {node.category.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {expandedNode ? (
              <SubCategoryDrawer
                node={expandedNode}
                expandedColIndex={expandedColIndex}
                selectedCategoryId={selectedCategoryId}
                onPressChild={handlePressChild}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

interface SubCategoryDrawerProps {
  node: CategoryTreeNode;
  expandedColIndex: number;
  selectedCategoryId: string | null;
  onPressChild: (parent: Category, child: Category) => void;
}

function SubCategoryDrawer({
  node,
  expandedColIndex,
  selectedCategoryId,
  onPressChild,
}: SubCategoryDrawerProps): React.JSX.Element {
  const { theme } = useTheme();
  const childRows = useMemo(() => chunkItems(node.children, GRID_COLUMNS), [node.children]);

  return (
    <View
      style={[
        styles.drawer,
        {
          backgroundColor: theme.colors.surfaceRaised,
          borderColor: theme.colors.border,
          borderWidth: theme.borderWidth.hairline,
          borderRadius: theme.radius.lg,
          marginTop: theme.spacing.xs,
          marginBottom: theme.spacing.xs,
          paddingHorizontal: theme.spacing.xs,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.xs,
        },
      ]}
    >
      {/* 顶部细指示条对齐当前展开的一级列 */}
      <View
        pointerEvents="none"
        style={[
          styles.drawerAnchorBar,
          {
            backgroundColor: theme.colors.action,
            left: `${(expandedColIndex + 0.5) * (100 / GRID_COLUMNS)}%`,
            borderRadius: theme.radius.full,
          },
        ]}
      />

      <View style={{ gap: theme.spacing.xs }}>
        {childRows.map((childRow, childRowIdx) => (
          <View key={childRowIdx} style={styles.gridRow}>
            {childRow.map((child, childColIdx) => {
              if (!child) {
                return <View key={`empty_child_${childColIdx}`} style={styles.childCell} />;
              }

              const selected = selectedCategoryId === child.id;
              return (
                <Pressable
                  key={child.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${node.category.name} ${child.name}`}
                  accessibilityState={{ selected }}
                  onPress={() => onPressChild(node.category, child)}
                  style={({ pressed }) => [
                    styles.childCell,
                    {
                      backgroundColor: selected ? theme.colors.actionSubtle : 'transparent',
                      borderRadius: theme.radius.md,
                    },
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <View
                    style={[
                      styles.childIconCircle,
                      {
                        backgroundColor: selected ? theme.colors.action : theme.colors.surface,
                        borderRadius: theme.radius.full,
                      },
                    ]}
                  >
                    <AppIcon
                      name={child.icon}
                      size={14}
                      color={selected ? theme.colors.onAction : theme.colors.textSecondary}
                    />
                  </View>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                    style={{
                      color: selected
                        ? theme.colors.actionTextOnSubtle
                        : theme.colors.textSecondary,
                      fontSize: 11,
                      fontWeight: selected ? theme.fontWeight.semibold : theme.fontWeight.regular,
                      marginTop: 3,
                      textAlign: 'center',
                    }}
                  >
                    {child.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gridRow: {
    flexDirection: 'row',
    gap: 2,
  },
  rootCell: {
    flex: 1,
    minHeight: 60,
    paddingVertical: 4,
    paddingHorizontal: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  rootIconAnchor: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rootIconCircle: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandIndicator: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 14,
    height: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawer: {
    position: 'relative',
  },
  drawerAnchorBar: {
    position: 'absolute',
    top: 4,
    width: 20,
    height: 3,
    marginLeft: -10,
  },
  childCell: {
    flex: 1,
    minHeight: 52,
    paddingVertical: 4,
    paddingHorizontal: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childIconCircle: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
