/**
 * 约束简报（Workflow B / C）：
 * - 快捷记账非全屏浮窗：与 SettingsDrawer 同级叠加于主 Tab 顶层（零独立 Modal），支持从底栏无停顿 1:1 跟手向上拉起
 * - 网格态（约 52% 屏高）：
 *   1. 全区任意位置均支持向下滑关、向上滑跨越阈值无缝二次展开完整「记一笔」；
 *   2. 快捷选项 3×2（每页 6 格）横向左右分页滑动，配底部圆点分页指示；
 *   3. 单个快捷卡片短按轻震动一秒入账并原地变身 3 秒圆环倒计时撤销卡（再点长震动撤回），长按触发震动后上下滑动智能步进调金额、左右滑动切账户（最上层半透明悬浮 QuickScrubOverlay 实时回显，面板零跳动），长按不动松手切入编辑态。
 * - 新增/编辑态（约 80% 屏高，上方保留暗罩透出底页绝不全屏铺满）：直接内嵌 QuickTemplateComposer 复用完整记一笔的二级分类选择器与计算键盘，原备注位改为「快捷卡片名称」且隐藏日期。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
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
  hapticLongAlert,
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
import type { QuickScrubAxis } from '../scrub-rules';
import {
  createQuickTemplate,
  deleteQuickTemplate,
  executeQuickRecord,
  listQuickRecordButtons,
  updateQuickTemplate,
} from '../service';
import type { CreateQuickTemplateInput, QuickRecordButtonItem } from '../types';
import {
  QUICK_UNDO_DURATION_MS,
  QuickRecordTile,
  type ActiveQuickScrubState,
  type QuickCardUndoState,
} from './QuickRecordTile';
import { QuickScrubOverlay } from './QuickScrubOverlay';
import {
  QuickTemplateComposer,
  type QuickTemplateComposerInitialValue,
} from './QuickTemplateComposer';

const GRID_COLUMNS = 3;
const GRID_ROWS_PER_PAGE = 2;
const ITEMS_PER_PAGE = GRID_COLUMNS * GRID_ROWS_PER_PAGE;
const MAX_PULL_UP_LIFT = 112;
const EXPAND_HINT_THRESHOLD = 52;
const EDGE_RESISTANCE = 0.22;

export function computeQuickSheetHeight(windowHeight: number): number {
  return Math.min(
    Math.max(396, Math.round(windowHeight * 0.52)),
    Math.round(windowHeight * 0.62)
  );
}

function computeComposerSheetHeight(windowHeight: number): number {
  return Math.min(
    Math.max(540, Math.round(windowHeight * 0.8)),
    Math.round(windowHeight * 0.84)
  );
}

export interface QuickRecordSheetProps {
  open: boolean;
  onClose: () => void;
  /** 上滑跨越阈值或轻点顶部拖动条时，展开完整记一笔页面 */
  onExpandFullRecord: () => void;
  /** 由主布局共享的拉起进度（0 = 藏于底边，1 = 占下半屏就位） */
  pullProgress?: Animated.Value;
  /** 外部底栏是否正在跟手拉起中 */
  pullingOpen?: boolean;
}

interface QuickBannerToast {
  text: string;
}

type GridCell =
  | { kind: 'item'; item: QuickRecordButtonItem }
  | { kind: 'add' };

function paginateGridCells(cells: readonly GridCell[]): (GridCell | null)[][][] {
  const pages: (GridCell | null)[][][] = [];
  for (let p = 0; p < cells.length; p += ITEMS_PER_PAGE) {
    const slice = cells.slice(p, p + ITEMS_PER_PAGE);
    const rows: (GridCell | null)[][] = [];
    for (let r = 0; r < GRID_ROWS_PER_PAGE; r += 1) {
      const row: (GridCell | null)[] = [];
      for (let c = 0; c < GRID_COLUMNS; c += 1) {
        row.push(slice[r * GRID_COLUMNS + c] ?? null);
      }
      rows.push(row);
    }
    pages.push(rows);
  }
  return pages;
}

export function QuickRecordSheet({
  open,
  onClose,
  onExpandFullRecord,
  pullProgress,
  pullingOpen = false,
}: QuickRecordSheetProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { db, revision, notifyChange } = useDatabase();

  const gridSheetHeight = computeQuickSheetHeight(windowHeight);
  const composerSheetHeight = computeComposerSheetHeight(windowHeight);
  const shouldShow = open || pullingOpen;

  const [mounted, setMounted] = useState(shouldShow);
  if (shouldShow && !mounted) {
    setMounted(true);
  }

  const [internalProgress] = useState(() => new Animated.Value(open ? 1 : 0));
  const progress = pullProgress ?? internalProgress;
  const [expandLiftY] = useState(() => new Animated.Value(0));
  const [pagerTranslateX] = useState(() => new Animated.Value(0));

  const [mode, setMode] = useState<'custom' | 'recommended'>('recommended');
  const [items, setItems] = useState<QuickRecordButtonItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [undoCards, setUndoCards] = useState<Record<string, QuickCardUndoState>>({});
  const [bannerToast, setBannerToast] = useState<QuickBannerToast | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [readyToExpandFull, setReadyToExpandFull] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);

  /** 单卡长按上下/左右微调实时态 */
  const [activeScrub, setActiveScrub] = useState<ActiveQuickScrubState | null>(null);

  /** 内嵌新增/编辑视图态（非独立 Modal，直接在同一非全屏浮层内平滑舒展） */
  const [composing, setComposing] = useState(false);
  const [composerInitial, setComposerInitial] =
    useState<QuickTemplateComposerInitialValue | null>(null);
  const [composerSessionKey, setComposerSessionKey] = useState(0);

  const activeSheetHeight = composing ? composerSheetHeight : gridSheetHeight;

  const pages = useMemo(() => {
    if (items.length === 0) {
      return [];
    }
    const cells: GridCell[] = items.map((item) => ({ kind: 'item', item }));
    cells.push({ kind: 'add' });
    return paginateGridCells(cells);
  }, [items]);

  const pageCount = Math.max(1, pages.length);
  const clampedPageIndex = Math.min(pageIndex, pageCount - 1);
  const activeAccounts = useMemo(() => accounts.filter((a) => !a.isArchived), [accounts]);

  const openRef = useRef(open);
  const pullingOpenRef = useRef(pullingOpen);
  const sheetHeightRef = useRef(activeSheetHeight);
  const windowWidthRef = useRef(windowWidth);
  const pageIndexRef = useRef(clampedPageIndex);
  const pageCountRef = useRef(pageCount);
  const composingRef = useRef(composing);
  const draggingVerticalRef = useRef(false);
  const draggingHorizontalRef = useRef(false);
  const expandHintFiredRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingReloadAfterUndoRef = useRef(false);

  useEffect(() => {
    openRef.current = open;
    pullingOpenRef.current = pullingOpen;
    sheetHeightRef.current = activeSheetHeight;
    windowWidthRef.current = windowWidth;
    pageIndexRef.current = clampedPageIndex;
    pageCountRef.current = pageCount;
    composingRef.current = composing;
  }, [activeSheetHeight, clampedPageIndex, composing, open, pageCount, pullingOpen, windowWidth]);

  useEffect(() => {
    if (draggingHorizontalRef.current) {
      return;
    }
    pagerTranslateX.setValue(-clampedPageIndex * windowWidth);
  }, [clampedPageIndex, pagerTranslateX, windowWidth]);

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
    // 3 秒原地撤销倒计时期间暂缓重排推荐卡片顺序，避免目标撤销卡从用户指尖跳走
    if (Object.keys(undoTimersRef.current).length > 0) {
      pendingReloadAfterUndoRef.current = true;
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
      pendingReloadAfterUndoRef.current = false;
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

  const clearAllUndoTimers = useCallback(() => {
    for (const timer of Object.values(undoTimersRef.current)) {
      clearTimeout(timer);
    }
    undoTimersRef.current = {};
  }, []);

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
      Keyboard.dismiss();
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
          clearAllUndoTimers();
          setUndoCards({});
          setMounted(false);
          setReadyToExpandFull(false);
          setActionError(null);
          setActiveScrub(null);
          setComposing(false);
          setPageIndex(0);
        }
      });
    }
  }, [clearAllUndoTimers, expandLiftY, mounted, open, progress, pullingOpen]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      clearAllUndoTimers();
    };
  }, [clearAllUndoTimers]);

  // Android 硬件返回键：编辑态先退回网格态，网格态则关闭半屏窗
  useEffect(() => {
    if (!open) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      hapticLight();
      if (composingRef.current) {
        Keyboard.dismiss();
        setComposing(false);
      } else {
        onClose();
      }
      return true;
    });
    return () => {
      sub.remove();
    };
  }, [onClose, open]);

  const showToast = useCallback((toast: QuickBannerToast) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setBannerToast(toast);
    toastTimerRef.current = setTimeout(() => {
      setBannerToast(null);
      toastTimerRef.current = null;
    }, 3500);
  }, []);

  const triggerExpandFull = useCallback(() => {
    Keyboard.dismiss();
    hapticLight();
    expandHintFiredRef.current = false;
    setReadyToExpandFull(false);
    setComposing(false);
    expandLiftY.setValue(0);
    onExpandFullRecord();
  }, [expandLiftY, onExpandFullRecord]);

  const springToPage = useCallback(
    (targetPage: number, velocityPxPerSec = 0) => {
      const clamped = Math.max(0, Math.min(pageCountRef.current - 1, targetPage));
      const changed = clamped !== pageIndexRef.current;
      pageIndexRef.current = clamped;
      setPageIndex(clamped);
      if (changed) {
        hapticSelection();
      }
      const clampedVel = Math.max(-3, Math.min(3, velocityPxPerSec / 1000));
      Animated.spring(pagerTranslateX, {
        toValue: -clamped * windowWidthRef.current,
        useNativeDriver: true,
        stiffness: 300,
        damping: 30,
        mass: 0.85,
        velocity: clampedVel,
      }).start();
    },
    [pagerTranslateX]
  );

  // 网格态全区竖向手势：面板任意位置向下滑关，向上滑二次展开完整记一笔
  const gridVerticalPanGesture = usePanGesture({
    enabled: open && !composing && activeScrub === null,
    disableReanimated: true,
    runOnJS: true,
    activeOffsetY: [-10, 10],
    failOffsetX: [-14, 14],
    onActivate: () => {
      draggingVerticalRef.current = true;
      expandHintFiredRef.current = false;
    },
    onUpdate: (event) => {
      if (!draggingVerticalRef.current) {
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
      if (!draggingVerticalRef.current) {
        return;
      }
      draggingVerticalRef.current = false;
      const h = Math.max(1, sheetHeightRef.current);

      if (event.translationY > 0) {
        const projectedDown = event.translationY + event.velocityY * 0.14;
        if (projectedDown > h * 0.22 || (event.velocityY > 620 && event.translationY > 24)) {
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

      const upDistance = -event.translationY;
      const projectedUp = upDistance - event.velocityY * 0.12;
      if (projectedUp > 74 || (event.velocityY < -620 && upDistance > 22)) {
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
      if (draggingVerticalRef.current) {
        draggingVerticalRef.current = false;
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

  // 编辑态顶部抓手下滑退回/收起手势（不干扰内部二级分类 ScrollView 滚动）
  const composerHandlePanGesture = usePanGesture({
    enabled: open && composing,
    disableReanimated: true,
    runOnJS: true,
    activeOffsetY: 10,
    failOffsetX: [-20, 20],
    onActivate: () => {
      Keyboard.dismiss();
      draggingVerticalRef.current = true;
    },
    onUpdate: (event) => {
      if (!draggingVerticalRef.current) {
        return;
      }
      const h = Math.max(1, sheetHeightRef.current);
      const nextProgress = Math.max(0, 1 - Math.max(0, event.translationY) / h);
      progress.setValue(nextProgress);
    },
    onDeactivate: (event) => {
      if (!draggingVerticalRef.current) {
        return;
      }
      draggingVerticalRef.current = false;
      const h = Math.max(1, sheetHeightRef.current);
      const projectedDown = event.translationY + event.velocityY * 0.14;
      if (projectedDown > h * 0.22 || (event.velocityY > 620 && event.translationY > 28)) {
        hapticLight();
        onClose();
      } else {
        Animated.spring(progress, {
          toValue: 1,
          useNativeDriver: true,
          stiffness: 300,
          damping: 30,
          mass: 0.9,
        }).start();
      }
    },
    onFinalize: () => {
      if (draggingVerticalRef.current) {
        draggingVerticalRef.current = false;
        Animated.spring(progress, {
          toValue: openRef.current ? 1 : 0,
          useNativeDriver: true,
          stiffness: 300,
          damping: 30,
          mass: 0.9,
        }).start();
      }
    },
  });

  // 快捷选项横向分页手势：与整窗竖向手势正交隔离，单卡微调时暂停
  const horizontalPagerGesture = usePanGesture({
    enabled: open && !composing && activeScrub === null && pages.length > 1,
    disableReanimated: true,
    runOnJS: true,
    activeOffsetX: [-10, 10],
    failOffsetY: [-14, 14],
    onActivate: () => {
      draggingHorizontalRef.current = true;
    },
    onUpdate: (event) => {
      if (!draggingHorizontalRef.current) {
        return;
      }
      const w = Math.max(1, windowWidthRef.current);
      const base = -pageIndexRef.current * w;
      const minX = -(pageCountRef.current - 1) * w;
      const raw = base + event.translationX;
      let next: number;
      if (raw > 0) {
        next = raw * EDGE_RESISTANCE;
      } else if (raw < minX) {
        next = minX + (raw - minX) * EDGE_RESISTANCE;
      } else {
        next = raw;
      }
      pagerTranslateX.setValue(next);
    },
    onDeactivate: (event) => {
      if (!draggingHorizontalRef.current) {
        return;
      }
      draggingHorizontalRef.current = false;
      const w = Math.max(1, windowWidthRef.current);
      const current = pageIndexRef.current;
      const maxIdx = Math.max(0, pageCountRef.current - 1);
      const projected = event.translationX + event.velocityX * 0.14;

      let target = current;
      if (projected < -w * 0.22 && current < maxIdx) {
        target = current + 1;
      } else if (projected > w * 0.22 && current > 0) {
        target = current - 1;
      }
      springToPage(target, event.velocityX);
    },
    onFinalize: () => {
      if (draggingHorizontalRef.current) {
        draggingHorizontalRef.current = false;
        springToPage(pageIndexRef.current);
      }
    },
  });

  const handleQuickTap = useCallback(
    async (item: QuickRecordButtonItem) => {
      if (recordingId) {
        return;
      }
      setRecordingId(item.id);
      setActionError(null);
      try {
        const created = await executeQuickRecord(db, item);
        // 先登记撤销计时器再通知刷新，确保 3 秒撤销窗口内不会重排推荐卡片位置
        if (undoTimersRef.current[item.id]) {
          clearTimeout(undoTimersRef.current[item.id]);
        }
        undoTimersRef.current[item.id] = setTimeout(() => {
          delete undoTimersRef.current[item.id];
          setUndoCards((prev) => {
            if (!(item.id in prev)) {
              return prev;
            }
            const next = { ...prev };
            delete next[item.id];
            return next;
          });
          if (
            pendingReloadAfterUndoRef.current &&
            Object.keys(undoTimersRef.current).length === 0
          ) {
            pendingReloadAfterUndoRef.current = false;
            void reloadData();
          }
        }, QUICK_UNDO_DURATION_MS);

        // 输入轻震动，原卡片原地变身为 3 秒圆环倒计时撤销卡片
        hapticLight();
        setUndoCards((prev) => ({
          ...prev,
          [item.id]: {
            txId: created.id,
            startedAt: Date.now(),
            amountCents: item.amountCents,
            type: item.type,
          },
        }));
        notifyChange();
      } catch (err) {
        hapticWarning();
        setActionError(err instanceof Error ? err.message : '快捷记账失败');
      } finally {
        setRecordingId(null);
      }
    },
    [db, notifyChange, recordingId, reloadData]
  );

  const handleUndoCardTap = useCallback(
    async (item: QuickRecordButtonItem, txId: string) => {
      if (recordingId) {
        return;
      }
      if (undoTimersRef.current[item.id]) {
        clearTimeout(undoTimersRef.current[item.id]);
        delete undoTimersRef.current[item.id];
      }
      setRecordingId(item.id);
      setActionError(null);
      try {
        await deleteTransaction(db, txId);
        // 撤回长震动提醒，与轻震动输入形成清晰体感区分
        hapticLongAlert();
        setUndoCards((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
        notifyChange();
      } catch (err) {
        hapticWarning();
        setActionError(err instanceof Error ? err.message : '撤销失败');
      } finally {
        setRecordingId(null);
      }
    },
    [db, notifyChange, recordingId]
  );

  const handleOpenAddComposer = useCallback(() => {
    hapticLight();
    setActiveScrub(null);
    setComposerInitial(null);
    setComposerSessionKey((k) => k + 1);
    setComposing(true);
  }, []);

  const handleOpenEditComposer = useCallback((item: QuickRecordButtonItem) => {
    setActiveScrub(null);
    setComposerInitial({
      id: item.source === 'template' ? item.id : undefined,
      name: item.name,
      type: item.type,
      amountCents: item.amountCents,
      categoryId: item.categoryId,
      accountId: item.accountId,
    });
    setComposerSessionKey((k) => k + 1);
    setComposing(true);
  }, []);

  // 单卡长按滑动结束：若金额或账户有变更则直接持久化保存（推荐项自动保存为自定义快捷卡）
  const handleScrubEnd = useCallback(
    async (
      item: QuickRecordButtonItem,
      result: { axis: QuickScrubAxis; amountCents: number; accountId: string }
    ) => {
      setActiveScrub(null);
      if (result.axis === 'none') {
        return;
      }
      const changed =
        result.amountCents !== item.amountCents || result.accountId !== item.accountId;
      if (!changed) {
        return;
      }

      setActionError(null);
      try {
        const nextPayload: CreateQuickTemplateInput = {
          name: item.name,
          type: item.type,
          amountCents: result.amountCents,
          categoryId: item.categoryId,
          accountId: result.accountId,
          note: '',
        };
        if (item.source === 'template') {
          await updateQuickTemplate(db, item.id, nextPayload);
        } else {
          await createQuickTemplate(db, nextPayload);
        }
        hapticSuccess();
        notifyChange();
        await reloadData();
        const accName =
          activeAccounts.find((a) => a.id === result.accountId)?.name ?? item.accountName;
        const sign = item.type === 'expense' ? '-' : '+';
        showToast({
          text:
            result.axis === 'amount'
              ? `已调金额 · ${item.name} ${sign}${formatCentsToYuan(result.amountCents)}`
              : `已切账户 · ${item.name} · ${accName}`,
        });
      } catch (err) {
        hapticWarning();
        setActionError(err instanceof Error ? err.message : '保存微调失败');
      }
    },
    [activeAccounts, db, notifyChange, reloadData, showToast]
  );

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

  if (!mounted) {
    return null;
  }

  const baseTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [activeSheetHeight + 24, 0],
    extrapolate: 'clamp',
  });

  const scrimOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const sheetCard = (
    <Animated.View
      style={[
        styles.sheet,
        theme.elevation.floating,
        {
          height: activeSheetHeight,
          backgroundColor: theme.colors.surfaceRaised,
          borderTopLeftRadius: theme.radius.lg,
          borderTopRightRadius: theme.radius.lg,
          paddingBottom: Math.max(insets.bottom, theme.spacing.sm),
          transform: [{ translateY: baseTranslateY }, { translateY: expandLiftY }],
        },
      ]}
    >
      {/* 二次向上滑动拉升垫底，防止屏底露出缝隙 */}
      <View
        pointerEvents="none"
        style={[styles.overdragFiller, { backgroundColor: theme.colors.surfaceRaised }]}
      />

      {composing ? (
        /* ========== 内嵌非全屏新增/编辑态：复用完整记一笔 UI ========== */
        <View style={styles.flex}>
          <GestureDetector gesture={composerHandlePanGesture}>
            <View style={styles.handleZone}>
              <View
                style={[
                  styles.handleBar,
                  {
                    backgroundColor: theme.colors.borderStrong,
                    borderRadius: theme.radius.full,
                  },
                ]}
              />
            </View>
          </GestureDetector>

          <QuickTemplateComposer
            key={composerSessionKey}
            initialValue={composerInitial}
            categories={categories}
            accounts={accounts}
            onBack={() => setComposing(false)}
            onSave={handleSaveTemplate}
            onDelete={handleDeleteTemplate}
          />
        </View>
      ) : (
        /* ========== 网格态：全区上下滑收起/展开 + 3×2 横向分页 + 单卡长按调金额/切账户 ========== */
        <View style={styles.flex}>
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
                onPress={handleOpenAddComposer}
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
            </View>
          </View>

          {/* 快捷图标按钮横向左右分页网格（每页 3×2 = 6 格） */}
          {loading && items.length === 0 ? (
            <View style={styles.emptyWrap}>
              <ActivityIndicator size="small" color={theme.colors.action} />
            </View>
          ) : items.length === 0 ? (
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
                把高频消费设成快捷卡片；长按可上下调金额、左右切账户
              </Text>
              <View style={[styles.emptyBtnRow, { marginTop: theme.spacing.md }]}>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleOpenAddComposer}
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
          ) : (
            <View style={styles.pagerSection}>
              <GestureDetector gesture={horizontalPagerGesture}>
                <View style={styles.pagerViewport}>
                  <Animated.View
                    style={[
                      styles.pagerTrack,
                      {
                        width: windowWidth * pages.length,
                        transform: [{ translateX: pagerTranslateX }],
                      },
                    ]}
                  >
                    {pages.map((pageRows, pIdx) => (
                      <View
                        key={`page_${pIdx}`}
                        style={[
                          styles.pageFrame,
                          {
                            width: windowWidth,
                            paddingHorizontal: theme.spacing.lg,
                            paddingTop: theme.spacing.md,
                            gap: theme.spacing.sm,
                          },
                        ]}
                      >
                        {pageRows.map((row, rowIdx) => (
                          <View
                            key={`p${pIdx}_r${rowIdx}`}
                            style={[styles.gridRow, { gap: theme.spacing.sm }]}
                          >
                            {row.map((cell, colIdx) => {
                              if (!cell) {
                                return <View key={`spacer_${colIdx}`} style={styles.cellFlex} />;
                              }
                              if (cell.kind === 'add') {
                                return (
                                  <Pressable
                                    key="add_quick_tile"
                                    accessibilityRole="button"
                                    accessibilityLabel="添加快捷记账卡片"
                                    onPress={handleOpenAddComposer}
                                    style={({ pressed }) => [
                                      styles.quickTile,
                                      styles.addTile,
                                      {
                                        borderColor: theme.colors.borderStrong,
                                        borderRadius: theme.radius.lg,
                                        backgroundColor: theme.colors.surface,
                                      },
                                      pressed && {
                                        opacity: theme.opacity.pressed,
                                        transform: [{ scale: 0.97 }],
                                      },
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
                                      长按可微调
                                    </Text>
                                  </Pressable>
                                );
                              }

                              const { item } = cell;
                              return (
                                <QuickRecordTile
                                  key={item.id}
                                  item={item}
                                  accounts={activeAccounts}
                                  busy={recordingId === item.id}
                                  disabled={Boolean(recordingId)}
                                  undoState={undoCards[item.id] ?? null}
                                  scrubPreview={activeScrub}
                                  onQuickTap={(tapped) => void handleQuickTap(tapped)}
                                  onUndoTap={(tapped, txId) => void handleUndoCardTap(tapped, txId)}
                                  onOpenEdit={handleOpenEditComposer}
                                  onScrubStart={setActiveScrub}
                                  onScrubChange={setActiveScrub}
                                  onScrubEnd={(target, res) => void handleScrubEnd(target, res)}
                                />
                              );
                            })}
                          </View>
                        ))}
                      </View>
                    ))}
                  </Animated.View>
                </View>
              </GestureDetector>

              {/* 底部极简分页指示圆点 */}
              {pages.length > 1 ? (
                <View style={styles.dotsRow}>
                  {pages.map((_, idx) => {
                    const active = idx === clampedPageIndex;
                    return (
                      <Pressable
                        key={`dot_${idx}`}
                        accessibilityRole="button"
                        accessibilityLabel={`第 ${idx + 1} 页快捷选项`}
                        hitSlop={8}
                        onPress={() => springToPage(idx)}
                        style={[
                          styles.dot,
                          {
                            width: active ? 18 : 6,
                            backgroundColor: active
                              ? theme.colors.action
                              : theme.colors.borderStrong,
                            borderRadius: theme.radius.full,
                          },
                        ]}
                      />
                    );
                  })}
                </View>
              ) : null}
            </View>
          )}
        </View>
      )}
    </Animated.View>
  );

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
            Keyboard.dismiss();
            hapticLight();
            onClose();
          }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {composing ? (
        <KeyboardAvoidingView style={styles.composerAvoidWrap} behavior="padding">
          {sheetCard}
        </KeyboardAvoidingView>
      ) : (
        <GestureDetector gesture={gridVerticalPanGesture}>{sheetCard}</GestureDetector>
      )}

      {/* 最上层半透明悬浮交互 HUD：长按上下调金额 / 左右切账户时独立浮于最顶层，零面板跳动 */}
      <QuickScrubOverlay
        scrub={composing ? null : activeScrub}
        accounts={activeAccounts}
        anchorBottom={gridSheetHeight + 24}
      />

      {/* 顶层悬浮轻提示胶囊（微调保存或错误反馈，独立于面板流式布局不挤压卡片） */}
      {!composing && !activeScrub && (bannerToast || actionError) ? (
        <View
          pointerEvents="none"
          style={[styles.floatingToastWrap, { bottom: gridSheetHeight + 20 }]}
        >
          <View
            style={[
              styles.floatingToastPill,
              theme.elevation.floating,
              {
                backgroundColor: actionError
                  ? theme.colors.expense
                  : theme.mode === 'dark'
                    ? 'rgba(20, 32, 29, 0.90)'
                    : 'rgba(18, 28, 25, 0.86)',
                borderRadius: theme.radius.full,
              },
            ]}
          >
            <AppIcon
              name={actionError ? 'alert-circle' : 'checkmark-circle'}
              size={15}
              color={theme.colors.onAction}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.tabular,
                {
                  color: theme.colors.onAction,
                  fontSize: theme.fontSize.xs,
                  fontWeight: theme.fontWeight.semibold,
                  marginLeft: 6,
                },
              ]}
            >
              {actionError ?? bannerToast?.text}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  overlayRoot: {
    zIndex: 95,
    elevation: 14,
    justifyContent: 'flex-end',
  },
  composerAvoidWrap: {
    width: '100%',
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
  floatingToastWrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignItems: 'center',
    zIndex: 118,
    elevation: 26,
  },
  floatingToastPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: 320,
  },
  pagerSection: {
    flex: 1,
    justifyContent: 'space-between',
  },
  pagerViewport: {
    flex: 1,
    overflow: 'hidden',
  },
  pagerTrack: {
    flex: 1,
    flexDirection: 'row',
  },
  pageFrame: {
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
    minHeight: 100,
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
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 8,
    paddingBottom: 6,
  },
  dot: {
    height: 6,
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
