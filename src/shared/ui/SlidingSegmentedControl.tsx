/**
 * 约束简报（Workflow B / C）：
 * - iOS 风格分段滑块控件：支持普通点击弹簧切换，以及长按（140ms）触发马达震动微抬起后 1:1 跟手左右滑动切档（每跨档位一次清脆刻度震动）
 * - 手势隔离：长按激活后由本控件子级 PanGesture 接管触摸，自动阻断父级页面横向翻页手势，零误触
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { hapticLight, hapticSelection } from '../haptics/haptics';
import { useTheme } from '../../theme/theme-context';

export interface SlidingSegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SlidingSegmentedControlProps<T extends string> {
  options: readonly SlidingSegmentOption<T>[];
  value: T;
  onChange: (nextValue: T) => void;
  /** 控件轨道高度（默认 40） */
  height?: number;
  /** 每格最小宽度（默认 50） */
  minSegmentWidth?: number;
}

const TRACK_PADDING = 3;

export function SlidingSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  height = 40,
  minSegmentWidth = 52,
}: SlidingSegmentedControlProps<T>): React.JSX.Element {
  const { theme } = useTheme();
  const count = Math.max(1, options.length);
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );

  const [segmentWidth, setSegmentWidth] = useState(minSegmentWidth);
  const [thumbX] = useState(() => new Animated.Value(selectedIndex * minSegmentWidth));
  const [thumbScale] = useState(() => new Animated.Value(1));

  const segmentWidthRef = useRef(segmentWidth);
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
    if (!hasMeasuredRef.current) {
      thumbX.setValue(selectedIndex * segmentWidth);
      return;
    }
    springThumbToIndex(selectedIndex);
  }, [selectedIndex, segmentWidth, springThumbToIndex, thumbX]);

  const updateIndexFromFingerX = useCallback(
    (fingerX: number) => {
      const segW = Math.max(1, segmentWidthRef.current);
      const opts = optionsRef.current;
      const innerX = fingerX - TRACK_PADDING;
      const maxThumbX = Math.max(0, (opts.length - 1) * segW);
      const clampedThumb = Math.max(0, Math.min(maxThumbX, innerX - segW / 2));
      thumbX.setValue(clampedThumb);

      const nextIdx = Math.max(0, Math.min(opts.length - 1, Math.floor(innerX / segW)));
      if (nextIdx !== selectedIndexRef.current) {
        selectedIndexRef.current = nextIdx;
        hapticSelection();
        const nextOption = opts[nextIdx];
        if (nextOption) {
          onChangeRef.current(nextOption.value);
        }
      }
    },
    [thumbX]
  );

  // 长按 140ms 触发震动与滑块轻抬起，随后 1:1 跟手在各分段间滑动切换
  const slidePanGesture = usePanGesture({
    enabled: options.length > 1,
    disableReanimated: true,
    runOnJS: true,
    activateAfterLongPress: 140,
    minDistance: 0,
    onActivate: (event) => {
      draggingRef.current = true;
      hapticLight();
      Animated.spring(thumbScale, {
        toValue: 1.06,
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

  const thumbHeight = height - TRACK_PADDING * 2;

  return (
    <GestureDetector gesture={slidePanGesture}>
      <View
        onLayout={(e) => {
          const innerWidth = e.nativeEvent.layout.width - TRACK_PADDING * 2;
          if (innerWidth > 0) {
            const nextSegW = innerWidth / count;
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
          {
            height,
            padding: TRACK_PADDING,
            backgroundColor: theme.colors.surfaceRaised,
            borderColor: theme.colors.border,
            borderWidth: theme.borderWidth.hairline,
            borderRadius: theme.radius.full,
          },
        ]}
      >
        {/* 实体高亮滑动胶囊 */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            theme.elevation.card,
            {
              left: TRACK_PADDING,
              top: TRACK_PADDING,
              width: segmentWidth,
              height: thumbHeight,
              backgroundColor: theme.colors.actionSubtle,
              borderRadius: theme.radius.full,
              transform: [{ translateX: thumbX }, { scale: thumbScale }],
            },
          ]}
        />

        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
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
                  minWidth: minSegmentWidth,
                  height: thumbHeight,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={{
                  color: selected ? theme.colors.actionTextOnSubtle : theme.colors.textMuted,
                  fontSize: theme.fontSize.xs,
                  fontWeight: selected ? theme.fontWeight.semibold : theme.fontWeight.regular,
                }}
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
  thumb: {
    position: 'absolute',
  },
  option: {
    flex: 1,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
});
