/**
 * 约束简报（Workflow B / C）：
 * - 统一底部半屏弹窗基座：收口全项目所有底部 Sheet 的进出场动画、遮罩淡入淡出、顶部抓手条与真实物理下拉关闭手势，彻底消除不可拖动的“假横条”
 * - 手势与性能：全链路基于 Animated useNativeDriver: true GPU 合成，零布局重排；支持单段跟手下拉关闭，及可选两段式（半屏 ⇄ 近全屏展开 ⇄ 关闭）且底部固定操作栏始终贴底不位移
 * - 冲突隔离：Modal 内部独立包裹 GestureHandlerRootView；非滚动面板全区支持下拉（failOffsetX 隔离日历/年份横滑）；含竖向 ScrollView 面板通过顶部宽大抓手+头部热区随时拖拽
 */
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StatusBar as RNStatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  usePanGesture,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/theme-context';
import { hapticLight, hapticSelection } from '../haptics/haptics';
import {
  clampBottomSheetDragOffset,
  resolveBottomSheetSnapTarget,
} from './bottom-sheet-rules';

export interface BottomSheetHandle {
  /** 执行平滑收起动画后再触发 onClose（可选追加动画后回调，如跳转编辑或打开下层弹窗） */
  dismiss: (afterClose?: () => void) => void;
  /** 两段模式下在半屏与全屏展开态之间平滑切换 */
  toggleExpanded: () => void;
}

export interface BottomSheetLayoutState {
  /** 两段模式下当前是否处于全屏展开态 */
  expanded: boolean;
  /** 两段模式下处于半屏态时，底部预留给固定 footer 位移的额外内边距 */
  collapsedScrollExtraPadding: number;
}

export interface BottomSheetProps {
  ref?: React.Ref<BottomSheetHandle>;
  visible: boolean;
  onClose: () => void;
  /** 遮罩无障碍关闭文案 */
  backdropLabel?: string;
  /** 顶部头部插槽（置于抓手条正下方，与抓手共用下拉/上拉拖拽热区） */
  header?: React.ReactNode;
  /** 面板主体内容（两段模式下可传函数读取纯布局状态） */
  children: React.ReactNode | ((state: BottomSheetLayoutState) => React.ReactNode);
  /** 底部固定操作栏（两段模式下自动反向抵消位移，在半屏与全屏间始终贴紧屏底，下滑关闭时随面板同步滑出） */
  footer?: React.ReactNode;
  /** 是否允许上拉展开至近全屏（适用于详情展示等长内容半屏窗） */
  expandable?: boolean;
  /** 两段模式下半屏高度占屏高比例（默认 0.56） */
  collapsedRatio?: number;
  /** 非两段模式下最大高度样式（如 '85%' / '72%'） */
  maxHeight?: ViewStyle['maxHeight'];
  /**
   * 为 true 时仅在顶部抓手与 header 区域响应拖拽，避免与主体内部竖向 ScrollView 或输入框冲突；
   * 为 false 时整个面板均可向下滑动收起（通过 failOffsetX 自动让权给内部横向滑动）。
   */
  dragHandleOnly?: boolean;
  /** 是否内置 KeyboardAvoidingView（含输入框的表单弹窗开启） */
  avoidKeyboard?: boolean;
  /** 面板是否自带底部安全区内边距（若使用了自带安全区的 footer 可设为 false） */
  includeBottomInset?: boolean;
}

const MAX_OVERDRAG_UP = 16;

export function BottomSheet({
  ref,
  visible,
  onClose,
  backdropLabel = '关闭弹窗',
  header,
  children,
  footer,
  expandable = false,
  collapsedRatio = 0.56,
  maxHeight,
  dragHandleOnly = false,
  avoidKeyboard = false,
  includeBottomInset = true,
}: BottomSheetProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const topInset =
    Platform.OS === 'android'
      ? Math.max(insets.top, RNStatusBar.currentHeight ?? 0)
      : insets.top;

  // 两段模式几何参数：布局高度固定为 expandedHeight，半屏态靠 translateY = collapsedOffset 达成纯 GPU 动画
  const expandedHeight = Math.max(440, Math.round(windowHeight - topInset - 18));
  const collapsedHeight = Math.min(
    expandedHeight - 80,
    Math.max(360, Math.round(windowHeight * collapsedRatio))
  );
  const collapsedOffset = expandable ? Math.max(0, expandedHeight - collapsedHeight) : 0;

  const [mounted, setMounted] = useState(visible);
  const [expanded, setExpanded] = useState(false);
  if (visible && !mounted) {
    setMounted(true);
    if (expanded) {
      setExpanded(false);
    }
  }

  // 单段模式：0 = 展开就位，sheetHeight = 完全滑出屏底
  // 两段模式：0 = 全屏展开态，collapsedOffset = 半屏就位，expandedHeight = 完全滑出屏底
  const defaultSingleHeight = Math.round(windowHeight * 0.5);
  const initialDismissOffset = expandable ? expandedHeight : Math.round(windowHeight * 0.65);
  const [translateY] = useState(() => new Animated.Value(initialDismissOffset));
  const [backdropAnim] = useState(() => new Animated.Value(0));

  const visibleRef = useRef(visible);
  const closingRef = useRef(false);
  const expandedRef = useRef(false);
  const sheetHeightRef = useRef(expandable ? expandedHeight : defaultSingleHeight);
  const collapsedOffsetRef = useRef(collapsedOffset);
  const dragStartOffsetRef = useRef(collapsedOffset);
  const draggingRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    visibleRef.current = visible;
    onCloseRef.current = onClose;
    collapsedOffsetRef.current = collapsedOffset;
    if (expandable) {
      sheetHeightRef.current = expandedHeight;
    }
  }, [visible, onClose, collapsedOffset, expandable, expandedHeight]);

  // 每次由关闭转为显示时，重置到默认态并播放平滑上滑进场动画
  useEffect(() => {
    if (!mounted) {
      return;
    }

    if (visible) {
      closingRef.current = false;
      expandedRef.current = false;

      const startFrom = expandable
        ? expandedHeight
        : Math.max(320, sheetHeightRef.current);
      const restY = expandable ? collapsedOffset : 0;

      translateY.setValue(startFrom);
      backdropAnim.setValue(0);

      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 210,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: restY,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (!closingRef.current) {
      // 父级直接将 visible 置为 false 时，平滑收起后卸载 Modal
      closingRef.current = true;
      const dismissTo = expandable
        ? expandedHeight
        : Math.max(320, sheetHeightRef.current);

      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: dismissTo,
          duration: 190,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        closingRef.current = false;
        if (!visibleRef.current) {
          setMounted(false);
        }
      });
    }
  }, [mounted, visible, expandable, expandedHeight, collapsedOffset, translateY, backdropAnim]);

  const animateToSnap = useCallback(
    (targetExpanded: boolean, withHaptic = false) => {
      const targetY = targetExpanded ? 0 : collapsedOffsetRef.current;
      const changed = expandedRef.current !== targetExpanded;
      expandedRef.current = targetExpanded;
      setExpanded(targetExpanded);
      if (withHaptic && changed) {
        hapticSelection();
      }
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: targetY,
          useNativeDriver: true,
          stiffness: 320,
          damping: 32,
          mass: 0.9,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [backdropAnim, translateY]
  );

  const dismiss = useCallback(
    (afterClose?: () => void) => {
      if (closingRef.current) {
        return;
      }
      Keyboard.dismiss();
      closingRef.current = true;
      const dismissTo = expandable
        ? expandedHeight
        : Math.max(320, sheetHeightRef.current);

      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: dismissTo,
          duration: 190,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        closingRef.current = false;
        setMounted(false);
        onCloseRef.current();
        afterClose?.();
      });
    },
    [backdropAnim, expandable, expandedHeight, translateY]
  );

  const toggleExpanded = useCallback(() => {
    if (!expandable) {
      return;
    }
    animateToSnap(!expandedRef.current, true);
  }, [animateToSnap, expandable]);

  useImperativeHandle(
    ref,
    () => ({
      dismiss,
      toggleExpanded,
    }),
    [dismiss, toggleExpanded]
  );

  const panGesture = usePanGesture({
    enabled: visible,
    disableReanimated: true,
    runOnJS: true,
    // 两段模式上下都响应；单段模式仅向下（及轻微上拉阻尼）响应，避免拦截横向滑动
    activeOffsetY: expandable ? [-10, 10] : [-14, 10],
    failOffsetX: dragHandleOnly ? [-24, 24] : [-14, 14],
    onActivate: () => {
      if (closingRef.current) {
        return;
      }
      Keyboard.dismiss();
      draggingRef.current = true;
      dragStartOffsetRef.current =
        expandable && !expandedRef.current ? collapsedOffsetRef.current : 0;
    },
    onUpdate: (event) => {
      if (!draggingRef.current || closingRef.current) {
        return;
      }
      const dismissLimit = expandable
        ? expandedHeight
        : Math.max(300, sheetHeightRef.current);
      const nextY = clampBottomSheetDragOffset({
        startOffset: dragStartOffsetRef.current,
        translationY: event.translationY,
        maxDismissOffset: dismissLimit,
        maxOverdragUp: MAX_OVERDRAG_UP,
      });
      translateY.setValue(nextY);

      // 向下拖越过静息位时同步线性淡出背景遮罩
      const restY = expandable ? collapsedOffsetRef.current : 0;
      const fadeSpan = Math.max(120, dismissLimit - restY);
      const dismissProgress = Math.max(0, Math.min(1, (nextY - restY) / fadeSpan));
      backdropAnim.setValue(1 - dismissProgress);
    },
    onDeactivate: (event) => {
      if (!draggingRef.current || closingRef.current) {
        return;
      }
      draggingRef.current = false;
      const target = resolveBottomSheetSnapTarget({
        expandable,
        startedExpanded: expandedRef.current,
        sheetHeight: expandable ? expandedHeight : sheetHeightRef.current,
        collapsedOffset: collapsedOffsetRef.current,
        translationY: event.translationY,
        velocityY: event.velocityY,
      });

      if (target === 'dismiss') {
        hapticLight();
        dismiss();
      } else if (target === 'expanded') {
        animateToSnap(true, true);
      } else {
        animateToSnap(false, expandable && expandedRef.current);
      }
    },
    onFinalize: () => {
      if (draggingRef.current && !closingRef.current) {
        draggingRef.current = false;
        animateToSnap(expandable && expandedRef.current, false);
      }
    },
  });

  if (!mounted) {
    return null;
  }

  const layoutState: BottomSheetLayoutState = {
    expanded,
    collapsedScrollExtraPadding: expandable && !expanded ? collapsedOffset : 0,
  };

  const renderedHeader = header;
  const renderedChildren = typeof children === 'function' ? children(layoutState) : children;
  const renderedFooter = footer;

  // 两段模式下，footer 反向抵消 [0, collapsedOffset] 区间内的位移，确保半屏/全屏切换时始终贴屏底，下拉关闭时同步滑出
  const footerCounterTranslateY =
    expandable && collapsedOffset > 0
      ? translateY.interpolate({
          inputRange: [-MAX_OVERDRAG_UP, 0, collapsedOffset, expandedHeight],
          outputRange: [0, 0, -collapsedOffset, -collapsedOffset],
          extrapolate: 'clamp',
        })
      : null;

  const handleBar = (
    <Pressable
      accessibilityRole={expandable ? 'button' : undefined}
      accessibilityLabel={
        expandable ? (expanded ? '收起至半屏，或向下滑动关闭' : '展开至全屏，或向下滑动关闭') : undefined
      }
      disabled={!expandable}
      onPress={expandable ? toggleExpanded : undefined}
      style={styles.handleWrap}
    >
      <View
        style={[
          styles.handle,
          {
            backgroundColor: theme.colors.borderStrong,
            borderRadius: theme.radius.full,
          },
        ]}
      />
    </Pressable>
  );

  const topChrome = (
    <View>
      {handleBar}
      {renderedHeader}
    </View>
  );

  const sheetInner = (
    <Animated.View
      onLayout={(e) => {
        if (!expandable) {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && Math.abs(h - sheetHeightRef.current) > 2) {
            sheetHeightRef.current = h;
          }
        }
      }}
      style={[
        styles.sheet,
        theme.elevation.floating,
        {
          backgroundColor: theme.colors.surfaceRaised,
          borderTopLeftRadius: theme.radius.lg,
          borderTopRightRadius: theme.radius.lg,
          paddingBottom:
            includeBottomInset && !renderedFooter ? Math.max(insets.bottom, theme.spacing.lg) : 0,
          transform: [{ translateY }],
        },
        expandable ? { height: expandedHeight } : maxHeight !== undefined ? { maxHeight } : null,
      ]}
    >
      {/* 上拉微阻尼越界垫底，防止上拉 16dp 时屏底露缝 */}
      <View
        pointerEvents="none"
        style={[
          styles.overdragFiller,
          { backgroundColor: theme.colors.surfaceRaised },
        ]}
      />

      {dragHandleOnly ? (
        <GestureDetector gesture={panGesture}>{topChrome}</GestureDetector>
      ) : (
        topChrome
      )}

      <View style={expandable ? styles.expandableBody : styles.autoBody}>{renderedChildren}</View>

      {renderedFooter ? (
        footerCounterTranslateY ? (
          <Animated.View
            style={[
              styles.stickyFooter,
              {
                backgroundColor: theme.colors.surfaceRaised,
                transform: [{ translateY: footerCounterTranslateY }],
              },
            ]}
          >
            {renderedFooter}
          </Animated.View>
        ) : (
          <View style={{ backgroundColor: theme.colors.surfaceRaised }}>{renderedFooter}</View>
        )
      ) : null}
    </Animated.View>
  );

  const wrappedSheet = dragHandleOnly ? (
    sheetInner
  ) : (
    <GestureDetector gesture={panGesture}>{sheetInner}</GestureDetector>
  );

  const content = (
    <View style={styles.root}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: theme.colors.scrim, opacity: backdropAnim },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backdropLabel}
          onPress={() => dismiss()}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {wrappedSheet}
    </View>
  );

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => dismiss()}
    >
      <GestureHandlerRootView style={styles.flex}>
        {avoidKeyboard ? (
          <KeyboardAvoidingView style={styles.flex} behavior="padding">
            {content}
          </KeyboardAvoidingView>
        ) : (
          content
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    overflow: 'visible',
  },
  overdragFiller: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -MAX_OVERDRAG_UP - 8,
    height: MAX_OVERDRAG_UP + 10,
  },
  handleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 8,
    minHeight: 24,
  },
  handle: {
    width: 38,
    height: 4,
  },
  expandableBody: {
    flex: 1,
    minHeight: 0,
  },
  autoBody: {
    flexShrink: 1,
  },
  stickyFooter: {
    zIndex: 4,
  },
});
