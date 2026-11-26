/**
 * 约束简报（Workflow B / C）：
 * - 一级分类行（CategoryRootRow）：
 *   1. 默认右侧仅显示单个「+」按钮（直接添加二级分类）；已停用时沉底变灰，不再展示「+」；
 *   2. 像明细一样支持 iOS 风格平滑左滑带出「编辑 / 停用(启用) / 删除」操作菜单；
 *   3. 长按 260ms 触发一级间拖动排序（由父级先合并所有展开的二级分类），邻行 GPU 弹簧让位不交叉。
 * - 二级分类行（CategoryChildRow）：
 *   1. 无需左滑，行内右侧直接清晰显示「编辑 / 停用(启用) / 删除」按钮；
 *   2. 长按 260ms 触发所属一级子表内拖动排序，绝不与一级分类交叉；停用项沉底变灰。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  GestureDetector,
  useCompetingGestures,
  usePanGesture,
} from 'react-native-gesture-handler';
import {
  hapticLight,
  hapticMedium,
  hapticSelection,
} from '../../../shared/haptics/haptics';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { useTheme } from '../../../theme/theme-context';
import type { Category } from '../types';

export const ROOT_ROW_HEIGHT = 60;
export const CHILD_ROW_HEIGHT = 50;

const SWIPE_BTN_WIDTH = 66;
const SWIPE_MAX_OVERDRAG = 36;

interface SwipeActionDef {
  key: 'edit' | 'toggleArchive' | 'delete';
  label: string;
  icon: string;
  bg: string;
  fg: string;
  onPress: () => void;
}

export interface CategoryRootRowProps {
  category: Category;
  childCount: number;
  expanded: boolean;
  showDivider: boolean;
  /** 同级启用一级分类数量（启用项才允许在 [0, activeSiblingCount - 1] 内拖排） */
  index: number;
  activeSiblingCount: number;
  /** 当前拖拽态信息（若正在拖动同级其他行，本行按需平滑让位） */
  isDraggingThis: boolean;
  shiftOffsetY: number;
  anyDragging: boolean;
  isSwipeOpen: boolean;
  onSwipeOpen: (id: string) => void;
  onSwipeClose: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onAddChild: (parent: Category) => void;
  onEdit: (cat: Category) => void;
  onToggleArchive: (cat: Category) => void;
  onDelete: (cat: Category) => void;
  onDragStart: (id: string, index: number) => void;
  onDragMove: (translationY: number) => void;
  onDragEnd: () => void;
}

export function CategoryRootRow({
  category,
  childCount,
  expanded,
  showDivider,
  index,
  activeSiblingCount,
  isDraggingThis,
  shiftOffsetY,
  anyDragging,
  isSwipeOpen,
  onSwipeOpen,
  onSwipeClose,
  onToggleExpand,
  onAddChild,
  onEdit,
  onToggleArchive,
  onDelete,
  onDragStart,
  onDragMove,
  onDragEnd,
}: CategoryRootRowProps): React.JSX.Element {
  const { theme } = useTheme();
  const isArchived = category.isArchived;
  const canDragSort = !isArchived && activeSiblingCount > 1;

  const actions = useMemo<SwipeActionDef[]>(
    () => [
      {
        key: 'edit',
        label: '编辑',
        icon: 'create-outline',
        bg: theme.colors.actionSubtle,
        fg: theme.colors.actionTextOnSubtle,
        onPress: () => onEdit(category),
      },
      {
        key: 'toggleArchive',
        label: isArchived ? '启用' : '停用',
        icon: isArchived ? 'refresh-outline' : 'pause-circle-outline',
        bg: theme.colors.warningSubtle,
        fg: theme.colors.warningTextOnSubtle,
        onPress: () => onToggleArchive(category),
      },
      {
        key: 'delete',
        label: '删除',
        icon: 'trash-outline',
        bg: theme.colors.expense,
        fg: theme.colors.onAction,
        onPress: () => onDelete(category),
      },
    ],
    [category, isArchived, onDelete, onEdit, onToggleArchive, theme.colors]
  );

  const totalActionsWidth = actions.length * SWIPE_BTN_WIDTH;
  const [swipeX] = useState(() => new Animated.Value(0));
  const [dragY] = useState(() => new Animated.Value(0));
  const [shiftY] = useState(() => new Animated.Value(0));
  const [dragScale] = useState(() => new Animated.Value(1));

  const swipeOffsetRef = useRef(0);
  const didGestureRef = useRef(false);
  const draggingLocalRef = useRef(false);
  const indexRef = useRef(index);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const snapSwipeTo = useCallback(
    (target: number, notify = true, velocityPxPerSec = 0) => {
      swipeOffsetRef.current = target;
      const clampedVel = Math.max(-2.5, Math.min(2.5, velocityPxPerSec / 1000));
      Animated.spring(swipeX, {
        toValue: target,
        useNativeDriver: true,
        stiffness: 280,
        damping: 30,
        mass: 0.9,
        velocity: clampedVel,
      }).start();
      if (!notify) {
        return;
      }
      if (target < 0) {
        onSwipeOpen(category.id);
      } else {
        onSwipeClose(category.id);
      }
    },
    [category.id, onSwipeClose, onSwipeOpen, swipeX]
  );

  useEffect(() => {
    if (!isSwipeOpen && swipeOffsetRef.current !== 0) {
      snapSwipeTo(0, false);
    }
  }, [isSwipeOpen, snapSwipeTo]);

  useEffect(() => {
    if (!isDraggingThis) {
      dragY.setValue(0);
      Animated.spring(dragScale, {
        toValue: 1,
        useNativeDriver: true,
        stiffness: 320,
        damping: 26,
      }).start();
    }
  }, [dragScale, dragY, isDraggingThis]);

  useEffect(() => {
    Animated.spring(shiftY, {
      toValue: shiftOffsetY,
      useNativeDriver: true,
      stiffness: 360,
      damping: 32,
      mass: 0.8,
    }).start();
  }, [shiftOffsetY, shiftY]);

  // 手势 1：横向左滑带出「编辑 / 停用 / 删除」菜单
  const swipePan = usePanGesture({
    enabled: !anyDragging,
    disableReanimated: true,
    runOnJS: true,
    activeOffsetX: isSwipeOpen ? [-10, 10] : [-10, 9999],
    failOffsetY: [-18, 18],
    onActivate: () => {
      didGestureRef.current = true;
    },
    onUpdate: (event) => {
      const raw = swipeOffsetRef.current + event.translationX;
      let next: number;
      if (raw >= 0) {
        next = 0;
      } else if (raw < -totalActionsWidth) {
        const extra = -totalActionsWidth - raw;
        next = -totalActionsWidth - Math.min(SWIPE_MAX_OVERDRAG, extra * 0.28);
      } else {
        next = raw;
      }
      swipeX.setValue(next);
    },
    onDeactivate: (event) => {
      const projected = swipeOffsetRef.current + event.translationX + event.velocityX * 0.14;
      const shouldOpen = projected < -totalActionsWidth * 0.36;
      if (shouldOpen) {
        hapticLight();
      }
      snapSwipeTo(shouldOpen ? -totalActionsWidth : 0, true, event.velocityX);
      setTimeout(() => {
        didGestureRef.current = false;
      }, 60);
    },
  });

  // 手势 2：长按 260ms 激活一级分类拖拽排序（起手先收拢所有二级分类）
  const dragPan = usePanGesture({
    enabled: canDragSort && !isSwipeOpen,
    disableReanimated: true,
    runOnJS: true,
    activateAfterLongPress: 260,
    onActivate: () => {
      didGestureRef.current = true;
      draggingLocalRef.current = true;
      hapticMedium();
      Animated.spring(dragScale, {
        toValue: 1.02,
        useNativeDriver: true,
        stiffness: 320,
        damping: 26,
      }).start();
      onDragStart(category.id, indexRef.current);
    },
    onUpdate: (event) => {
      if (!draggingLocalRef.current) {
        return;
      }
      dragY.setValue(event.translationY);
      onDragMove(event.translationY);
    },
    onDeactivate: () => {
      if (!draggingLocalRef.current) {
        return;
      }
      draggingLocalRef.current = false;
      dragY.setValue(0);
      onDragEnd();
      setTimeout(() => {
        didGestureRef.current = false;
      }, 80);
    },
    onFinalize: () => {
      if (draggingLocalRef.current) {
        draggingLocalRef.current = false;
        dragY.setValue(0);
        onDragEnd();
        setTimeout(() => {
          didGestureRef.current = false;
        }, 80);
      }
    },
  });

  const combinedGesture = useCompetingGestures(dragPan, swipePan);

  const labelOpacity = swipeX.interpolate({
    inputRange: [-totalActionsWidth * 0.55, -totalActionsWidth * 0.12, 0],
    outputRange: [1, 0.55, 0],
    extrapolate: 'clamp',
  });

  const handlePressRow = () => {
    if (didGestureRef.current) {
      return;
    }
    if (isSwipeOpen || swipeOffsetRef.current < -4) {
      snapSwipeTo(0, true);
      return;
    }
    if (childCount > 0) {
      hapticSelection();
      onToggleExpand(category.id);
    }
  };

  return (
    <Animated.View
      style={[
        styles.rootOuter,
        {
          zIndex: isDraggingThis ? 30 : 1,
          elevation: isDraggingThis ? 6 : 0,
          transform: [
            { translateY: isDraggingThis ? dragY : shiftY },
            { scale: dragScale },
          ],
        },
        isDraggingThis && {
          borderRadius: theme.radius.md,
          borderColor: theme.colors.action,
          borderWidth: theme.borderWidth.hairline,
          backgroundColor: theme.colors.surfaceRaised,
        },
      ]}
    >
      <GestureDetector gesture={combinedGesture}>
        <View style={styles.swipeContainer}>
          <Animated.View style={{ transform: [{ translateX: swipeX }] }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${category.name}${isArchived ? '，已停用' : ''}${childCount > 0 ? `，含 ${childCount} 个子分类` : ''}`}
              onPress={handlePressRow}
              style={({ pressed }) => [
                styles.rootRow,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  paddingHorizontal: theme.spacing.md,
                  borderBottomColor: theme.colors.border,
                  borderBottomWidth: showDivider && !isDraggingThis ? theme.borderWidth.hairline : 0,
                },
                pressed && !isSwipeOpen && !isDraggingThis && { opacity: theme.opacity.pressed },
              ]}
            >
              <View style={[styles.rowLeft, isArchived && { opacity: 0.48 }]}>
                <View
                  style={[
                    styles.rootIconWrap,
                    {
                      backgroundColor: isArchived
                        ? theme.colors.surface
                        : `${category.color}1F`,
                      borderRadius: theme.radius.full,
                    },
                  ]}
                >
                  <AppIcon
                    name={category.icon}
                    size={20}
                    color={isArchived ? theme.colors.textMuted : category.color}
                  />
                </View>

                <View style={styles.rootTextWrap}>
                  <View style={styles.rootTitleLine}>
                    <Text
                      numberOfLines={1}
                      style={{
                        flexShrink: 1,
                        color: isArchived ? theme.colors.textMuted : theme.colors.text,
                        fontSize: theme.fontSize.base,
                        fontWeight: theme.fontWeight.semibold,
                      }}
                    >
                      {category.name}
                    </Text>

                    {isArchived ? (
                      <View
                        style={[
                          styles.statusTag,
                          {
                            backgroundColor: theme.colors.surface,
                            borderColor: theme.colors.border,
                            borderWidth: theme.borderWidth.hairline,
                            borderRadius: theme.radius.full,
                          },
                        ]}
                      >
                        <Text style={{ color: theme.colors.textMuted, fontSize: 10 }}>已停用</Text>
                      </View>
                    ) : childCount > 0 ? (
                      <View style={styles.childCountBadge}>
                        <Text
                          style={{
                            color: theme.colors.textMuted,
                            fontSize: theme.fontSize.xs,
                          }}
                        >
                          {childCount}
                        </Text>
                        <AppIcon
                          name={expanded ? 'chevron-up' : 'chevron-down'}
                          size={14}
                          color={theme.colors.textMuted}
                        />
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              {/* 一级分类默认右侧只显示单个「+」按钮（用于直接添加二级分类）；已停用则不显示 */}
              {!isArchived ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`为「${category.name}」添加二级分类`}
                  onPress={() => {
                    if (isSwipeOpen) {
                      snapSwipeTo(0, true);
                      return;
                    }
                    hapticLight();
                    onAddChild(category);
                  }}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.addSubBtn,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                      borderWidth: theme.borderWidth.hairline,
                      borderRadius: theme.radius.full,
                    },
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <AppIcon name="add" size={18} color={theme.colors.action} />
                </Pressable>
              ) : null}
            </Pressable>
          </Animated.View>

          {/* 左滑菜单：编辑 / 停用(或启用) / 删除 */}
          <View
            pointerEvents="box-none"
            style={[
              styles.actionsViewport,
              { width: totalActionsWidth + SWIPE_MAX_OVERDRAG },
            ]}
          >
            {actions.map((action, actIdx) => {
              const travelRatio = (actions.length - actIdx) / actions.length;
              const buttonTranslateX = swipeX.interpolate({
                inputRange: [-totalActionsWidth - SWIPE_MAX_OVERDRAG, -totalActionsWidth, 0],
                outputRange: [
                  -travelRatio * SWIPE_MAX_OVERDRAG,
                  0,
                  travelRatio * totalActionsWidth,
                ],
                extrapolateRight: 'clamp',
              });

              return (
                <Animated.View
                  key={action.key}
                  pointerEvents={isSwipeOpen ? 'auto' : 'none'}
                  style={[
                    styles.actionSlot,
                    {
                      left: SWIPE_MAX_OVERDRAG + actIdx * SWIPE_BTN_WIDTH,
                      zIndex: actIdx + 1,
                      transform: [{ translateX: buttonTranslateX }],
                    },
                  ]}
                >
                  <View
                    pointerEvents="none"
                    style={[
                      styles.actionFillExtend,
                      {
                        backgroundColor: action.bg,
                        width: SWIPE_BTN_WIDTH + SWIPE_MAX_OVERDRAG,
                      },
                    ]}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${action.label} ${category.name}`}
                    onPress={() => {
                      hapticLight();
                      snapSwipeTo(0, true);
                      action.onPress();
                    }}
                    style={({ pressed }) => [
                      styles.actionBtn,
                      pressed && { opacity: theme.opacity.pressed },
                    ]}
                  >
                    <Animated.View style={[styles.actionInner, { opacity: labelOpacity }]}>
                      <AppIcon name={action.icon} size={17} color={action.fg} />
                      <Text
                        style={{
                          color: action.fg,
                          fontSize: 11,
                          fontWeight: theme.fontWeight.semibold,
                          marginTop: 2,
                        }}
                      >
                        {action.label}
                      </Text>
                    </Animated.View>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

export interface CategoryChildRowProps {
  category: Category;
  parentArchived: boolean;
  showDivider: boolean;
  index: number;
  activeSiblingCount: number;
  isDraggingThis: boolean;
  shiftOffsetY: number;
  onEdit: (cat: Category) => void;
  onToggleArchive: (cat: Category) => void;
  onDelete: (cat: Category) => void;
  onDragStart: (parentId: string, childId: string, index: number) => void;
  onDragMove: (translationY: number) => void;
  onDragEnd: () => void;
}

export function CategoryChildRow({
  category,
  parentArchived,
  showDivider,
  index,
  activeSiblingCount,
  isDraggingThis,
  shiftOffsetY,
  onEdit,
  onToggleArchive,
  onDelete,
  onDragStart,
  onDragMove,
  onDragEnd,
}: CategoryChildRowProps): React.JSX.Element {
  const { theme } = useTheme();
  const isArchived = parentArchived || category.isArchived;
  const canDragSort = !isArchived && activeSiblingCount > 1 && Boolean(category.parentId);

  const [dragY] = useState(() => new Animated.Value(0));
  const [shiftY] = useState(() => new Animated.Value(0));
  const [dragScale] = useState(() => new Animated.Value(1));
  const draggingLocalRef = useRef(false);
  const indexRef = useRef(index);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    if (!isDraggingThis) {
      dragY.setValue(0);
      Animated.spring(dragScale, {
        toValue: 1,
        useNativeDriver: true,
        stiffness: 320,
        damping: 26,
      }).start();
    }
  }, [dragScale, dragY, isDraggingThis]);

  useEffect(() => {
    Animated.spring(shiftY, {
      toValue: shiftOffsetY,
      useNativeDriver: true,
      stiffness: 360,
      damping: 32,
      mass: 0.8,
    }).start();
  }, [shiftOffsetY, shiftY]);

  const dragPan = usePanGesture({
    enabled: canDragSort,
    disableReanimated: true,
    runOnJS: true,
    activateAfterLongPress: 260,
    onActivate: () => {
      if (!category.parentId) {
        return;
      }
      draggingLocalRef.current = true;
      hapticMedium();
      Animated.spring(dragScale, {
        toValue: 1.02,
        useNativeDriver: true,
        stiffness: 320,
        damping: 26,
      }).start();
      onDragStart(category.parentId, category.id, indexRef.current);
    },
    onUpdate: (event) => {
      if (!draggingLocalRef.current) {
        return;
      }
      dragY.setValue(event.translationY);
      onDragMove(event.translationY);
    },
    onDeactivate: () => {
      if (!draggingLocalRef.current) {
        return;
      }
      draggingLocalRef.current = false;
      dragY.setValue(0);
      onDragEnd();
    },
    onFinalize: () => {
      if (draggingLocalRef.current) {
        draggingLocalRef.current = false;
        dragY.setValue(0);
        onDragEnd();
      }
    },
  });

  return (
    <GestureDetector gesture={dragPan}>
      <Animated.View
        style={[
          styles.childRow,
          {
            backgroundColor: isDraggingThis
              ? theme.colors.surfaceRaised
              : theme.colors.surfaceSunken,
            paddingLeft: theme.spacing.lg + 10,
            paddingRight: theme.spacing.md,
            borderBottomColor: theme.colors.border,
            borderBottomWidth: showDivider && !isDraggingThis ? theme.borderWidth.hairline : 0,
            zIndex: isDraggingThis ? 30 : 1,
            elevation: isDraggingThis ? 5 : 0,
            transform: [
              { translateY: isDraggingThis ? dragY : shiftY },
              { scale: dragScale },
            ],
          },
          isDraggingThis && {
            borderRadius: theme.radius.sm,
            borderColor: theme.colors.action,
            borderWidth: theme.borderWidth.hairline,
          },
        ]}
      >
        <View style={[styles.rowLeft, isArchived && { opacity: 0.46 }]}>
          <View
            style={[
              styles.childIconWrap,
              {
                backgroundColor: isArchived ? theme.colors.surface : `${category.color}1C`,
                borderRadius: theme.radius.full,
              },
            ]}
          >
            <AppIcon
              name={category.icon}
              size={16}
              color={isArchived ? theme.colors.textMuted : category.color}
            />
          </View>
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              color: isArchived ? theme.colors.textMuted : theme.colors.text,
              fontSize: theme.fontSize.sm,
              fontWeight: theme.fontWeight.regular,
            }}
          >
            {category.name}
          </Text>
          {category.isArchived ? (
            <View
              style={[
                styles.statusTag,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.border,
                  borderWidth: theme.borderWidth.hairline,
                  borderRadius: theme.radius.full,
                },
              ]}
            >
              <Text style={{ color: theme.colors.textMuted, fontSize: 10 }}>已停用</Text>
            </View>
          ) : null}
        </View>

        {/* 二级分类直接展示 编辑 / 停用(启用) / 删除 */}
        <View style={styles.childActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`编辑 ${category.name}`}
            onPress={() => {
              hapticLight();
              onEdit(category);
            }}
            hitSlop={6}
            style={({ pressed }) => [
              styles.childActionBtn,
              pressed && { opacity: theme.opacity.pressed },
            ]}
          >
            <Text style={{ color: theme.colors.action, fontSize: theme.fontSize.xs }}>编辑</Text>
          </Pressable>

          {!parentArchived ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${category.isArchived ? '启用' : '停用'} ${category.name}`}
              onPress={() => {
                hapticLight();
                onToggleArchive(category);
              }}
              hitSlop={6}
              style={({ pressed }) => [
                styles.childActionBtn,
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <Text
                style={{
                  color: category.isArchived
                    ? theme.colors.income
                    : theme.colors.warningTextOnSubtle,
                  fontSize: theme.fontSize.xs,
                }}
              >
                {category.isArchived ? '启用' : '停用'}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`删除 ${category.name}`}
            onPress={() => {
              hapticLight();
              onDelete(category);
            }}
            hitSlop={6}
            style={({ pressed }) => [
              styles.childActionBtn,
              pressed && { opacity: theme.opacity.pressed },
            ]}
          >
            <Text style={{ color: theme.colors.expense, fontSize: theme.fontSize.xs }}>删除</Text>
          </Pressable>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  rootOuter: {
    position: 'relative',
  },
  swipeContainer: {
    position: 'relative',
    overflow: 'hidden',
  },
  rootRow: {
    height: ROOT_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  rowLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rootIconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rootTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  rootTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  childCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  statusTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  addSubBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsViewport: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  actionSlot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: SWIPE_BTN_WIDTH,
  },
  actionFillExtend: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  actionBtn: {
    width: SWIPE_BTN_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  childRow: {
    height: CHILD_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  childIconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  childActionBtn: {
    minHeight: 32,
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
});
