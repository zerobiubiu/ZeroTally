/**
 * 约束简报（Workflow B / C）：
 * - 圆润卡片视觉体系：每个一级分类渲染为独立大圆角卡片（radius.lg + elevation.card），展开的二级分类作为内嵌圆角柔和子面板（radius.md）收纳于卡内，彻底保持与明细/设置/资产页一致的柔和圆滑气质
 * - 一级分类行（CategoryRootRow）：
 *   1. 默认右侧仅显示单个柔和浅玉青圆形「+」按钮（直接添加二级分类）；已停用沉底变灰不显示「+」；
 *   2. 支持 iOS 风格平滑左滑带出「编辑 / 停用(启用) / 删除」操作菜单，按钮圆弧贴合卡片圆角；
 *   3. 长按 260ms 触发一级间卡片拖动排序（父级自动先合并全部展开的二级），整卡浮起并按 ROOT_DRAG_STRIDE 精准让位。
 * - 二级分类行（CategoryChildRow）：
 *   1. 收纳在一级卡片的内嵌圆角浅底面板中，行右侧直接以柔和圆角微胶囊展示「编辑 / 停用(启用) / 删除」；
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

export const ROOT_ROW_HEIGHT = 64;
export const ROOT_CARD_GAP = 10;
export const ROOT_DRAG_STRIDE = ROOT_ROW_HEIGHT + ROOT_CARD_GAP;
export const CHILD_ROW_HEIGHT = 50;

const SWIPE_BTN_WIDTH = 66;
const SWIPE_MAX_OVERDRAG = 32;

interface SwipeActionDef {
  key: 'edit' | 'toggleArchive' | 'delete';
  label: string;
  icon: string;
  bg: string;
  fg: string;
  onPress: () => void;
}

export interface CategoryRootCardProps {
  category: Category;
  childCount: number;
  expanded: boolean;
  /** 同级启用一级分类索引与总数 */
  index: number;
  activeSiblingCount: number;
  /** 当前拖拽态信息 */
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
  /** 展开时嵌入同一张圆角卡片底部的二级分类子面板 */
  children?: React.ReactNode;
}

export function CategoryRootRow({
  category,
  childCount,
  expanded,
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
  children,
}: CategoryRootCardProps): React.JSX.Element {
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

  // 手势 1：横向左滑带出「编辑 / 停用(启用) / 删除」操作栏
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

  // 手势 2：长按 260ms 激活一级分类卡片拖动排序
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

  const hasExpandedChildren = Boolean(expanded && children);

  return (
    <Animated.View
      style={[
        styles.rootCardShell,
        isDraggingThis ? theme.elevation.floating : theme.elevation.card,
        {
          backgroundColor: theme.colors.surfaceRaised,
          borderRadius: theme.radius.lg,
          borderColor: isDraggingThis ? theme.colors.action : theme.colors.border,
          borderWidth: isDraggingThis ? 1.5 : theme.borderWidth.hairline,
          zIndex: isDraggingThis ? 30 : 1,
          transform: [
            { translateY: isDraggingThis ? dragY : shiftY },
            { scale: dragScale },
          ],
        },
      ]}
    >
      {/* 一级分类主行（独立圆角裁切，左滑按钮边缘自然贴合卡片圆弧） */}
      <GestureDetector gesture={combinedGesture}>
        <View
          style={[
            styles.swipeViewport,
            {
              borderTopLeftRadius: theme.radius.lg - 1,
              borderTopRightRadius: theme.radius.lg - 1,
              borderBottomLeftRadius: hasExpandedChildren ? 0 : theme.radius.lg - 1,
              borderBottomRightRadius: hasExpandedChildren ? 0 : theme.radius.lg - 1,
            },
          ]}
        >
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
                },
                pressed && !isSwipeOpen && !isDraggingThis && { opacity: theme.opacity.pressed },
              ]}
            >
              <View style={[styles.rowLeft, isArchived && { opacity: 0.45 }]}>
                <View
                  style={[
                    styles.rootIconWrap,
                    {
                      backgroundColor: isArchived
                        ? theme.colors.surface
                        : `${category.color}1C`,
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
                            borderRadius: theme.radius.full,
                          },
                        ]}
                      >
                        <Text style={{ color: theme.colors.textMuted, fontSize: 10 }}>已停用</Text>
                      </View>
                    ) : childCount > 0 ? (
                      <View
                        style={[
                          styles.childCountPill,
                          {
                            backgroundColor: expanded
                              ? theme.colors.actionSubtle
                              : theme.colors.surface,
                            borderRadius: theme.radius.full,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.tabular,
                            {
                              color: expanded
                                ? theme.colors.actionTextOnSubtle
                                : theme.colors.textMuted,
                              fontSize: 11,
                              fontWeight: theme.fontWeight.semibold,
                            },
                          ]}
                        >
                          {childCount}
                        </Text>
                        <AppIcon
                          name={expanded ? 'chevron-up' : 'chevron-down'}
                          size={12}
                          color={
                            expanded ? theme.colors.actionTextOnSubtle : theme.colors.textMuted
                          }
                        />
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              {/* 一级分类默认右侧仅显示柔和圆形浅玉青「+」（直接添加二级分类）；已停用不显示 */}
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
                      backgroundColor: theme.colors.actionSubtle,
                      borderRadius: theme.radius.full,
                    },
                    pressed && { opacity: theme.opacity.pressed, transform: [{ scale: 0.94 }] },
                  ]}
                >
                  <AppIcon name="add" size={18} color={theme.colors.actionTextOnSubtle} />
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

      {/* 展开的二级分类内嵌圆角子面板（嵌套圆角 radius.md，柔和浅底与一级卡片形成优雅主次层次） */}
      {hasExpandedChildren ? (
        <View
          style={[
            styles.nestedChildrenPanel,
            {
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.md,
              marginHorizontal: theme.spacing.sm,
              marginBottom: theme.spacing.sm,
            },
          ]}
        >
          {children}
        </View>
      ) : null}
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
          styles.childRowWrap,
          isDraggingThis && theme.elevation.card,
          {
            backgroundColor: isDraggingThis ? theme.colors.surfaceRaised : 'transparent',
            borderRadius: isDraggingThis ? theme.radius.md : 0,
            borderColor: isDraggingThis ? theme.colors.action : 'transparent',
            borderWidth: isDraggingThis ? 1 : 0,
            zIndex: isDraggingThis ? 30 : 1,
            transform: [
              { translateY: isDraggingThis ? dragY : shiftY },
              { scale: dragScale },
            ],
          },
        ]}
      >
        <View style={[styles.childRow, { paddingHorizontal: theme.spacing.sm + 4 }]}>
          <View style={[styles.rowLeft, isArchived && { opacity: 0.45 }]}>
            <View
              style={[
                styles.childIconWrap,
                {
                  backgroundColor: isArchived ? theme.colors.surfaceRaised : `${category.color}1A`,
                  borderRadius: theme.radius.full,
                },
              ]}
            >
              <AppIcon
                name={category.icon}
                size={15}
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
                    borderRadius: theme.radius.full,
                  },
                ]}
              >
                <Text style={{ color: theme.colors.textMuted, fontSize: 10 }}>已停用</Text>
              </View>
            ) : null}
          </View>

          {/* 二级分类直接展示柔和圆角微胶囊：编辑 / 停用(启用) / 删除 */}
          <View style={styles.childActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`编辑 ${category.name}`}
              onPress={() => {
                hapticLight();
                onEdit(category);
              }}
              hitSlop={4}
              style={({ pressed }) => [
                styles.childPillBtn,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderRadius: theme.radius.full,
                },
                pressed && { opacity: theme.opacity.pressed, transform: [{ scale: 0.96 }] },
              ]}
            >
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: 11,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                编辑
              </Text>
            </Pressable>

            {!parentArchived ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${category.isArchived ? '启用' : '停用'} ${category.name}`}
                onPress={() => {
                  hapticLight();
                  onToggleArchive(category);
                }}
                hitSlop={4}
                style={({ pressed }) => [
                  styles.childPillBtn,
                  {
                    backgroundColor: category.isArchived
                      ? theme.colors.incomeSubtle
                      : theme.colors.warningSubtle,
                    borderRadius: theme.radius.full,
                  },
                  pressed && { opacity: theme.opacity.pressed, transform: [{ scale: 0.96 }] },
                ]}
              >
                <Text
                  style={{
                    color: category.isArchived
                      ? theme.colors.incomeTextOnSubtle
                      : theme.colors.warningTextOnSubtle,
                    fontSize: 11,
                    fontWeight: theme.fontWeight.semibold,
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
              hitSlop={4}
              style={({ pressed }) => [
                styles.childPillBtn,
                {
                  backgroundColor: theme.colors.expenseSubtle,
                  borderRadius: theme.radius.full,
                },
                pressed && { opacity: theme.opacity.pressed, transform: [{ scale: 0.96 }] },
              ]}
            >
              <Text
                style={{
                  color: theme.colors.expenseTextOnSubtle,
                  fontSize: 11,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                删除
              </Text>
            </Pressable>
          </View>
        </View>

        {/* 柔和左缩进分割线（对齐文字左缘，避免顶通边缘生硬切割） */}
        {showDivider && !isDraggingThis ? (
          <View
            style={[
              styles.childDivider,
              {
                backgroundColor: theme.colors.border,
                height: theme.borderWidth.hairline,
              },
            ]}
          />
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  rootCardShell: {
    position: 'relative',
  },
  swipeViewport: {
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
    width: 40,
    height: 40,
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
    gap: 8,
  },
  childCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  addSubBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsViewport: {
    position: 'absolute',
    top: 0,
    right: 0,
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
    top: 0,
    bottom: 0,
    left: 0,
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
  nestedChildrenPanel: {
    overflow: 'visible',
    paddingVertical: 2,
  },
  childRowWrap: {
    position: 'relative',
  },
  childRow: {
    height: CHILD_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  childIconWrap: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  childPillBtn: {
    height: 26,
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childDivider: {
    marginLeft: 52,
    marginRight: 12,
    opacity: 0.7,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
