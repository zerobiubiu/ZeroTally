/**
 * 约束简报（Workflow B）：
 * - 信息层级：主（12 月或 12 年网格选择，选中项 action 高亮）、次（顶部年份/年份区间切换栏 + 底部单个「本月 / 本年」快捷按钮）、弱（拖拽指示条与关闭按钮）
 * - 复用范围：供「明细」页与「账务分析」页点击年月/年份标题弹出，交互与 DatePickerSheet 严格一致：
 *   1. 月份模式（mode='month'）：展示当年 12 月，左右滑动切年，点顶部年份进入年份区间模式（顶部范围不可点），下方仅保留「本月」按钮；
 *   2. 年份模式（mode='year'）：展示 12 年区间（顶部范围不可点），左右滑动切区间，下方仅保留「本年」按钮
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import {
  getCurrentMonthKey,
  getCurrentYear,
  getYearRangeStart,
  isValidMonthKey,
} from '../../../shared/date/date';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { BottomSheet, type BottomSheetHandle } from '../../../shared/ui/BottomSheet';
import { useTheme } from '../../../theme/theme-context';

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const YEAR_PAGE_SPAN = 12;

type PeriodPickerMode = 'month' | 'year';

interface PeriodPickerSheetProps {
  visible: boolean;
  mode: PeriodPickerMode;
  selectedMonthKey: string;
  selectedYear: number;
  onSelectMonth: (monthKey: string) => void;
  onSelectYear: (year: number) => void;
  onClose: () => void;
}

function chunkIntoRows<T>(items: readonly T[], cols: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += cols) {
    rows.push(items.slice(i, i + cols));
  }
  return rows;
}

export function PeriodPickerSheet({
  visible,
  mode,
  selectedMonthKey,
  selectedYear,
  onSelectMonth,
  onSelectYear,
  onClose,
}: PeriodPickerSheetProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const sheetRef = useRef<BottomSheetHandle>(null);

  const currentMonthKey = getCurrentMonthKey();
  const currentYear = getCurrentYear();
  const baseMonthYear = isValidMonthKey(selectedMonthKey)
    ? Number(selectedMonthKey.slice(0, 4))
    : currentYear;

  const [inYearDrill, setInYearDrill] = useState(false);
  const [browsedYear, setBrowsedYear] = useState<number | null>(null);
  const [browsedYearRangeStart, setBrowsedYearRangeStart] = useState<number | null>(null);

  const showingYears = mode === 'year' || inYearDrill;
  const viewYear = browsedYear ?? (mode === 'month' ? baseMonthYear : selectedYear);
  const yearRangeStart = browsedYearRangeStart ?? getYearRangeStart(viewYear, YEAR_PAGE_SPAN);

  const [slideX] = useState(() => new Animated.Value(0));
  const showingYearsRef = useRef(showingYears);
  const viewYearRef = useRef(viewYear);
  const yearRangeStartRef = useRef(yearRangeStart);

  useEffect(() => {
    showingYearsRef.current = showingYears;
    viewYearRef.current = viewYear;
    yearRangeStartRef.current = yearRangeStart;
  }, [showingYears, viewYear, yearRangeStart]);

  const resetBrowseState = useCallback(() => {
    setInYearDrill(false);
    setBrowsedYear(null);
    setBrowsedYearRangeStart(null);
    slideX.setValue(0);
  }, [slideX]);

  const handleClose = useCallback(() => {
    resetBrowseState();
    onClose();
  }, [onClose, resetBrowseState]);

  const handlePickMonth = useCallback(
    (monthKey: string) => {
      onSelectMonth(monthKey);
      if (sheetRef.current) {
        sheetRef.current.dismiss();
      } else {
        resetBrowseState();
        onClose();
      }
    },
    [onClose, onSelectMonth, resetBrowseState]
  );

  const handlePickYear = useCallback(
    (year: number) => {
      if (mode === 'month') {
        setBrowsedYear(year);
        setInYearDrill(false);
        return;
      }
      onSelectYear(year);
      if (sheetRef.current) {
        sheetRef.current.dismiss();
      } else {
        resetBrowseState();
        onClose();
      }
    },
    [mode, onClose, onSelectYear, resetBrowseState]
  );

  const playStepTransition = useCallback(
    (direction: -1 | 1) => {
      slideX.setValue(direction * 36);
      Animated.timing(slideX, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    },
    [slideX]
  );

  const stepPage = useCallback(
    (direction: -1 | 1) => {
      if (showingYearsRef.current) {
        setBrowsedYearRangeStart(yearRangeStartRef.current + direction * YEAR_PAGE_SPAN);
      } else {
        setBrowsedYear(viewYearRef.current + direction);
      }
      playStepTransition(direction);
    },
    [playStepTransition]
  );

  const swipeGesture = usePanGesture({
    disableReanimated: true,
    runOnJS: true,
    activeOffsetX: [-20, 20],
    failOffsetY: [-18, 18],
    onUpdate: (event) => {
      const clamped = Math.max(-56, Math.min(56, event.translationX * 0.35));
      slideX.setValue(clamped);
    },
    onDeactivate: (event) => {
      const projected = event.translationX + event.velocityX * 0.12;
      if (projected < -45) {
        stepPage(1);
      } else if (projected > 45) {
        stepPage(-1);
      } else {
        Animated.spring(slideX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
          speed: 24,
        }).start();
      }
    },
  });

  const monthRows = useMemo(() => chunkIntoRows(MONTHS, 4), []);
  const yearRows = useMemo(() => {
    const years = Array.from({ length: YEAR_PAGE_SPAN }, (_, idx) => yearRangeStart + idx);
    return chunkIntoRows(years, 4);
  }, [yearRangeStart]);

  const isQuickSelected =
    mode === 'month' ? selectedMonthKey === currentMonthKey : selectedYear === currentYear;
  const quickLabel = mode === 'month' ? '本月' : '本年';

  const handlePressQuick = useCallback(() => {
    if (mode === 'month') {
      handlePickMonth(currentMonthKey);
    } else {
      onSelectYear(currentYear);
      if (sheetRef.current) {
        sheetRef.current.dismiss();
      } else {
        resetBrowseState();
        onClose();
      }
    }
  }, [currentMonthKey, currentYear, handlePickMonth, mode, onClose, onSelectYear, resetBrowseState]);

  const headerTitle = showingYears
    ? `${yearRangeStart}年 - ${yearRangeStart + YEAR_PAGE_SPAN - 1}年`
    : `${viewYear}年`;

  return (
    <BottomSheet
      ref={sheetRef}
      visible={visible}
      onClose={handleClose}
      title={mode === 'month' ? '选择月份' : '选择年份'}
      backdropLabel="关闭周期选择"
    >
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md }}>
          <View style={styles.periodBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showingYears ? '上一组年份' : '上一年'}
              onPress={() => stepPage(-1)}
              hitSlop={8}
              style={styles.navArrow}
            >
              <AppIcon name="chevron-back" size={20} color={theme.colors.text} />
            </Pressable>

            {showingYears ? (
              <View style={styles.periodTitleStatic}>
                <Text
                  style={[
                    styles.tabular,
                    {
                      color: theme.colors.text,
                      fontSize: theme.fontSize.base,
                      fontWeight: theme.fontWeight.semibold,
                    },
                  ]}
                >
                  {headerTitle}
                </Text>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`切换年份，当前 ${headerTitle}`}
                onPress={() => {
                  setBrowsedYearRangeStart(getYearRangeStart(viewYear, YEAR_PAGE_SPAN));
                  setInYearDrill(true);
                }}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.periodTitleBtn,
                  {
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.radius.full,
                  },
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <Text
                  style={[
                    styles.tabular,
                    {
                      color: theme.colors.text,
                      fontSize: theme.fontSize.base,
                      fontWeight: theme.fontWeight.semibold,
                    },
                  ]}
                >
                  {headerTitle}
                </Text>
                <AppIcon name="chevron-down" size={14} color={theme.colors.textMuted} />
              </Pressable>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showingYears ? '下一组年份' : '下一年'}
              onPress={() => stepPage(1)}
              hitSlop={8}
              style={styles.navArrow}
            >
              <AppIcon name="chevron-forward" size={20} color={theme.colors.text} />
            </Pressable>
          </View>

          <GestureDetector gesture={swipeGesture}>
            <View style={styles.swipeViewport}>
              <Animated.View style={{ transform: [{ translateX: slideX }] }}>
                {showingYears ? (
                  <View style={[styles.gridPanel, { gap: theme.spacing.sm }]}>
                    {yearRows.map((row, rowIdx) => (
                      <View key={rowIdx} style={[styles.gridRow, { gap: theme.spacing.sm }]}>
                        {row.map((yr) => {
                          const selected =
                            mode === 'year' ? yr === selectedYear : yr === baseMonthYear;
                          const isCurrent = yr === currentYear;

                          return (
                            <Pressable
                              key={yr}
                              accessibilityRole="button"
                              accessibilityLabel={`${yr}年`}
                              accessibilityState={{ selected }}
                              onPress={() => handlePickYear(yr)}
                              style={({ pressed }) => [
                                styles.gridOption,
                                {
                                  backgroundColor: selected
                                    ? theme.colors.action
                                    : theme.colors.surface,
                                  borderColor:
                                    !selected && isCurrent ? theme.colors.action : 'transparent',
                                  borderWidth:
                                    !selected && isCurrent ? theme.borderWidth.hairline : 0,
                                  borderRadius: theme.radius.md,
                                },
                                pressed && { opacity: theme.opacity.pressed },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.tabular,
                                  {
                                    color: selected
                                      ? theme.colors.onAction
                                      : isCurrent
                                        ? theme.colors.action
                                        : theme.colors.text,
                                    fontSize: theme.fontSize.base,
                                    fontWeight:
                                      selected || isCurrent
                                        ? theme.fontWeight.semibold
                                        : theme.fontWeight.regular,
                                  },
                                ]}
                              >
                                {yr}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={[styles.gridPanel, { gap: theme.spacing.sm }]}>
                    {monthRows.map((row, rowIdx) => (
                      <View key={rowIdx} style={[styles.gridRow, { gap: theme.spacing.sm }]}>
                        {row.map((monthNum) => {
                          const key = `${viewYear}-${String(monthNum).padStart(2, '0')}`;
                          const selected = key === selectedMonthKey;
                          const isCurrent = key === currentMonthKey;

                          return (
                            <Pressable
                              key={key}
                              accessibilityRole="button"
                              accessibilityLabel={`${viewYear}年${monthNum}月`}
                              accessibilityState={{ selected }}
                              onPress={() => handlePickMonth(key)}
                              style={({ pressed }) => [
                                styles.gridOption,
                                {
                                  backgroundColor: selected
                                    ? theme.colors.action
                                    : theme.colors.surface,
                                  borderColor:
                                    !selected && isCurrent ? theme.colors.action : 'transparent',
                                  borderWidth:
                                    !selected && isCurrent ? theme.borderWidth.hairline : 0,
                                  borderRadius: theme.radius.md,
                                },
                                pressed && { opacity: theme.opacity.pressed },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.tabular,
                                  {
                                    color: selected
                                      ? theme.colors.onAction
                                      : isCurrent
                                        ? theme.colors.action
                                        : theme.colors.text,
                                    fontSize: theme.fontSize.base,
                                    fontWeight:
                                      selected || isCurrent
                                        ? theme.fontWeight.semibold
                                        : theme.fontWeight.regular,
                                  },
                                ]}
                              >
                                {monthNum}月
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                )}
              </Animated.View>
            </View>
          </GestureDetector>

          {/* 下方仅保留单个「本月 / 本年」快捷按钮 */}
          <View
            style={[
              styles.quickRow,
              {
                marginTop: theme.spacing.sm,
                paddingTop: theme.spacing.md,
                borderTopColor: theme.colors.border,
                borderTopWidth: theme.borderWidth.hairline,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={quickLabel}
              accessibilityState={{ selected: isQuickSelected }}
              onPress={handlePressQuick}
              style={({ pressed }) => [
                styles.quickChip,
                {
                  backgroundColor: isQuickSelected
                    ? theme.colors.actionSubtle
                    : theme.colors.surface,
                  borderColor: isQuickSelected ? theme.colors.action : theme.colors.border,
                  borderRadius: theme.radius.md,
                },
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <Text
                style={{
                  color: isQuickSelected ? theme.colors.actionTextOnSubtle : theme.colors.text,
                  fontSize: theme.fontSize.sm,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                {quickLabel}
              </Text>
            </Pressable>
          </View>
        </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  periodBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navArrow: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodTitleBtn: {
    minHeight: 36,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  periodTitleStatic: {
    minHeight: 36,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeViewport: {
    minHeight: 224,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  gridPanel: {
    paddingVertical: 12,
  },
  gridRow: {
    flexDirection: 'row',
  },
  gridOption: {
    flex: 1,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickRow: {
    flexDirection: 'row',
  },
  quickChip: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
