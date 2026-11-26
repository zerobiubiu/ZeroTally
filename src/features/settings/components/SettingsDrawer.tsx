/**
 * 约束简报（Workflow B / C）：
 * - 架构选型：叠加于主 Tab 容器顶层（非原生 Modal），避免 Android 双层 Modal 叠加导致抽屉内 ActionSheet / ConfirmDialog 错层或闪屏
 * - 交互闭环：支持外部跟手向右滑拉出（共享 Animated.Value progress）、点击页面标题展开、遮罩点击关闭、跟手向左滑动收起与 Android 硬件/手势返回键拦截关闭；完全收起后卸载子树零常驻开销
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { useTheme } from '../../../theme/theme-context';
import { SettingsPanel } from './SettingsPanel';

export function computeSettingsDrawerWidth(windowWidth: number): number {
  return Math.min(Math.round(windowWidth * 0.84), 336);
}

export interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 可选：由主布局传入的共享展开进度（0 = 收起，1 = 展开），用于支持从首页右滑 1:1 跟手拉出抽屉 */
  dragProgress?: Animated.Value;
  /** 外部是否正在进行跟手右滑拉出操作 */
  draggingOpen?: boolean;
}

export function SettingsDrawer({
  open,
  onClose,
  dragProgress,
  draggingOpen = false,
}: SettingsDrawerProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const drawerWidth = computeSettingsDrawerWidth(windowWidth);

  const shouldShow = open || draggingOpen;
  const [mounted, setMounted] = useState(shouldShow);
  if (shouldShow && !mounted) {
    setMounted(true);
  }

  // progress: 0 = 完全收起在左侧屏外，1 = 完全展开
  const [internalProgress] = useState(() => new Animated.Value(open ? 1 : 0));
  const progress = dragProgress ?? internalProgress;

  const openRef = useRef(open);
  const draggingOpenRef = useRef(draggingOpen);
  const drawerWidthRef = useRef(drawerWidth);
  const closingDragRef = useRef(false);

  useEffect(() => {
    openRef.current = open;
    draggingOpenRef.current = draggingOpen;
    drawerWidthRef.current = drawerWidth;
  }, [drawerWidth, draggingOpen, open]);

  useEffect(() => {
    if (!mounted || draggingOpen) {
      return;
    }

    if (open) {
      Animated.timing(progress, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(progress, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !openRef.current && !draggingOpenRef.current) {
          setMounted(false);
        }
      });
    }
  }, [draggingOpen, mounted, open, progress]);

  // 抽屉展开时拦截 Android 返回键，只收起抽屉不退出应用
  useEffect(() => {
    if (!open) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => {
      sub.remove();
    };
  }, [onClose, open]);

  // 支持在抽屉或遮罩区域跟手向左滑动关闭
  const closePanGesture = usePanGesture({
    enabled: open,
    disableReanimated: true,
    runOnJS: true,
    activeOffsetX: [-14, 9999],
    failOffsetY: [-20, 20],
    onActivate: () => {
      closingDragRef.current = true;
    },
    onUpdate: (event) => {
      const width = Math.max(1, drawerWidthRef.current);
      const clampedX = Math.min(0, Math.max(-width, event.translationX));
      progress.setValue(1 + clampedX / width);
    },
    onDeactivate: (event) => {
      closingDragRef.current = false;
      const width = Math.max(1, drawerWidthRef.current);
      const projected = event.translationX + event.velocityX * 0.14;
      if (projected < -width * 0.25) {
        onClose();
      } else {
        Animated.spring(progress, {
          toValue: 1,
          useNativeDriver: true,
          stiffness: 280,
          damping: 28,
          mass: 0.9,
        }).start();
      }
    },
    onFinalize: () => {
      if (closingDragRef.current) {
        closingDragRef.current = false;
        Animated.spring(progress, {
          toValue: openRef.current ? 1 : 0,
          useNativeDriver: true,
          stiffness: 280,
          damping: 28,
          mass: 0.9,
        }).start();
      }
    },
  });

  if (!mounted) {
    return null;
  }

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-drawerWidth, 0],
    extrapolate: 'clamp',
  });

  const scrimOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <GestureDetector gesture={closePanGesture}>
      <View
        style={[StyleSheet.absoluteFill, styles.root]}
        pointerEvents={open ? 'auto' : 'none'}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: theme.colors.scrim, opacity: scrimOpacity },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭侧边设置菜单"
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.drawerPanel,
            theme.elevation.floating,
            {
              width: drawerWidth,
              backgroundColor: theme.colors.surface,
              borderTopRightRadius: theme.radius.lg,
              borderBottomRightRadius: theme.radius.lg,
              transform: [{ translateX }],
            },
          ]}
        >
          <SettingsPanel variant="drawer" onClose={onClose} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    zIndex: 100,
    elevation: 16,
  },
  drawerPanel: {
    flex: 1,
    overflow: 'hidden',
  },
});
