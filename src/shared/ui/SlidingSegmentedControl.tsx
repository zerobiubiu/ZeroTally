/**
 * 约束简报（Workflow B / C）：
 * - 全应用统一 iOS 风格分段滑块控件：收口明细周期、设置外观、分类收支、账务分析、快捷记账类型与账户性质等所有 2~4 段互斥切换
 * - 统一手感：短按轻点弹簧丝滑切档 + 刻度震动；长按（140ms）触发轻震动并微浮起放大，随后 1:1 跟手左右滑动实时切档（每跨档位一次清脆震动）
 * - 视觉分层与手势隔离：支持 surface / surfaceRaised 轨道层级、pill / rounded 圆角与单格语义配色；长按激活后由子级 PanGesture 接管，自动阻断父级页面/抽屉横滑
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { useTheme } from '../../theme/theme-context';
import { hapticLight, hapticSelection } from '../haptics/haptics';
import {
  computeSegmentedTrackMetrics,
  resolveSegmentDragPosition,
} from './sliding-segmented-rules';

export interface SlidingSegmentOption<T extends string> {
  value: T;
  label: string;
  /** 可选：该项选中时的滑块语义底色（默认 theme.colors.actionSubtle） */
  activeBackgroundColor?: string;
  /** 可选：该项选中时的文字颜色（默认 theme.colors.actionTextOnSubtle） */
  activeTextColor?: string;
}

export interface SlidingSegmentedControlProps<T extends string> {
  options: readonly SlidingSegmentOption<T>[];
  value: T;
  onChange: (nextValue: T) => void;
  /** 控件轨道高度（默认 40） */
  height?: number;
  /** 非通栏模式下的每格最小宽度（默认 52） */
  minSegmentWidth?: number;
  /** 是否撑满父容器宽度均分各格（默认 false，适合顶栏紧凑布局） */
  fullWidth?: boolean;
  /** 视觉圆角风格：pill = 全圆角胶囊，rounded = 柔和圆角矩形 */
  shape?: 'pill' | 'rounded';
  /** 轨道底色层级：页面底色上用 surfaceRaised，卡片/浮窗内用 surface */
  trackTone?: 'surface' | 'surfaceRaised';
  /** 标签字号级别（默认 sm） */
  textSize?: 'xs' | 'sm' | 'base';
  /** 禁用状态 */
  disabled?: boolean;
  /** 附加外容器样式（如外边距） */
  style?: StyleProp<ViewStyle>;
}

const TRACK_PADDING = 3;

export function SlidingSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  height = 40,
  minSegmentWidth = 52,
  fullWidth = false,
  shape = 'pill',
  trackTone = 'surfaceRaised',
  textSize = 'sm',
  disabled = false,
  style,
}: SlidingSegmentedControlProps<T>): React.JSX.Element {
  const { theme } = useTheme();
  const count = Math.max(1, options.length);
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const activeOption = options[selectedIndex];

  const initialWidth = fullWidth ? 0 : minSegmentWidth;
  const [segmentWidth, setSegmentWidth] = useState(initialWidth);
  const [thumbX] = useState(() => new Animated.Value(selectedIndex * initialWidth));
  const [thumbScale] = useState(() => new Animated.Value(1));

  const segmentWidthRef = useRef(initialWidth);
  const selectedIndexRef = useRef(selectedIndex);
  const optionsRef = useRef(options);
  const onChangeRef = useRef(onChange);
  const draggingRef = useRef(false);
  const hasMeasuredRef = useRef(false);

  useEffect(() => {
    segmentWidthRef.current = segmentWidth;
    selectedIndexRef.current = selectedIndex;
    optionsRef.current = options;
    onChangeRef.current = onChange;
  }, [onChange, options, segmentWidth, selectedIndex]);

  const springThumbToIndex = useCallback(
    (index: number) => {
      Animated.parallel([
        Animated.spring(thumbX, {
          toValue: index * segmentWidthRef.current,
          useNativeDriver: true,
          stiffness: 340,
          damping: 28,
          mass: 0.85,
        }),
        Animated.spring(thumbScale, {
          toValue: 1,
          useNativeDriver: true,
          stiffness: 340,
          damping: 26,
          mass: 0.8,
        }),
      ]).start();
    },
    [thumbScale, thumbX]
  );

  // 外部值变化或点击切换时同步滑块位置
  useEffect(() => {
    if (draggingRef.current) {
      return;
    }
    if (!hasMeasuredRef.current || segmentWidth <= 0) {
      thumbX.setValue(selectedIndex * segmentWidth);
      return;
    }
    springThumbToIndex(selectedIndex);
  }, [selectedIndex, segmentWidth, springThumbToIndex, thumbX]);

  const borderWidth = theme.borderWidth.hairline;
  const contentInset = TRACK_PADDING + borderWidth;

  const updateIndexFromFingerX = useCallback(
    (fingerX: number) => {
      const segW = segmentWidthRef.current;
      const opts = optionsRef.current;
      if (segW <= 0 || opts.length === 0) {
        return;
      }

      const { clampedThumbX, targetIndex } = resolveSegmentDragPosition({
        fingerX,
        trackPadding: contentInset,
        segmentWidth: segW,
        count: opts.length,
      });

      thumbX.setValue(clampedThumbX);

      if (targetIndex !== selectedIndexRef.current) {
        selectedIndexRef.current = targetIndex;
        hapticSelection();
        const nextOption = opts[targetIndex];
        if (nextOption) {
          onChangeRef.current(nextOption.value);
        }
      }
    },
    [contentInset, thumbX]
  );

  // 长按 160ms 触发轻震动与滑块浮起放大，随后 1:1 跟手左右滑动切档
  // 注意：minDistance 设为超大值确保短按单击不会因微抖提前激活 Pan，仅在长按达标后进入拖拽态
  const slidePanGesture = usePanGesture({
    enabled: !disabled && options.length > 1,
    disableReanimated: true,
    runOnJS: true,
    activateAfterLongPress: 160,
    minDistance: 99999,
    onActivate: (event) => {
      draggingRef.current = true;
      hapticLight();
      Animated.spring(thumbScale, {
        toValue: 1.05,
        useNativeDriver: true,
        stiffness: 420,
        damping: 24,
        mass: 0.7,
      }).start();
      updateIndexFromFingerX(event.x);
    },
    onUpdate: (event) => {
      if (!draggingRef.current) {
        return;
      }
      updateIndexFromFingerX(event.x);
    },
    onDeactivate: () => {
      if (!draggingRef.current) {
        return;
      }
      draggingRef.current = false;
      springThumbToIndex(selectedIndexRef.current);
    },
    onFinalize: () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        springThumbToIndex(selectedIndexRef.current);
      }
    },
  });

  const trackRadius = shape === 'pill' ? theme.radius.full : theme.radius.md;
  const thumbRadius = shape === 'pill' ? theme.radius.full : theme.radius.sm;
  const trackBg = trackTone === 'surface' ? theme.colors.surface : theme.colors.surfaceRaised;
  const thumbBg = activeOption?.activeBackgroundColor ?? theme.colors.actionSubtle;
  const thumbBorderColor =
    theme.mode === 'dark' ? 'rgba(255, 255, 255, 0.09)' : 'rgba(17, 18, 31, 0.06)';
  const resolvedFontSize =
    textSize === 'xs'
      ? theme.fontSize.xs
      : textSize === 'base'
        ? theme.fontSize.base
        : theme.fontSize.sm;

  return (
    <GestureDetector gesture={slidePanGesture}>
      <View
        onLayout={(e) => {
          const { innerWidth, segmentWidth: nextSegW } = computeSegmentedTrackMetrics({
            layoutWidth: e.nativeEvent.layout.width,
            trackHeight: height,
            trackPadding: TRACK_PADDING,
            borderWidth,
            count,
          });
          if (innerWidth > 0) {
            if (Math.abs(nextSegW - segmentWidthRef.current) > 0.5 || !hasMeasuredRef.current) {
              hasMeasuredRef.current = true;
              segmentWidthRef.current = nextSegW;
              setSegmentWidth(nextSegW);
              if (!draggingRef.current) {
                thumbX.setValue(selectedIndexRef.current * nextSegW);
              }
            }
          }
        }}
        style={[
          styles.track,
          fullWidth && styles.fullWidth,
          {
            height,
            padding: TRACK_PADDING,
            backgroundColor: trackBg,
            borderColor: theme.colors.border,
            borderWidth,
            borderRadius: trackRadius,
            opacity: disabled ? theme.opacity.disabled : 1,
          },
          style,
        ]}
      >
        {/* 实体高亮滑动胶囊：通过 top/bottom 同距锚定 padding-box，保证上下左右四边严格对称 */}
        {segmentWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.thumb,
              {
                left: TRACK_PADDING,
                top: TRACK_PADDING,
                bottom: TRACK_PADDING,
                width: segmentWidth,
                backgroundColor: thumbBg,
                borderColor: thumbBorderColor,
                borderWidth: StyleSheet.hairlineWidth,
                borderRadius: thumbRadius,
                transform: [{ translateX: thumbX }, { scale: thumbScale }],
              },
            ]}
          />
        ) : null}

        {options.map((opt) => {
          const selected = opt.value === value;
          const activeColor = opt.activeTextColor ?? theme.colors.actionTextOnSubtle;
          return (
            <Pressable
              key={opt.value}
              disabled={disabled}
              accessibilityRole="tab"
              accessibilityState={{ selected, disabled }}
              accessibilityHint="点击切换，或长按左右滑动切换"
              onPress={() => {
                if (opt.value !== value) {
                  hapticSelection();
                  onChange(opt.value);
                }
              }}
              style={[
                styles.option,
                {
                  minWidth: fullWidth ? 0 : minSegmentWidth,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.optionLabel,
                  {
                    color: selected ? activeColor : theme.colors.textSecondary,
                    fontSize: resolvedFontSize,
                    fontWeight: selected ? theme.fontWeight.semibold : theme.fontWeight.regular,
                  },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  fullWidth: {
    width: '100%',
  },
  thumb: {
    position: 'absolute',
  },
  option: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  optionLabel: {
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
