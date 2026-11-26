/**
 * 约束简报（Workflow B / C）：
 * - 快捷记账下半屏窗口：与 SettingsDrawer 同级叠加于主 Tab 顶层（非原生 Modal），支持从底栏无停顿 1:1 跟手向上拉起，且内部弹居中模板编辑浮窗零双 Modal 冲突
 * - 双向抓手交互：顶部真实可拖动横条，向下滑动平滑收起，二次向上滑动跨越阈值伴随震动刻度并无缝展开完整「记一笔」页面
 * - 一键极速入账：点击图标卡片无需输入直接写入今日账目并联动余额 + 马达震动 + 3.5 秒内一键撤销；优先展示自定义模板，空自定义时自动回退近 30 天高频推荐
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../../../db/database-context';
import {
  hapticLight,
  hapticMedium,
  hapticSelection,
  hapticSuccess,
  hapticWarning,
} from '../../../shared/haptics/haptics';
import { formatCentsToYuan } from '../../../shared/money/money';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { useTheme } from '../../../theme/theme-context';
import { listAccounts } from '../../accounts/service';
import type { Account } from '../../accounts/types';
import { listCategories } from '../../categories/service';
import type { Category } from '../../categories/types';
import { deleteTransaction } from '../../transactions/service';
import {
  createQuickTemplate,
  deleteQuickTemplate,
  executeQuickRecord,
  listQuickRecordButtons,
  updateQuickTemplate,
} from '../service';
import type { CreateQuickTemplateInput, QuickRecordButtonItem } from '../types';
import {
  QuickTemplateEditorDialog,
  type QuickTemplateEditorInitialValue,
} from './QuickTemplateEditorDialog';

const GRID_COLUMNS = 3;
const MAX_PULL_UP_LIFT = 112;
const EXPAND_HINT_THRESHOLD = 52;

export function computeQuickSheetHeight(windowHeight: number): number {
  return Math.min(
    Math.max(380, Math.round(windowHeight * 0.54)),
    Math.round(windowHeight * 0.64)
  );
}

export interface QuickRecordSheetProps {
  open: boolean;
  onClose: () => void;
  /** 二次向上滑动或点击「完整记账」时，展开完整记一笔页面 */
  onExpandFullRecord: () => void;
  /** 由主布局共享的拉起进度（0 = 藏于底边，1 = 占下半屏就位） */
  pullProgress?: Animated.Value;
  /** 外部底栏是否正在跟手拉起中 */
  pullingOpen?: boolean;
}

interface RecentToastState {
  txId: string;
  label: string;
  amountText: string;
  type: 'expense' | 'income';
}

function chunkGrid<T>(items: readonly T[], columns: number): (T | null)[][] {
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

type GridCell =
  | { kind: 'item'; item: QuickRecordButtonItem }
  | { kind: 'add' };

export function QuickRecordSheet({
  open,
  onClose,
  onExpandFullRecord,
  pullProgress,
  pullingOpen = false,
}: QuickRecordSheetProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { db, revision, notifyChange } = useDatabase();

  const sheetHeight = computeQuickSheetHeight(windowHeight);
  const shouldShow = open || pullingOpen;

  const [mounted, setMounted] = useState(shouldShow);
  if (shouldShow && !mounted) {
    setMounted(true);
  }

  const [internalProgress] = useState(() => new Animated.Value(open ? 1 : 0));
  const progress = pullProgress ?? internalProgress;
  const [expandLiftY] = useState(() => new Animated.Value(0));

  const [mode, setMode] = useState<'custom' | 'recommended'>('recommended');
  const [items, setItems] = useState<QuickRecordButtonItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recentToast, setRecentToast] = useState<RecentToastState | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [readyToExpandFull, setReadyToExpandFull] = useState(false);

  const [editorVisible, setEditorVisible] = useState(false);
  const [editorInitial, setEditorInitial] = useState<QuickTemplateEditorInitialValue | null>(null);

  const openRef = useRef(open);
  const pullingOpenRef = useRef(pullingOpen);
  const sheetHeightRef = useRef(sheetHeight);
  const draggingRef = useRef(false);
  const expandHintFiredRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    openRef.current = open;
    pullingOpenRef.current = pullingOpen;
    sheetHeightRef.current = sheetHeight;
  }, [open, pullingOpen, sheetHeight]);

  // 打开或底层数据刷新时加载快捷按钮、活跃分类与账户
  const reloadData = useCallback(async () => {
    const [buttonData, allCats, allAccs] = await Promise.all([
      listQuickRecordButtons(db),
      listCategories(db),
      listAccounts(db),
    ]);
    setMode(buttonData.mode);
    setItems(buttonData.items);
    setCategories(allCats);
    setAccounts(allAccs);
    setLoading(false);
  }, [db]);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    let active = true;
    void (async () => {
      const [buttonData, allCats, allAccs] = await Promise.all([
        listQuickRecordButtons(db),
        listCategories(db),
        listAccounts(db),
      ]);
      if (!active) {
        return;
      }
      setMode(buttonData.mode);
      setItems(buttonData.items);
      setCategories(allCats);
      setAccounts(allAccs);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [db, mounted, revision]);

  // 控制半屏进场与收起动画
  useEffect(() => {
    if (!mounted || pullingOpen) {
      return;
    }

    if (open) {
      expandLiftY.setValue(0);
      Animated.spring(progress, {
        toValue: 1,
        useNativeDriver: true,
        stiffness: 300,
        damping: 30,
        mass: 0.9,
      }).start();
    } else {
      Animated.parallel([
        Animated.timing(progress, {
          toValue: 0,
          duration: 190,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(expandLiftY, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished && !openRef.current && !pullingOpenRef.current) {
          setMounted(false);
          setReadyToExpandFull(false);
          setActionError(null);
        }
      });
    }
  }, [expandLiftY, mounted, open, progress, pullingOpen]);

  // 自动消退撤销横条
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // 展开且未打开浮窗时拦截 Android 硬件返回键收起半屏
  useEffect(() => {
    if (!open || editorVisible) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      hapticLight();
      onClose();
      return true;
    });
    return () => {
      sub.remove();
    };
  }, [editorVisible, onClose, open]);

  const showQuickToast = useCallback((toast: RecentToastState) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setRecentToast(toast);
    toastTimerRef.current = setTimeout(() => {
      setRecentToast(null);
      toastTimerRef.current = null;
    }, 3500);
  }, []);

  const triggerExpandFull = useCallback(() => {
    hapticLight();
    expandHintFiredRef.current = false;
    setReadyToExpandFull(false);
    expandLiftY.setValue(0);
    onExpandFullRecord();
  }, [expandLiftY, onExpandFullRecord]);

  // 顶部横条与头部区双向手势：向上拉二次展开完整记一笔；向下拉直接收起
  const sheetPanGesture = usePanGesture({
    enabled: open && !editorVisible,
    disableReanimated: true,
    runOnJS: true,
    activeOffsetY: [-10, 10],
    failOffsetX: [-22, 22],
    onActivate: () => {
      draggingRef.current = true;
      expandHintFiredRef.current = false;
    },
    onUpdate: (event) => {
      if (!draggingRef.current) {
        return;
      }
      const h = Math.max(1, sheetHeightRef.current);
      if (event.translationY >= 0) {
        expandLiftY.setValue(0);
        if (expandHintFiredRef.current) {
          expandHintFiredRef.current = false;
          setReadyToExpandFull(false);
        }
        const nextProgress = Math.max(0, 1 - event.translationY / h);
        progress.setValue(nextProgress);
      } else {
        progress.setValue(1);
        const lift = Math.min(MAX_PULL_UP_LIFT, Math.abs(event.translationY) * 0.72);
        expandLiftY.setValue(-lift);
        const reached = lift >= EXPAND_HINT_THRESHOLD;
        if (reached && !expandHintFiredRef.current) {
          expandHintFiredRef.current = true;
          hapticSelection();
          setReadyToExpandFull(true);
        } else if (!reached && expandHintFiredRef.current) {
          expandHintFiredRef.current = false;
          setReadyToExpandFull(false);
        }
      }
    },
    onDeactivate: (event) => {
      if (!draggingRef.current) {
        return;
      }
      draggingRef.current = false;
      const h = Math.max(1, sheetHeightRef.current);

      // 向下滑动收起判定
      if (event.translationY > 0) {
        const projectedDown = event.translationY + event.velocityY * 0.14;
        if (projectedDown > h * 0.24 || (event.velocityY > 650 && event.translationY > 28)) {
          hapticLight();
          onClose();
          return;
        }
        Animated.spring(progress, {
          toValue: 1,
          useNativeDriver: true,
          stiffness: 300,
          damping: 30,
          mass: 0.9,
        }).start();
        return;
      }

      // 二次向上滑动展开完整记一笔判定
      const upDistance = -event.translationY;
      const projectedUp = upDistance - event.velocityY * 0.12;
      if (projectedUp > 76 || (event.velocityY < -650 && upDistance > 24)) {
        triggerExpandFull();
        return;
      }

      expandHintFiredRef.current = false;
      setReadyToExpandFull(false);
      Animated.spring(expandLiftY, {
        toValue: 0,
        useNativeDriver: true,
        stiffness: 320,
        damping: 30,
        mass: 0.9,
      }).start();
    },
    onFinalize: () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        expandHintFiredRef.current = false;
        setReadyToExpandFull(false);
        Animated.parallel([
          Animated.spring(progress, {
            toValue: openRef.current ? 1 : 0,
            useNativeDriver: true,
            stiffness: 300,
            damping: 30,
            mass: 0.9,
          }),
          Animated.spring(expandLiftY, {
            toValue: 0,
            useNativeDriver: true,
            stiffness: 320,
            damping: 30,
            mass: 0.9,
          }),
        ]).start();
      }
    },
  });

  const handleQuickTap = async (item: QuickRecordButtonItem) => {
    if (recordingId) {
      return;
    }
    setRecordingId(item.id);
    setActionError(null);
    try {
      const created = await executeQuickRecord(db, item);
      hapticSuccess();
      notifyChange();
      showQuickToast({
        txId: created.id,
        label: item.name,
        amountText: `${item.type === 'expense' ? '-' : '+'}${formatCentsToYuan(item.amountCents)}`,
        type: item.type,
      });
    } catch (err) {
      hapticWarning();
      setActionError(err instanceof Error ? err.message : '快捷记账失败');
    } finally {
      setRecordingId(null);
    }
  };

  const handleUndoToast = async () => {
    if (!recentToast || undoing) {
      return;
    }
    setUndoing(true);
    try {
      await deleteTransaction(db, recentToast.txId);
      hapticLight();
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      setRecentToast(null);
      notifyChange();
    } catch (err) {
      hapticWarning();
      setActionError(err instanceof Error ? err.message : '撤销失败');
    } finally {
      setUndoing(false);
    }
  };

  const handleOpenAddEditor = () => {
    hapticLight();
    setEditorInitial(null);
    setEditorVisible(true);
  };

  const handleOpenEditEditor = (item: QuickRecordButtonItem) => {
    hapticMedium();
    setEditorInitial({
      id: item.source === 'template' ? item.id : undefined,
      name: item.name,
      type: item.type,
      amountCents: item.amountCents,
      categoryId: item.categoryId,
      accountId: item.accountId,
      note: item.note,
    });
    setEditorVisible(true);
  };

  const handleSaveTemplate = async (input: CreateQuickTemplateInput, editingId?: string) => {
    if (editingId) {
      await updateQuickTemplate(db, editingId, input);
    } else {
      await createQuickTemplate(db, input);
    }
    notifyChange();
    await reloadData();
  };

  const handleDeleteTemplate = async (editingId: string) => {
    await deleteQuickTemplate(db, editingId);
    notifyChange();
    await reloadData();
  };

  const gridRows = useMemo(() => {
    const cells: GridCell[] = items.map((item) => ({ kind: 'item', item }));
    cells.push({ kind: 'add' });
    return chunkGrid(cells, GRID_COLUMNS);
  }, [items]);

  if (!mounted) {
    return null;
  }

  const baseTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetHeight + 24, 0],
    extrapolate: 'clamp',
  });

  const scrimOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.overlayRoot]}
      pointerEvents={open ? 'auto' : 'none'}
    >
      {/* 背景暗色遮罩 */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: theme.colors.scrim, opacity: scrimOpacity },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭快捷记账面板"
          onPress={() => {
            hapticLight();
            onClose();
          }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* 下半屏主容器 */}
      <Animated.View
        style={[
          styles.sheet,
          theme.elevation.floating,
          {
            height: sheetHeight,
            backgroundColor: theme.colors.surfaceRaised,
            borderTopLeftRadius: theme.radius.lg,
            borderTopRightRadius: theme.radius.lg,
            paddingBottom: Math.max(insets.bottom, theme.spacing.md),
            transform: [{ translateY: baseTranslateY }, { translateY: expandLiftY }],
          },
        ]}
      >
        {/* 二次向上滑动拉升垫底，防止屏底露出缝隙 */}
        <View
          pointerEvents="none"
          style={[styles.overdragFiller, { backgroundColor: theme.colors.surfaceRaised }]}
        />

        {/* 顶部可双向拖动横条与标题栏：上滑展开完整记一笔，下滑直接收起 */}
        <GestureDetector gesture={sheetPanGesture}>
          <View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="向上滑动展开完整记一笔，向下滑动收起"
              onPress={triggerExpandFull}
              style={styles.handleZone}
            >
              <View
                style={[
                  styles.handleBar,
                  {
                    backgroundColor: readyToExpandFull
                      ? theme.colors.action
                      : theme.colors.borderStrong,
                    borderRadius: theme.radius.full,
                  },
                ]}
              />
              {readyToExpandFull ? (
                <Text
                  style={{
                    color: theme.colors.action,
                    fontSize: 11,
                    fontWeight: theme.fontWeight.semibold,
                    marginTop: 4,
                  }}
                >
                  松手展开完整记一笔
                </Text>
              ) : null}
            </Pressable>

            <View
              style={[
                styles.headerRow,
                {
                  paddingHorizontal: theme.spacing.lg,
                  paddingBottom: theme.spacing.sm,
                  borderBottomColor: theme.colors.border,
                  borderBottomWidth: theme.borderWidth.hairline,
                },
              ]}
            >
              <View style={styles.headerTitleGroup}>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontSize: theme.fontSize.lg,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  快捷记账
                </Text>
                {items.length > 0 && mode === 'recommended' ? (
                  <View
                    style={[
                      styles.modeBadge,
                      {
                        backgroundColor: theme.colors.actionSubtle,
                        borderRadius: theme.radius.full,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: theme.colors.actionTextOnSubtle,
                        fontSize: 10,
                        fontWeight: theme.fontWeight.semibold,
                      }}
                    >
                      常用推荐
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.headerActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="新增快捷项"
                  onPress={handleOpenAddEditor}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.headerIconBtn,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radius.full,
                    },
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <AppIcon name="add" size={18} color={theme.colors.text} />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="展开完整记一笔"
                  onPress={triggerExpandFull}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.expandBtn,
                    {
                      backgroundColor: theme.colors.actionSubtle,
                      borderRadius: theme.radius.full,
                    },
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <Text
                    style={{
                      color: theme.colors.actionTextOnSubtle,
                      fontSize: theme.fontSize.xs,
                      fontWeight: theme.fontWeight.semibold,
                    }}
                  >
                    完整记账
                  </Text>
                  <AppIcon
                    name="chevron-up"
                    size={14}
                    color={theme.colors.actionTextOnSubtle}
                  />
                </Pressable>
              </View>
            </View>
          </View>
        </GestureDetector>

        {/* 一键入账即时反馈 + 可撤销条 */}
        {recentToast ? (
          <View
            style={[
              styles.toastBanner,
              {
                marginHorizontal: theme.spacing.lg,
                marginTop: theme.spacing.sm,
                backgroundColor: theme.colors.actionSubtle,
                borderRadius: theme.radius.md,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.xs,
              },
            ]}
          >
            <AppIcon name="checkmark-circle" size={16} color={theme.colors.actionTextOnSubtle} />
            <Text
              numberOfLines={1}
              style={[
                styles.tabular,
                {
                  flex: 1,
                  color: theme.colors.actionTextOnSubtle,
                  fontSize: theme.fontSize.xs,
                  fontWeight: theme.fontWeight.semibold,
                  marginLeft: 6,
                },
              ]}
            >
              已记 · {recentToast.label} {recentToast.amountText}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="撤销刚才的一键记账"
              disabled={undoing}
              onPress={() => void handleUndoToast()}
              hitSlop={8}
              style={({ pressed }) => [
                styles.undoBtn,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderRadius: theme.radius.full,
                },
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <Text
                style={{
                  color: theme.colors.action,
                  fontSize: 11,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                {undoing ? '撤销中' : '撤销'}
              </Text>
            </Pressable>
          </View>
        ) : actionError ? (
          <View
            style={[
              styles.toastBanner,
              {
                marginHorizontal: theme.spacing.lg,
                marginTop: theme.spacing.sm,
                backgroundColor: theme.colors.expenseSubtle,
                borderRadius: theme.radius.md,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.xs,
              },
            ]}
          >
            <AppIcon name="alert-circle-outline" size={16} color={theme.colors.expenseTextOnSubtle} />
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                color: theme.colors.expenseTextOnSubtle,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
                marginLeft: 6,
              }}
            >
              {actionError}
            </Text>
          </View>
        ) : null}

        {/* 快捷图标按钮主体网格 */}
        {loading && items.length === 0 ? (
          <View style={styles.emptyWrap}>
            <ActivityIndicator size="small" color={theme.colors.action} />
          </View>
        ) : items.length === 0 ? (
          <GestureDetector gesture={sheetPanGesture}>
            <View style={[styles.emptyWrap, { paddingHorizontal: theme.spacing.xl }]}>
              <View
                style={[
                  styles.emptyIconCircle,
                  {
                    backgroundColor: theme.colors.actionSubtle,
                    borderRadius: theme.radius.full,
                  },
                ]}
              >
                <AppIcon name="flash-outline" size={26} color={theme.colors.action} />
              </View>
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: theme.fontSize.base,
                  fontWeight: theme.fontWeight.semibold,
                  marginTop: theme.spacing.sm,
                }}
              >
                点一下图标，一秒入账
              </Text>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontSize: theme.fontSize.xs,
                  marginTop: 4,
                  textAlign: 'center',
                }}
              >
                把高频消费（如早餐、地铁、咖啡）设成快捷按钮；上拉顶部横条进入完整记一笔
              </Text>
              <View style={[styles.emptyBtnRow, { marginTop: theme.spacing.md }]}>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleOpenAddEditor}
                  style={({ pressed }) => [
                    styles.emptyPrimaryBtn,
                    {
                      backgroundColor: theme.colors.action,
                      borderRadius: theme.radius.md,
                    },
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <AppIcon name="add" size={16} color={theme.colors.onAction} />
                  <Text
                    style={{
                      color: theme.colors.onAction,
                      fontSize: theme.fontSize.sm,
                      fontWeight: theme.fontWeight.semibold,
                      marginLeft: 4,
                    }}
                  >
                    添加快捷项
                  </Text>
                </Pressable>
              </View>
            </View>
          </GestureDetector>
        ) : (
          <ScrollView
            style={styles.gridScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: theme.spacing.lg,
              paddingTop: theme.spacing.md,
              paddingBottom: theme.spacing.md,
              gap: theme.spacing.sm,
            }}
          >
            {gridRows.map((row, rowIdx) => (
              <View key={rowIdx} style={[styles.gridRow, { gap: theme.spacing.sm }]}>
                {row.map((cell, colIdx) => {
                  if (!cell) {
                    return <View key={`spacer_${colIdx}`} style={styles.cellFlex} />;
                  }
                  if (cell.kind === 'add') {
                    return (
                      <Pressable
                        key="add_quick_tile"
                        accessibilityRole="button"
                        accessibilityLabel="添加快捷记账按钮"
                        onPress={handleOpenAddEditor}
                        style={({ pressed }) => [
                          styles.quickTile,
                          styles.addTile,
                          {
                            borderColor: theme.colors.borderStrong,
                            borderRadius: theme.radius.md,
                            backgroundColor: theme.colors.surface,
                          },
                          pressed && { opacity: theme.opacity.pressed, transform: [{ scale: 0.97 }] },
                        ]}
                      >
                        <View
                          style={[
                            styles.tileIconCircle,
                            {
                              backgroundColor: theme.colors.surfaceRaised,
                              borderRadius: theme.radius.full,
                            },
                          ]}
                        >
                          <AppIcon name="add" size={20} color={theme.colors.action} />
                        </View>
                        <Text
                          numberOfLines={1}
                          style={{
                            color: theme.colors.textSecondary,
                            fontSize: theme.fontSize.xs,
                            fontWeight: theme.fontWeight.semibold,
                            marginTop: 6,
                          }}
                        >
                          添加快捷
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={{
                            color: theme.colors.textMuted,
                            fontSize: 10,
                            marginTop: 2,
                          }}
                        >
                          长按卡片可编辑
                        </Text>
                      </Pressable>
                    );
                  }

                  const { item } = cell;
                  const busy = recordingId === item.id;
                  const amountColor =
                    item.type === 'expense' ? theme.colors.expense : theme.colors.income;
                  const signedAmount = `${item.type === 'expense' ? '-' : '+'}${formatCentsToYuan(item.amountCents)}`;

                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityLabel={`快捷记账 ${item.name} ${signedAmount}，账户 ${item.accountName}，长按编辑`}
                      disabled={Boolean(recordingId)}
                      onPress={() => void handleQuickTap(item)}
                      onLongPress={() => handleOpenEditEditor(item)}
                      delayLongPress={320}
                      style={({ pressed }) => [
                        styles.quickTile,
                        {
                          backgroundColor: theme.colors.surface,
                          borderColor: theme.colors.border,
                          borderWidth: theme.borderWidth.hairline,
                          borderRadius: theme.radius.md,
                          opacity: busy ? theme.opacity.disabled : 1,
                        },
                        pressed && { transform: [{ scale: 0.96 }], opacity: 0.85 },
                      ]}
                    >
                      <View
                        style={[
                          styles.tileIconCircle,
                          {
                            backgroundColor: `${item.categoryColor}20`,
                            borderRadius: theme.radius.full,
                          },
                        ]}
                      >
                        {busy ? (
                          <ActivityIndicator size="small" color={item.categoryColor} />
                        ) : (
                          <AppIcon name={item.categoryIcon} size={20} color={item.categoryColor} />
                        )}
                      </View>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: theme.colors.text,
                          fontSize: theme.fontSize.xs,
                          fontWeight: theme.fontWeight.semibold,
                          marginTop: 6,
                        }}
                      >
                        {item.name}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.tabular,
                          {
                            color: amountColor,
                            fontSize: theme.fontSize.xs,
                            fontWeight: theme.fontWeight.semibold,
                            marginTop: 2,
                          },
                        ]}
                      >
                        {signedAmount}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: theme.colors.textMuted,
                          fontSize: 10,
                          marginTop: 1,
                        }}
                      >
                        {item.accountName}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        )}
      </Animated.View>

      {/* 居中新增/编辑快捷项浮窗 */}
      <QuickTemplateEditorDialog
        visible={editorVisible}
        initialValue={editorInitial}
        categories={categories}
        accounts={accounts}
        onClose={() => setEditorVisible(false)}
        onSave={handleSaveTemplate}
        onDelete={handleDeleteTemplate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    zIndex: 95,
    elevation: 14,
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    overflow: 'visible',
  },
  overdragFiller: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -140,
    height: 144,
  },
  handleZone: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 8,
    minHeight: 28,
  },
  handleBar: {
    width: 40,
    height: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 30,
    height: 30,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 30,
    paddingHorizontal: 10,
  },
  toastBanner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  undoBtn: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginLeft: 8,
  },
  gridScroll: {
    flex: 1,
  },
  gridRow: {
    flexDirection: 'row',
  },
  cellFlex: {
    flex: 1,
  },
  quickTile: {
    flex: 1,
    minHeight: 102,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  tileIconCircle: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emptyPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    paddingHorizontal: 18,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
