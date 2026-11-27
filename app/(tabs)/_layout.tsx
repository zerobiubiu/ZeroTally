/**
 * 约束简报（Workflow B / C）：
 * - 全局双壳层框架：顶部固定共享应用栏（AB 混合极简模式：彻底取消汉堡圆圈，标题左缘与下方大卡齐平，明细/资产双页点击标题均可展开左侧设置抽屉；右侧操作随滑动进度平滑交叉淡变）+ 底部固定半高双栏与居中凸起「+」记一笔主按钮
 * - 连贯多向手势：[设置抽屉] ⇄ [明细页] ⇄ [资产页]（横向跟手）；底栏向上滑动零停顿拉出下半屏「快捷记账半屏窗」（二次向上滑无缝进入完整记一笔，下滑收起）；点击居中「+」直接自下向上滑入完整记一笔
 * - 路由完整性保障：补齐 Expo Router SDK 58 TabRouter 占位描述符/状态合并与 preload，确保首屏底栏对称完整且双页即刻可滑切
 */
import {
  createBaseTabProps,
  createStandardRouterNavigator,
  TabRouter,
  useRouter,
  type IntegrateWithRouterOptions,
  type NavigatorContentProps,
  type TabNavigationState,
} from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../../src/db/database-context';
import { MainDrawerContext, useMainDrawer } from '../../src/features/navigation/drawer-context';
import {
  appendMissingPlaceholderDescriptors,
  isPlaceholderTabDescriptor,
  normalizeOrderedTabState,
} from '../../src/features/navigation/tab-routes';
import { QuickRadialOverlay } from '../../src/features/quick-record/components/QuickRadialOverlay';
import {
  computeQuickSheetHeight,
  QuickRecordSheet,
} from '../../src/features/quick-record/components/QuickRecordSheet';
import {
  hitTestRadialOption,
  MAX_RADIAL_QUICK_ITEMS,
} from '../../src/features/quick-record/radial-menu-rules';
import {
  executeQuickRecord,
  listQuickRecordButtons,
} from '../../src/features/quick-record/service';
import type { QuickRecordButtonItem } from '../../src/features/quick-record/types';
import {
  computeSettingsDrawerWidth,
  SettingsDrawer,
} from '../../src/features/settings/components/SettingsDrawer';
import type { LedgerPeriodMode } from '../../src/features/transactions/types';
import {
  hapticLight,
  hapticMedium,
  hapticSelection,
  hapticWarning,
} from '../../src/shared/haptics/haptics';
import { formatCentsToYuan } from '../../src/shared/money/money';
import { AppIcon } from '../../src/shared/ui/AppIcon';
import { SafeScreen } from '../../src/shared/ui/SafeScreen';
import { SlidingSegmentedControl } from '../../src/shared/ui/SlidingSegmentedControl';
import { useTheme } from '../../src/theme/theme-context';

const BAR_BODY_HEIGHT = 54;
const FAB_INNER_SIZE = 54;
const FAB_RING_WIDTH = 4;
const FAB_OUTER_SIZE = FAB_INNER_SIZE + FAB_RING_WIDTH * 2;
const FAB_LABEL_BLOCK_HEIGHT = 18;
const FAB_PROTRUSION = FAB_OUTER_SIZE + FAB_LABEL_BLOCK_HEIGHT - BAR_BODY_HEIGHT;
const EDGE_RESISTANCE = 0.2;

const PERIOD_MODE_OPTIONS: readonly { value: LedgerPeriodMode; label: string }[] = [
  { value: 'month', label: '按月' },
  { value: 'year', label: '按年' },
  { value: 'all', label: '全部' },
];

const TAB_ITEMS: Record<string, { label: string; icon: string; activeIcon: string }> = {
  index: {
    label: '明细',
    icon: 'receipt-outline',
    activeIcon: 'receipt',
  },
  assets: {
    label: '资产',
    icon: 'wallet-outline',
    activeIcon: 'wallet',
  },
};

interface DrawerGestureBridgeValue {
  drawerProgress: Animated.Value;
  startDrawerPull: () => void;
  endDrawerPull: () => void;
  isQuickSheetOpen: boolean;
  quickProgress: Animated.Value;
  startQuickPull: () => void;
  endQuickPull: () => void;
  openQuickSheet: () => void;
  isRadialOpen: boolean;
  radialItemsCount: number;
  startRadialMenu: () => void;
  updateRadialSelection: (dx: number, dy: number) => void;
  finishRadialMenu: (commit: boolean) => void;
}

const DrawerGestureBridgeContext = createContext<DrawerGestureBridgeValue | null>(null);

type SwipeTabOptions = {
  title?: string;
};

type SwipeTabEventMap = {
  tabPress: { data: undefined; canPreventDefault: true };
};

type SwipeTabsCreateProps = ReturnType<typeof createBaseTabProps>;

type SwipeTabsContentProps = NavigatorContentProps<
  SwipeTabOptions,
  SwipeTabEventMap,
  object,
  SwipeTabsCreateProps
>;

type BaseTabState = TabNavigationState<Record<string, object | undefined>>;

type SwipeTabRouterOptions = IntegrateWithRouterOptions<
  BaseTabState,
  SwipeTabsCreateProps,
  SwipeTabOptions,
  SwipeTabEventMap
>;

type ProcessTabDescriptors = NonNullable<SwipeTabRouterOptions['processDescriptors']>;
type ProcessTabState = NonNullable<SwipeTabRouterOptions['processState']>;

/** 为尚未挂载的懒加载 Tab 补齐占位描述符（对齐 Expo Router TabsClient 实现） */
const appendMissingTabDescriptors: ProcessTabDescriptors = (descriptors, state, describe) =>
  appendMissingPlaceholderDescriptors(descriptors, state, describe);

/** 按 routeNames 固定顺序补齐全部 Tab 路由，保证「明细(0) / 资产(1)」始终完整且顺序稳定 */
const normalizeTabRoutesState: ProcessTabState = (state, descriptors) =>
  normalizeOrderedTabState(state, descriptors);

function SwipeTabsContent({
  state,
  descriptors,
  actions,
  emitter,
  preload,
}: SwipeTabsContentProps): React.JSX.Element {
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { isDrawerOpen, openDrawer, ledgerPeriodMode, setLedgerPeriodMode } = useMainDrawer();
  const drawerBridge = useContext(DrawerGestureBridgeContext);
  const isQuickSheetOpen = drawerBridge?.isQuickSheetOpen ?? false;
  const isRadialOpen = drawerBridge?.isRadialOpen ?? false;

  const activeIndex = state.index;
  const pageCount = state.routes.length;
  const maxIndex = Math.max(0, pageCount - 1);
  const drawerWidth = computeSettingsDrawerWidth(windowWidth);
  const quickSheetHeight = computeQuickSheetHeight(windowHeight);

  const [translateX] = useState(() => new Animated.Value(-activeIndex * windowWidth));
  const activeIndexRef = useRef(activeIndex);
  const animatedTargetIndexRef = useRef(activeIndex);
  const windowWidthRef = useRef(windowWidth);
  const drawerWidthRef = useRef(drawerWidth);
  const quickSheetHeightRef = useRef(quickSheetHeight);
  const maxIndexRef = useRef(maxIndex);
  const routesRef = useRef(state.routes);
  const isDraggingRef = useRef(false);
  const isPullingDrawerRef = useRef(false);
  const isPullingQuickRef = useRef(false);
  const isRadialDraggingRef = useRef(false);
  const suppressFabTapRef = useRef(false);

  // 首帧主动预挂载未激活的 Tab（如「资产」），并加短延迟兜底防 Expo Router 首帧 ROUTE_NAMES_CHANGED 竞态丢失
  useEffect(() => {
    const pendingNames = state.routes
      .filter((route) => {
        const descriptor = descriptors[route.key];
        return descriptor && isPlaceholderTabDescriptor(descriptor);
      })
      .map((route) => route.name);

    if (pendingNames.length === 0) {
      return;
    }

    const triggerPreload = () => {
      for (const name of pendingNames) {
        preload(name);
      }
    };

    triggerPreload();
    const retryFast = setTimeout(triggerPreload, 80);
    const retrySlow = setTimeout(triggerPreload, 260);
    return () => {
      clearTimeout(retryFast);
      clearTimeout(retrySlow);
    };
  }, [descriptors, preload, state.routes]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
    maxIndexRef.current = maxIndex;
    routesRef.current = state.routes;
    drawerWidthRef.current = drawerWidth;
    quickSheetHeightRef.current = quickSheetHeight;
  }, [activeIndex, drawerWidth, maxIndex, quickSheetHeight, state.routes]);

  const springToIndex = useCallback(
    (targetIndex: number, velocityPxPerSec = 0) => {
      animatedTargetIndexRef.current = targetIndex;
      const clampedVelocity = Math.max(-3, Math.min(3, velocityPxPerSec / 1000));
      Animated.spring(translateX, {
        toValue: -targetIndex * windowWidthRef.current,
        useNativeDriver: true,
        stiffness: 260,
        damping: 28,
        mass: 0.9,
        velocity: clampedVelocity,
      }).start();
    },
    [translateX]
  );

  // 响应底栏点击、路由切换及窗口宽度变化
  useEffect(() => {
    if (windowWidthRef.current !== windowWidth) {
      windowWidthRef.current = windowWidth;
      animatedTargetIndexRef.current = activeIndex;
      translateX.setValue(-activeIndex * windowWidth);
      return;
    }
    if (animatedTargetIndexRef.current !== activeIndex) {
      springToIndex(activeIndex);
    }
  }, [activeIndex, springToIndex, translateX, windowWidth]);

  const navigateToIndex = useCallback(
    (targetIndex: number, velocityPxPerSec = 0) => {
      const targetRoute = routesRef.current[targetIndex];
      if (!targetRoute) {
        return;
      }
      springToIndex(targetIndex, velocityPxPerSec);
      if (targetIndex !== activeIndexRef.current) {
        actions.navigate(targetRoute.name);
      }
    },
    [actions, springToIndex]
  );

  // 横向 14px 即跟手响应，纵向容差 22px 兼容拇指自然弧线横滑；
  // 明细页（activeIndex === 0）向右滑 1:1 跟手拉出左侧设置抽屉；向左滑切至资产页；
  // 账目行子级左滑阈值为 10px（更早激活并由 RNGH Orchestrator 自动取消父级翻页），互不干扰
  const pagerPanGesture = usePanGesture({
    enabled: !isDrawerOpen && !isQuickSheetOpen && !isRadialOpen,
    disableReanimated: true,
    runOnJS: true,
    activeOffsetX: [-14, 14],
    failOffsetY: [-22, 22],
    onActivate: () => {
      isDraggingRef.current = true;
      isPullingDrawerRef.current = false;
    },
    onUpdate: (event) => {
      const width = windowWidthRef.current;
      const base = -activeIndexRef.current * width;
      const minX = -maxIndexRef.current * width;
      const raw = base + event.translationX;

      // 明细页向右滑：顺势 1:1 跟手拉出左侧设置抽屉
      if (activeIndexRef.current === 0 && raw > 0 && drawerBridge) {
        if (!isPullingDrawerRef.current) {
          isPullingDrawerRef.current = true;
          drawerBridge.startDrawerPull();
        }
        translateX.setValue(0);
        const progress = Math.min(1, raw / Math.max(1, drawerWidthRef.current));
        drawerBridge.drawerProgress.setValue(progress);
        return;
      }

      if (isPullingDrawerRef.current && drawerBridge) {
        drawerBridge.drawerProgress.setValue(0);
      }

      let next: number;
      if (raw > 0) {
        next = raw * EDGE_RESISTANCE;
      } else if (raw < minX) {
        next = minX + (raw - minX) * EDGE_RESISTANCE;
      } else {
        next = raw;
      }
      translateX.setValue(next);
    },
    onDeactivate: (event) => {
      isDraggingRef.current = false;

      if (isPullingDrawerRef.current && drawerBridge) {
        isPullingDrawerRef.current = false;
        const dWidth = Math.max(1, drawerWidthRef.current);
        const projected = event.translationX + event.velocityX * 0.14;
        const shouldOpen =
          event.translationX > 0 &&
          (projected > dWidth * 0.24 || (event.velocityX > 650 && event.translationX > 24));

        if (shouldOpen) {
          hapticLight();
          openDrawer();
        }
        drawerBridge.endDrawerPull();
        if (event.translationX >= 0) {
          springToIndex(0);
          return;
        }
      }

      const width = windowWidthRef.current;
      const current = activeIndexRef.current;
      const maxIdx = maxIndexRef.current;
      const projectedDelta = event.translationX + event.velocityX * 0.16;

      let target = current;
      if (projectedDelta < -width * 0.22 && current < maxIdx) {
        target = current + 1;
      } else if (projectedDelta > width * 0.22 && current > 0) {
        target = current - 1;
      }
      navigateToIndex(target, event.velocityX);
    },
    onFinalize: () => {
      if (isPullingDrawerRef.current && drawerBridge) {
        isPullingDrawerRef.current = false;
        drawerBridge.endDrawerPull();
      }
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        springToIndex(activeIndexRef.current);
      }
    },
  });

  const bottomInset = Math.max(insets.bottom, theme.spacing.xs);
  const barTotalHeight = BAR_BODY_HEIGHT + bottomInset;
  const containerHeight = barTotalHeight + FAB_PROTRUSION;

  // 0 = 明细页，1 = 资产页（纯 GPU 插值驱动共享顶栏标题与右侧操作平滑过渡）
  const safeWidth = Math.max(1, windowWidth);
  const scrollProgress = translateX.interpolate({
    inputRange: [-safeWidth, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const ledgerOpacity = scrollProgress.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [1, 0, 0],
    extrapolate: 'clamp',
  });
  const ledgerTranslateX = scrollProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
    extrapolate: 'clamp',
  });

  const assetsOpacity = scrollProgress.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  });
  const assetsTranslateX = scrollProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
    extrapolate: 'clamp',
  });

  // 底栏无停顿上滑手势：在底栏任意区域向上划 8px 即 1:1 跟手拉出下半屏「快捷记账半屏窗」
  const bottomBarPullUpGesture = usePanGesture({
    enabled: !isDrawerOpen && !isQuickSheetOpen && !isRadialOpen && Boolean(drawerBridge),
    disableReanimated: true,
    runOnJS: true,
    activeOffsetY: [-8, 9999],
    failOffsetX: [-18, 18],
    onActivate: () => {
      if (!drawerBridge) {
        return;
      }
      isPullingQuickRef.current = true;
      drawerBridge.quickProgress.setValue(0);
      drawerBridge.startQuickPull();
    },
    onUpdate: (event) => {
      if (!isPullingQuickRef.current || !drawerBridge) {
        return;
      }
      const h = Math.max(1, quickSheetHeightRef.current);
      const upDistance = Math.max(0, -event.translationY);
      const nextProgress = Math.min(1, upDistance / h);
      drawerBridge.quickProgress.setValue(nextProgress);
    },
    onDeactivate: (event) => {
      if (!isPullingQuickRef.current || !drawerBridge) {
        return;
      }
      isPullingQuickRef.current = false;
      const h = Math.max(1, quickSheetHeightRef.current);
      const upDistance = -event.translationY;
      const projectedUp = upDistance - event.velocityY * 0.14;
      const shouldOpen =
        upDistance > 0 &&
        (projectedUp > h * 0.16 || (event.velocityY < -420 && upDistance > 14));

      if (shouldOpen) {
        hapticLight();
        drawerBridge.openQuickSheet();
      }
      drawerBridge.endQuickPull();
    },
    onFinalize: () => {
      if (isPullingQuickRef.current && drawerBridge) {
        isPullingQuickRef.current = false;
        drawerBridge.endQuickPull();
      }
    },
  });

  // 长按居中「+ 记一笔」300ms 绽放扇形快捷选项，手指顺势滑向对应项松手即刻记账（无撤回）
  // 注意：minDistance 必须设为超大值（禁止设为 0），防止 RNGH 在长按未满时被微抖提前激活从而拦截单击进入记一笔
  const fabRadialPanGesture = usePanGesture({
    enabled: !isDrawerOpen && !isQuickSheetOpen && Boolean(drawerBridge),
    disableReanimated: true,
    runOnJS: true,
    activateAfterLongPress: 300,
    minDistance: 99999,
    onActivate: () => {
      if (!drawerBridge) {
        return;
      }
      isRadialDraggingRef.current = true;
      suppressFabTapRef.current = true;
      hapticMedium();
      drawerBridge.startRadialMenu();
    },
    onUpdate: (event) => {
      if (!isRadialDraggingRef.current || !drawerBridge) {
        return;
      }
      drawerBridge.updateRadialSelection(event.translationX, event.translationY);
    },
    onDeactivate: () => {
      if (!isRadialDraggingRef.current || !drawerBridge) {
        return;
      }
      isRadialDraggingRef.current = false;
      drawerBridge.finishRadialMenu(true);
      setTimeout(() => {
        suppressFabTapRef.current = false;
      }, 80);
    },
    onFinalize: () => {
      if (isRadialDraggingRef.current && drawerBridge) {
        isRadialDraggingRef.current = false;
        drawerBridge.finishRadialMenu(false);
        setTimeout(() => {
          suppressFabTapRef.current = false;
        }, 80);
      }
    },
  });

  const handlePressHeaderTitle = () => {
    hapticLight();
    openDrawer();
  };

  const renderTabButton = (routeName: 'index' | 'assets'): React.JSX.Element => {
    const routeIndex = state.routes.findIndex((r) => r.name === routeName);
    const route = routeIndex >= 0 ? state.routes[routeIndex] : undefined;
    const isFocused = routeIndex >= 0 && state.index === routeIndex;
    const meta = TAB_ITEMS[routeName] ?? {
      label: routeName,
      icon: 'ellipse-outline',
      activeIcon: 'ellipse',
    };
    const color = isFocused ? theme.colors.action : theme.colors.textMuted;

    const onPress = () => {
      if (!route || routeIndex < 0) {
        actions.navigate(routeName);
        return;
      }
      const event = emitter.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!isFocused && !event.defaultPrevented) {
        hapticSelection();
        navigateToIndex(routeIndex);
      }
    };

    return (
      <Pressable
        key={route?.key ?? routeName}
        accessibilityRole="tab"
        accessibilityLabel={meta.label}
        accessibilityState={{ selected: isFocused }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.tabItem,
          { height: BAR_BODY_HEIGHT },
          pressed && { opacity: theme.opacity.pressed },
        ]}
      >
        <AppIcon name={isFocused ? meta.activeIcon : meta.icon} size={20} color={color} />
        <Text
          style={{
            color,
            fontSize: theme.fontSize.xs,
            fontWeight: isFocused ? theme.fontWeight.semibold : theme.fontWeight.regular,
            marginTop: 2,
          }}
        >
          {meta.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <GestureDetector gesture={pagerPanGesture}>
      <SafeScreen edges={['top', 'left', 'right']}>
        <View style={[styles.viewport, { backgroundColor: theme.colors.surface }]}>
          {/* 全局固定共享顶栏：彻底移除汉堡图标，标题左缘与下方大卡齐平，两页点击标题皆可打开设置抽屉 */}
          <View
            style={[
              styles.sharedTopBar,
              {
                paddingHorizontal: theme.spacing.lg,
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                activeIndex === 0 ? 'ZeroTally，点击打开设置菜单' : '资产，点击打开设置菜单'
              }
              accessibilityHint="点击或自左向右滑动打开侧边设置抽屉"
              onPress={handlePressHeaderTitle}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 16 }}
              style={({ pressed }) => [
                styles.titleTrigger,
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              {/* 隐形撑高占位确保标题层垂直居中稳定 */}
              <Text
                aria-hidden
                style={[
                  styles.titleGhost,
                  {
                    fontSize: theme.fontSize.xxl,
                    fontWeight: theme.fontWeight.semibold,
                  },
                ]}
              >
                ZeroTally
              </Text>

              <Animated.Text
                numberOfLines={1}
                style={[
                  styles.titleLayer,
                  {
                    color: theme.colors.text,
                    fontSize: theme.fontSize.xxl,
                    fontWeight: theme.fontWeight.semibold,
                    letterSpacing: -0.4,
                    opacity: ledgerOpacity,
                    transform: [{ translateX: ledgerTranslateX }],
                  },
                ]}
              >
                ZeroTally
              </Animated.Text>

              <Animated.Text
                numberOfLines={1}
                style={[
                  styles.titleLayer,
                  {
                    color: theme.colors.text,
                    fontSize: theme.fontSize.xxl,
                    fontWeight: theme.fontWeight.semibold,
                    opacity: assetsOpacity,
                    transform: [{ translateX: assetsTranslateX }],
                  },
                ]}
              >
                资产
              </Animated.Text>
            </Pressable>

            <View style={styles.rightActionsSlot}>
              {/* 明细页右侧：轻量搜索入口 + 按月 / 按年 / 全部滑动三段切换 */}
              <Animated.View
                pointerEvents={activeIndex === 0 ? 'auto' : 'none'}
                style={[
                  styles.rightActionLayer,
                  styles.ledgerRightRow,
                  {
                    opacity: ledgerOpacity,
                    transform: [{ translateX: ledgerTranslateX }],
                  },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="搜索账单"
                  hitSlop={6}
                  onPress={() => {
                    hapticLight();
                    router.push('/search');
                  }}
                  style={({ pressed }) => [
                    styles.headerSearchBtn,
                    {
                      backgroundColor: theme.colors.surfaceRaised,
                      borderRadius: theme.radius.full,
                    },
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <AppIcon name="search-outline" size={18} color={theme.colors.text} />
                </Pressable>
                <SlidingSegmentedControl
                  options={PERIOD_MODE_OPTIONS}
                  value={ledgerPeriodMode}
                  onChange={setLedgerPeriodMode}
                  height={38}
                  minSegmentWidth={46}
                  textSize="xs"
                />
              </Animated.View>

              {/* 资产页右侧：+ 新增账户按钮 */}
              <Animated.View
                pointerEvents={activeIndex === 1 ? 'auto' : 'none'}
                style={[
                  styles.rightActionLayer,
                  {
                    opacity: assetsOpacity,
                    transform: [{ translateX: assetsTranslateX }],
                  },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="新增账户"
                  onPress={() => {
                    hapticLight();
                    router.push('/account-form');
                  }}
                  hitSlop={4}
                  style={({ pressed }) => [
                    styles.addAccountBtn,
                    {
                      backgroundColor: theme.colors.surfaceRaised,
                      borderColor: theme.colors.borderStrong,
                      borderWidth: theme.borderWidth.hairline,
                      borderRadius: theme.radius.full,
                      paddingHorizontal: theme.spacing.md,
                    },
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <AppIcon name="add" size={18} color={theme.colors.action} />
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontSize: theme.fontSize.sm,
                      fontWeight: theme.fontWeight.semibold,
                      marginLeft: theme.spacing.xs,
                    }}
                  >
                    新增
                  </Text>
                </Pressable>
              </Animated.View>
            </View>
          </View>

          {/* 双页横向滑动内容轨道：明细（左）+ 资产（右） */}
          <Animated.View
            style={[
              styles.track,
              {
                width: windowWidth * Math.max(1, pageCount),
                transform: [{ translateX }],
              },
            ]}
          >
            {state.routes.map((route) => {
              const descriptor = descriptors[route.key];
              const isMountedRoute = Boolean(descriptor && !isPlaceholderTabDescriptor(descriptor));
              return (
                <View key={route.name} style={[styles.page, { width: windowWidth }]}>
                  {isMountedRoute ? descriptor?.render() : null}
                </View>
              );
            })}
          </Animated.View>

          {/* 半高底栏 + 居中凸起「+ 记一笔」主按钮（整条底栏支持无停顿向上滑动呼出快捷记账半屏窗） */}
          <GestureDetector gesture={bottomBarPullUpGesture}>
            <View pointerEvents="box-none" style={[styles.outerContainer, { height: containerHeight }]}>
              <View
                style={[
                  styles.barBackdrop,
                  {
                    height: barTotalHeight,
                    backgroundColor: theme.colors.surfaceRaised,
                    borderTopColor: theme.colors.border,
                    borderTopWidth: theme.borderWidth.hairline,
                  },
                ]}
              />

              <View
                pointerEvents="box-none"
                style={[
                  styles.itemsRow,
                  {
                    paddingLeft: insets.left,
                    paddingRight: insets.right,
                    paddingBottom: bottomInset,
                    height: containerHeight,
                  },
                ]}
              >
                {renderTabButton('index')}

                <View pointerEvents="box-none" style={styles.centerSlot}>
                  <GestureDetector gesture={fabRadialPanGesture}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="记一笔"
                      accessibilityHint="点击进入完整记一笔，向上滑动呼出快捷记账，长按滑动扇形极速入账"
                      onPress={() => {
                        if (suppressFabTapRef.current || isRadialDraggingRef.current) {
                          return;
                        }
                        hapticLight();
                        router.push('/record');
                      }}
                      style={({ pressed }) => [
                        styles.fabOuterRing,
                        {
                          width: FAB_OUTER_SIZE,
                          height: FAB_OUTER_SIZE,
                          borderRadius: theme.radius.full,
                          backgroundColor: theme.colors.surface,
                        },
                        pressed && { transform: [{ scale: 0.96 }] },
                      ]}
                    >
                      <View
                        style={[
                          styles.fabInner,
                          theme.elevation.floating,
                          {
                            width: FAB_INNER_SIZE,
                            height: FAB_INNER_SIZE,
                            borderRadius: theme.radius.full,
                            backgroundColor: theme.colors.action,
                          },
                        ]}
                      >
                        <AppIcon name="add" size={30} color={theme.colors.onAction} />
                      </View>
                    </Pressable>
                  </GestureDetector>
                  <Text
                    style={{
                      color: theme.colors.action,
                      fontSize: theme.fontSize.xs,
                      lineHeight: 14,
                      fontWeight: theme.fontWeight.semibold,
                      marginTop: 2,
                      marginBottom: 2,
                    }}
                  >
                    记一笔
                  </Text>
                </View>

                {renderTabButton('assets')}
              </View>
            </View>
          </GestureDetector>
        </View>
      </SafeScreen>
    </GestureDetector>
  );
}

const SwipeTabs = createStandardRouterNavigator(SwipeTabsContent, TabRouter, {
  activityDefaultThreshold: 2,
  processDescriptors: appendMissingTabDescriptors,
  processState: normalizeTabRoutesState,
  createProps: createBaseTabProps,
});

export default function TabsLayout(): React.JSX.Element {
  const router = useRouter();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { db, revision, notifyChange } = useDatabase();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isPullingDrawer, setIsPullingDrawer] = useState(false);
  const [isQuickSheetOpen, setIsQuickSheetOpen] = useState(false);
  const [isPullingQuickSheet, setIsPullingQuickSheet] = useState(false);
  const [ledgerPeriodMode, setLedgerPeriodMode] = useState<LedgerPeriodMode>('month');
  const [drawerProgress] = useState(() => new Animated.Value(0));
  const [quickProgress] = useState(() => new Animated.Value(0));

  // 长按居中「+」扇形快捷选项状态（预热缓存最新前 5 项，长按零延迟瞬开）
  const [isRadialOpen, setIsRadialOpen] = useState(false);
  const [radialItems, setRadialItems] = useState<QuickRecordButtonItem[]>([]);
  const [radialActiveIndex, setRadialActiveIndex] = useState<number | null>(null);
  const [radialDoneNotice, setRadialDoneNotice] = useState<string | null>(null);

  const radialItemsRef = useRef<QuickRecordButtonItem[]>([]);
  const radialActiveIndexRef = useRef<number | null>(null);
  const radialToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const res = await listQuickRecordButtons(db);
      if (!active) {
        return;
      }
      const sliced = res.items.slice(0, MAX_RADIAL_QUICK_ITEMS);
      radialItemsRef.current = sliced;
      setRadialItems(sliced);
    })();
    return () => {
      active = false;
    };
  }, [db, revision]);

  useEffect(() => {
    return () => {
      if (radialToastTimerRef.current) {
        clearTimeout(radialToastTimerRef.current);
      }
    };
  }, []);

  const showRadialDoneToast = useCallback((text: string) => {
    if (radialToastTimerRef.current) {
      clearTimeout(radialToastTimerRef.current);
    }
    setRadialDoneNotice(text);
    radialToastTimerRef.current = setTimeout(() => {
      setRadialDoneNotice(null);
      radialToastTimerRef.current = null;
    }, 1500);
  }, []);

  const startRadialMenu = useCallback(() => {
    radialActiveIndexRef.current = null;
    setRadialActiveIndex(null);
    setIsRadialOpen(true);
  }, []);

  const updateRadialSelection = useCallback((dx: number, dy: number) => {
    const nextIdx = hitTestRadialOption(dx, dy, radialItemsRef.current.length);
    if (nextIdx !== radialActiveIndexRef.current) {
      radialActiveIndexRef.current = nextIdx;
      setRadialActiveIndex(nextIdx);
      if (nextIdx !== null) {
        hapticSelection();
      }
    }
  }, []);

  const finishRadialMenu = useCallback(
    (commit: boolean) => {
      const pickedIdx = radialActiveIndexRef.current;
      radialActiveIndexRef.current = null;
      setRadialActiveIndex(null);
      setIsRadialOpen(false);

      if (!commit || pickedIdx === null) {
        return;
      }
      const picked = radialItemsRef.current[pickedIdx];
      if (!picked) {
        return;
      }
      void (async () => {
        try {
          await executeQuickRecord(db, picked);
          hapticLight();
          notifyChange();
          const sign = picked.type === 'expense' ? '-' : '+';
          showRadialDoneToast(
            `已记 · ${picked.name} ${sign}${formatCentsToYuan(picked.amountCents)}`
          );
        } catch {
          hapticWarning();
        }
      })();
    },
    [db, notifyChange, showRadialDoneToast]
  );

  const openDrawer = useCallback(() => {
    setIsQuickSheetOpen(false);
    setIsDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  const startDrawerPull = useCallback(() => {
    setIsPullingDrawer(true);
  }, []);

  const endDrawerPull = useCallback(() => {
    setIsPullingDrawer(false);
  }, []);

  const openQuickSheet = useCallback(() => {
    setIsDrawerOpen(false);
    setIsQuickSheetOpen(true);
  }, []);

  const closeQuickSheet = useCallback(() => {
    setIsQuickSheetOpen(false);
  }, []);

  const startQuickPull = useCallback(() => {
    setIsPullingQuickSheet(true);
  }, []);

  const endQuickPull = useCallback(() => {
    setIsPullingQuickSheet(false);
  }, []);

  const handleExpandFullRecord = useCallback(() => {
    setIsQuickSheetOpen(false);
    setIsPullingQuickSheet(false);
    quickProgress.setValue(0);
    router.push('/record');
  }, [quickProgress, router]);

  const drawerContextValue = useMemo(
    () => ({
      isDrawerOpen,
      openDrawer,
      closeDrawer,
      ledgerPeriodMode,
      setLedgerPeriodMode,
    }),
    [closeDrawer, isDrawerOpen, ledgerPeriodMode, openDrawer]
  );

  const drawerBridgeValue = useMemo(
    () => ({
      drawerProgress,
      startDrawerPull,
      endDrawerPull,
      isQuickSheetOpen,
      quickProgress,
      startQuickPull,
      endQuickPull,
      openQuickSheet,
      isRadialOpen,
      radialItemsCount: radialItems.length,
      startRadialMenu,
      updateRadialSelection,
      finishRadialMenu,
    }),
    [
      drawerProgress,
      endDrawerPull,
      endQuickPull,
      finishRadialMenu,
      isQuickSheetOpen,
      isRadialOpen,
      openQuickSheet,
      quickProgress,
      radialItems.length,
      startDrawerPull,
      startQuickPull,
      startRadialMenu,
      updateRadialSelection,
    ]
  );

  const bottomInset = Math.max(insets.bottom, theme.spacing.xs);
  const radialOriginBottom = bottomInset + FAB_LABEL_BLOCK_HEIGHT + FAB_OUTER_SIZE / 2;

  return (
    <MainDrawerContext.Provider value={drawerContextValue}>
      <DrawerGestureBridgeContext.Provider value={drawerBridgeValue}>
        <View style={styles.root}>
          <SwipeTabs activityEnabled={false}>
            <SwipeTabs.Screen name="index" options={{ title: '明细' }} />
            <SwipeTabs.Screen name="assets" options={{ title: '资产' }} />
          </SwipeTabs>

          <QuickRecordSheet
            open={isQuickSheetOpen}
            onClose={closeQuickSheet}
            onExpandFullRecord={handleExpandFullRecord}
            pullProgress={quickProgress}
            pullingOpen={isPullingQuickSheet}
          />

          <QuickRadialOverlay
            visible={isRadialOpen}
            items={radialItems}
            activeIndex={radialActiveIndex}
            originBottom={radialOriginBottom}
          />

          {/* 扇形滑选极速记账完成后 1.5 秒轻提示（按要求无撤回按钮） */}
          {radialDoneNotice ? (
            <View
              pointerEvents="none"
              style={[
                styles.radialDoneWrap,
                { bottom: bottomInset + BAR_BODY_HEIGHT + FAB_PROTRUSION + 16 },
              ]}
            >
              <View
                style={[
                  styles.radialDonePill,
                  theme.elevation.floating,
                  {
                    backgroundColor: theme.colors.heroBg,
                    borderRadius: theme.radius.full,
                  },
                ]}
              >
                <AppIcon name="checkmark-circle" size={16} color={theme.colors.heroText} />
                <Text
                  style={[
                    styles.tabular,
                    {
                      color: theme.colors.heroText,
                      fontSize: theme.fontSize.xs,
                      fontWeight: theme.fontWeight.semibold,
                      marginLeft: 6,
                    },
                  ]}
                >
                  {radialDoneNotice}
                </Text>
              </View>
            </View>
          ) : null}

          <SettingsDrawer
            open={isDrawerOpen}
            onClose={closeDrawer}
            dragProgress={drawerProgress}
            draggingOpen={isPullingDrawer}
          />
        </View>
      </DrawerGestureBridgeContext.Provider>
    </MainDrawerContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },
  sharedTopBar: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleTrigger: {
    minHeight: 44,
    justifyContent: 'center',
    position: 'relative',
  },
  titleGhost: {
    opacity: 0,
  },
  titleLayer: {
    position: 'absolute',
    left: 0,
  },
  rightActionsSlot: {
    height: 40,
    minWidth: 196,
    justifyContent: 'center',
    alignItems: 'flex-end',
    position: 'relative',
  },
  rightActionLayer: {
    position: 'absolute',
    right: 0,
  },
  ledgerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerSearchBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addAccountBtn: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
  },
  track: {
    flex: 1,
    flexDirection: 'row',
  },
  page: {
    flex: 1,
  },
  outerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  barBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  itemsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSlot: {
    width: 96,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  fabOuterRing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  radialDoneWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 109,
    elevation: 22,
  },
  radialDonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
