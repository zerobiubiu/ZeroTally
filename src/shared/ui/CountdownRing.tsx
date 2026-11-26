/**
 * 约束简报（Workflow B）：
 * - 纯 GPU 原生驱动（useNativeDriver: true）360° → 0° 顺时针倒计时圆环，零 SVG 依赖
 * - 使用双半圆裁剪旋转法从正 12 点钟方向平滑连续递减至归零，支持中心自定义内容（如撤销图标/倒计时秒数）
 */
import React, { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

export interface CountdownRingProps {
  /** 圆环外径（默认 40） */
  size?: number;
  /** 圆环描边宽度（默认 3） */
  strokeWidth?: number;
  /** 倒计时总毫秒数（默认 3000） */
  durationMs?: number;
  /** 剩余进度色 */
  activeColor: string;
  /** 底环轨道色 */
  trackColor: string;
  /** 中心自定义内容 */
  children?: React.ReactNode;
}

export function CountdownRing({
  size = 40,
  strokeWidth = 3,
  durationMs = 3000,
  activeColor,
  trackColor,
  children,
}: CountdownRingProps): React.JSX.Element {
  const [progress] = useState(() => new Animated.Value(1));
  const half = size / 2;

  useEffect(() => {
    progress.setValue(1);
    const anim = Animated.timing(progress, {
      toValue: 0,
      duration: Math.max(100, durationMs),
      easing: Easing.linear,
      useNativeDriver: true,
    });
    anim.start();
    return () => {
      anim.stop();
    };
  }, [durationMs, progress]);

  // 上半段（progress 1 -> 0.5）：右半圆从 +45deg（占据 0..180°）顺时针旋至 +225deg（完全隐去）
  const rightRotate = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['225deg', '225deg', '45deg'],
    extrapolate: 'clamp',
  });

  // 下半段（progress 0.5 -> 0）：左半圆从 +45deg（占据 180..360°）顺时针旋至 +225deg（完全隐去）
  const leftRotate = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['225deg', '45deg', '45deg'],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* 底层圆环轨道 */}
      <View
        pointerEvents="none"
        style={[
          styles.fullCircle,
          {
            width: size,
            height: size,
            borderRadius: half,
            borderWidth: strokeWidth,
            borderColor: trackColor,
          },
        ]}
      />

      {/* 右半裁剪区（12 点 -> 6 点） */}
      <View
        pointerEvents="none"
        style={[styles.halfClip, { right: 0, width: half, height: size }]}
      >
        <Animated.View
          style={[
            styles.halfArc,
            {
              left: -half,
              width: size,
              height: size,
              borderRadius: half,
              borderWidth: strokeWidth,
              borderTopColor: activeColor,
              borderRightColor: activeColor,
              borderBottomColor: 'transparent',
              borderLeftColor: 'transparent',
              transform: [{ rotate: rightRotate }],
            },
          ]}
        />
      </View>

      {/* 左半裁剪区（6 点 -> 12 点） */}
      <View
        pointerEvents="none"
        style={[styles.halfClip, { left: 0, width: half, height: size }]}
      >
        <Animated.View
          style={[
            styles.halfArc,
            {
              left: 0,
              width: size,
              height: size,
              borderRadius: half,
              borderWidth: strokeWidth,
              borderBottomColor: activeColor,
              borderLeftColor: activeColor,
              borderTopColor: 'transparent',
              borderRightColor: 'transparent',
              transform: [{ rotate: leftRotate }],
            },
          ]}
        />
      </View>

      {/* 居中内容 */}
      <View style={styles.centerSlot}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullCircle: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  halfClip: {
    position: 'absolute',
    top: 0,
    overflow: 'hidden',
  },
  halfArc: {
    position: 'absolute',
    top: 0,
  },
  centerSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
