/**
 * 约束简报（Workflow B / C）：
 * - 全应用统一底部卡片弹窗基座：收口进出场动画、遮罩淡入淡出、顶部抓手、标准标题栏（title / subtitle / 关闭按钮）、软键盘避让、底部贴底 footer 与手势物理，调用方只需填充自定义内容
 * - 能力分级：
 *   1. expandable = true（如账目详情、记录/编辑退款）：支持全区跟手上滑展开至近全屏、点按抓手切换半屏⇄全屏、任意态跟手下滑回半屏或关闭，软键盘弹出自动舒展避免遮挡；
 *   2. expandable = false（如日期选择、周期选择、账户选择、操作菜单）：仅支持跟手下滑收起，严格屏蔽上滑手势与上拉越界（maxOverdragUp = 0）。
 * - 滚动协同：开启 scrollable 后内置 ScrollView + useSimultaneousGestures 协同，顶部栏随时可拖，主体区在半屏态全区响应上下滑、在展开/单段态滚至顶部时无缝衔接下滑收起，彻底消除死区。
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
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  useNativeGesture,
  usePanGesture,
  useSimultaneousGestures,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/theme-context';
import { hapticLight, hapticSelection } from '../haptics/haptics';
import { AppIcon } from './AppIcon';
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
  /** 标准顶部标题（传入后自动渲染统一标题栏与右侧关闭按钮，无需重复手写 header） */
  title?: string;
  /** 标准顶部副标题（配合 title 使用） */
  subtitle?: string;
  /** 标准标题栏是否展示右侧关闭按钮（默认 true） */
  showCloseButton?: boolean;
  /** 自定义顶部头部插槽（优先级高于 title/subtitle，适用于详情金额主视觉等复杂头部） */
  header?: React.ReactNode;
  /** 面板主体内容（两段模式下可传函数读取纯布局状态） */
  children: React.ReactNode | ((state: BottomSheetLayoutState) => React.ReactNode);
  /** 底部固定操作栏（两段模式下自动反向抵消位移，在半屏与全屏间始终贴紧屏底，下滑关闭时随面板同步滑出） */
  footer?: React.ReactNode;
  /** 是否允许上滑展开至近全屏；false 时仅支持下滑收起且严格禁止上滑拉动 */
  expandable?: boolean;
  /** 两段模式下半屏高度占屏高比例（默认 0.56） */
  collapsedRatio?: number;
  /** 非两段模式下最大高度样式（如 '85%' / '72%'） */
  maxHeight?: ViewStyle['maxHeight'];
  /**
   * 内置垂直滚动区并自动与上下滑手势协同：
   * - 展开态/单段态在列表滑至顶部时无缝衔接向下拉收起；
   * - 两段模式半屏态下全区直接支持上滑展开与下滑收起。
   */
  scrollable?: boolean;
  /** scrollable=true 时主体 ScrollView 的内容区样式 */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** scrollable=true 时主体 ScrollView 的键盘点击策略（默认 'handled'） */
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  /** scrollable=true 且非两段模式时滚动区最大高度（如 360） */
  scrollMaxHeight?: number;
  /**
   * 仅当未使用 scrollable 且调用方自行渲染冲突竖向滚动区时才需开启；
   * 正常请直接开启 scrollable 由本基座统一协调手势。
   */
  dragHandleOnly?: boolean;
  /** 是否内置 KeyboardAvoidingView（含输入框的表单弹窗开启；与 expandable 搭配时弹出键盘自动展开防遮挡） */
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
  title,
  subtitle,
  showCloseButton = true,
  header,
  children,
  footer,
  expandable = false,
  collapsedRatio = 0.56,
  maxHeight,
  scrollable = false,
  contentContainerStyle,
  keyboardShouldPersistTaps = 'handled',
  scrollMaxHeight,
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
  const [keyboardVisible, setKeyboardVisible] = useState(false);
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
  const keyboardVisibleRef = useRef(false);
  const sheetHeightRef = useRef(expandable ? expandedHeight : defaultSingleHeight);
  const collapsedOffsetRef = useRef(collapsedOffset);
  const dragStartOffsetRef = useRef(collapsedOffset);
  const headerDraggingRef = useRef(false);
  const bodyDraggingRef = useRef(false);
  const scrollOffsetYRef = useRef(0);
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
      scrollOffsetYRef.current = 0;

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

  // 两段式表单弹窗弹出软键盘时自动舒展至展开态，避免输入区与底部主按钮被遮挡
  useEffect(() => {
    if (!mounted || !avoidKeyboard) {
      return;
    }
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      keyboardVisibleRef.current = true;
      setKeyboardVisible(true);
      if (expandable && !expandedRef.current && !closingRef.current) {
        animateToSnap(true, false);
      }
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      keyboardVisibleRef.current = false;
      setKeyboardVisible(false);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [animateToSnap, avoidKeyboard, expandable, mounted]);

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

  const applyDragUpdate = useCallback(
    (translationY: number) => {
      const dismissLimit = expandable
        ? expandedHeight
        : Math.max(300, sheetHeightRef.current);
      const nextY = clampBottomSheetDragOffset({
        startOffset: dragStartOffsetRef.current,
        translationY,
        maxDismissOffset: dismissLimit,
        maxOverdragUp: expandable ? MAX_OVERDRAG_UP : 0,
      });
      translateY.setValue(nextY);

      // 向下拖越过静息位时同步线性淡出背景遮罩
      const restY = expandable ? collapsedOffsetRef.current : 0;
      const fadeSpan = Math.max(120, dismissLimit - restY);
      const dismissProgress = Math.max(0, Math.min(1, (nextY - restY) / fadeSpan));
      backdropAnim.setValue(1 - dismissProgress);
    },
    [backdropAnim, expandable, expandedHeight, translateY]
  );

  const finishDrag = useCallback(
    (translationY: number, velocityY: number) => {
      const target = resolveBottomSheetSnapTarget({
        expandable,
        startedExpanded: expandedRef.current,
        sheetHeight: expandable ? expandedHeight : sheetHeightRef.current,
        collapsedOffset: collapsedOffsetRef.current,
        translationY,
        velocityY,
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
    [animateToSnap, dismiss, expandable, expandedHeight]
  );

  // 顶部栏/全卡手势：expandable=true 支持上下双向；expandable=false 严格仅响应向下收起，不做上滑
  const headerPanGesture = usePanGesture({
    enabled: visible,
    disableReanimated: true,
    runOnJS: true,
    activeOffsetY: expandable ? [-10, 10] : 10,
    failOffsetX: scrollable || dragHandleOnly ? [-24, 24] : [-14, 14],
    onActivate: () => {
      if (closingRef.current) {
        return;
      }
      Keyboard.dismiss();
      headerDraggingRef.current = true;
      dragStartOffsetRef.current =
        expandable && !expandedRef.current ? collapsedOffsetRef.current : 0;
    },
    onUpdate: (event) => {
      if (!headerDraggingRef.current || closingRef.current) {
        return;
      }
      applyDragUpdate(event.translationY);
    },
    onDeactivate: (event) => {
      if (!headerDraggingRef.current || closingRef.current) {
        return;
      }
      headerDraggingRef.current = false;
      finishDrag(event.translationY, event.velocityY);
    },
    onFinalize: () => {
      if (headerDraggingRef.current && !closingRef.current) {
        headerDraggingRef.current = false;
        animateToSnap(expandable && expandedRef.current, false);
      }
    },
  });

  // 内置滚动区协同手势（scrollable=true）：
  // - 两段半屏态：全区上滑直接展开、全区下滑直接关闭；
  // - 展开态或单段滚动态：列表位于顶部（scrollOffsetY <= 2）时向下拉无缝接管收起/回半屏，不影响正常滚动。
  const nativeScrollGesture = useNativeGesture({
    disableReanimated: true,
  });

  const bodyPanGesture = usePanGesture({
    enabled: visible && scrollable,
    disableReanimated: true,
    runOnJS: true,
    activeOffsetY: expandable ? [-12, 12] : 12,
    failOffsetX: [-16, 16],
    onActivate: (event) => {
      if (closingRef.current) {
        bodyDraggingRef.current = false;
        return;
      }
      if (expandable) {
        if (expandedRef.current) {
          // 已展开时：仅在滚动到顶部且手指向下拉时接管，向上或列表未到顶则交给 ScrollView
          if (event.translationY <= 0 || scrollOffsetYRef.current > 2) {
            bodyDraggingRef.current = false;
            return;
          }
          Keyboard.dismiss();
          bodyDraggingRef.current = true;
          dragStartOffsetRef.current = 0;
        } else {
          // 半屏态：若软键盘已展开且内部发生滚动，则先允许滚动，否则全区上下滑直接展开/关闭
          if (keyboardVisibleRef.current && scrollOffsetYRef.current > 2) {
            bodyDraggingRef.current = false;
            return;
          }
          Keyboard.dismiss();
          bodyDraggingRef.current = true;
          dragStartOffsetRef.current = collapsedOffsetRef.current;
        }
      } else {
        // 单段滚动弹窗：仅在列表处于顶部且向下拉时接管收起，严格不响应上滑
        if (event.translationY <= 0 || scrollOffsetYRef.current > 2) {
          bodyDraggingRef.current = false;
          return;
        }
        Keyboard.dismiss();
        bodyDraggingRef.current = true;
        dragStartOffsetRef.current = 0;
      }
    },
    onUpdate: (event) => {
      if (!bodyDraggingRef.current || closingRef.current) {
        return;
      }
      applyDragUpdate(event.translationY);
    },
    onDeactivate: (event) => {
      if (!bodyDraggingRef.current || closingRef.current) {
        return;
      }
      bodyDraggingRef.current = false;
      finishDrag(event.translationY, event.velocityY);
    },
    onFinalize: () => {
      if (bodyDraggingRef.current && !closingRef.current) {
        bodyDraggingRef.current = false;
        animateToSnap(expandable && expandedRef.current, false);
      }
    },
  });

  const bodyScrollGesture = useSimultaneousGestures(bodyPanGesture, nativeScrollGesture);

  if (!mounted) {
    return null;
  }

  const layoutState: BottomSheetLayoutState = {
    expanded,
    collapsedScrollExtraPadding: expandable && !expanded ? collapsedOffset : 0,
  };

  const defaultHeader = title ? (
    <View
      style={[
        styles.defaultHeader,
        {
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.md,
          borderBottomColor: theme.colors.border,
          borderBottomWidth: theme.borderWidth.hairline,
        },
      ]}
    >
      <View style={styles.defaultHeaderText}>
        <Text
          numberOfLines={1}
          style={{
            color: theme.colors.text,
            fontSize: theme.fontSize.base,
            fontWeight: theme.fontWeight.semibold,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.fontSize.xs,
              marginTop: 2,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {showCloseButton ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭"
          onPress={() => {
            hapticLight();
            dismiss();
          }}
          hitSlop={10}
          style={({ pressed }) => [
            styles.defaultCloseBtn,
            pressed && { opacity: theme.opacity.pressed },
          ]}
        >
          <AppIcon name="close" size={20} color={theme.colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  ) : null;

  const renderedHeader = header ?? defaultHeader;
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

  const useSeparateHeaderAndBodyGestures = scrollable || dragHandleOnly;

  const bodyNode = scrollable ? (
    <GestureDetector gesture={bodyScrollGesture}>
      <ScrollView
        style={[
          expandable ? styles.expandableBody : styles.autoBody,
          !expandable && scrollMaxHeight !== undefined ? { maxHeight: scrollMaxHeight } : null,
        ]}
        scrollEnabled={!expandable || expanded || keyboardVisible}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        onScroll={(e) => {
          scrollOffsetYRef.current = e.nativeEvent.contentOffset.y;
        }}
        contentContainerStyle={[
          contentContainerStyle,
          layoutState.collapsedScrollExtraPadding > 0
            ? { paddingBottom: layoutState.collapsedScrollExtraPadding + theme.spacing.lg }
            : null,
        ]}
      >
        {renderedChildren}
      </ScrollView>
    </GestureDetector>
  ) : (
    <View style={expandable ? styles.expandableBody : styles.autoBody}>{renderedChildren}</View>
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
      {/* 仅两段式支持上拉时铺设越界垫底，防止上拉微阻尼时屏底露缝 */}
      {expandable ? (
        <View
          pointerEvents="none"
          style={[
            styles.overdragFiller,
            { backgroundColor: theme.colors.surfaceRaised },
          ]}
        />
      ) : null}

      {useSeparateHeaderAndBodyGestures ? (
        <GestureDetector gesture={headerPanGesture}>{topChrome}</GestureDetector>
      ) : (
        topChrome
      )}

      {bodyNode}

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

  const wrappedSheet = useSeparateHeaderAndBodyGestures ? (
    sheetInner
  ) : (
    <GestureDetector gesture={headerPanGesture}>{sheetInner}</GestureDetector>
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
  defaultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  defaultHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  defaultCloseBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
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
