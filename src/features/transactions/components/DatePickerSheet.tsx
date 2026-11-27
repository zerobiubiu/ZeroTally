/**
 * 约束简报（Workflow B / C）：
 * - 信息层级：主（当前视图主体：月历 / 12 月网格 / 12 年网格，选中项 action 高亮）、次（顶部三层钻取标题栏与底部「前天 / 昨天 / 今天」快捷按钮）、弱（星期表头与拖拽指示条）
 * - 三层钻取与滑动规则：
 *   1. 日期视图：顶部显示「YYYY年M月」（可点进月份视图），左右滑动或点箭头切换月份，下方提供「前天 / 昨天 / 今天」（前天在左、今天在右）；
 *   2. 月份视图：顶部显示「YYYY年」（可点进年份视图），左右滑动切换年份，选月后回到日期视图；
 *   3. 年份视图：顶部显示「YYYY年 - YYYY年」（不可再点击），左右滑动切换 12 年区间，选年后回到月份视图；
 * - 移除了非当月的「本月」快捷按钮；Modal 内部独立包裹 GestureHandlerRootView 以确保 Android 端滑动手势生效
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import {
  formatMonthTitle,
  getCurrentMonthKey,
  getCurrentYear,
  getMonthCalendarCells,
  getTodayIsoDate,
  getYearRangeStart,
  isValidIsoDate,
  shiftIsoDate,
  shiftMonthKey,
} from '../../../shared/date/date';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { BottomSheet, type BottomSheetHandle } from '../../../shared/ui/BottomSheet';
import { useTheme } from '../../../theme/theme-context';

const WEEKDAY_HEADERS = ['一', '二', '三', '四', '五', '六', '日'] as const;
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const YEAR_PAGE_SPAN = 12;

type PickerViewMode = 'day' | 'month' | 'year';

interface DatePickerSheetProps {
  visible: boolean;
  selectedDate: string;
  onSelect: (isoDate: string) => void;
  onClose: () => void;
}

function chunkIntoRows<T>(items: readonly T[], cols: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += cols) {
    rows.push(items.slice(i, i + cols));
  }
  return rows;
}

export function DatePickerSheet({
  visible,
  selectedDate,
  onSelect,
  onClose,
}: DatePickerSheetProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const sheetRef = useRef<BottomSheetHandle>(null);

  const todayIso = getTodayIsoDate();
  const currentMonthKey = getCurrentMonthKey();
  const currentYear = getCurrentYear();
  const defaultMonthKey = isValidIsoDate(selectedDate) ? selectedDate.slice(0, 7) : currentMonthKey;

  const [viewMode, setViewMode] = useState<PickerViewMode>('day');
  const [browsedMonthKey, setBrowsedMonthKey] = useState<string | null>(null);
  const [browsedYear, setBrowsedYear] = useState<number | null>(null);
  const [browsedYearRangeStart, setBrowsedYearRangeStart] = useState<number | null>(null);

  const viewMonthKey = browsedMonthKey ?? defaultMonthKey;
  const viewYear = browsedYear ?? Number(viewMonthKey.slice(0, 4));
  const yearRangeStart = browsedYearRangeStart ?? getYearRangeStart(viewYear, YEAR_PAGE_SPAN);

  const [slideX] = useState(() => new Animated.Value(0));
  const viewModeRef = useRef<PickerViewMode>(viewMode);
  const viewMonthKeyRef = useRef(viewMonthKey);
  const viewYearRef = useRef(viewYear);
  const yearRangeStartRef = useRef(yearRangeStart);

  useEffect(() => {
    viewModeRef.current = viewMode;
    viewMonthKeyRef.current = viewMonthKey;
    viewYearRef.current = viewYear;
    yearRangeStartRef.current = yearRangeStart;
  }, [viewMode, viewMonthKey, viewYear, yearRangeStart]);

  const resetBrowseState = useCallback(() => {
    setViewMode('day');
    setBrowsedMonthKey(null);
    setBrowsedYear(null);
    setBrowsedYearRangeStart(null);
    slideX.setValue(0);
  }, [slideX]);

  const handleClose = useCallback(() => {
    resetBrowseState();
    onClose();
  }, [onClose, resetBrowseState]);

  const handlePickDate = useCallback(
    (isoDate: string) => {
      onSelect(isoDate);
      if (sheetRef.current) {
        sheetRef.current.dismiss();
      } else {
        resetBrowseState();
        onClose();
      }
    },
    [onClose, onSelect, resetBrowseState]
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
      const mode = viewModeRef.current;
      if (mode === 'day') {
        const nextMonth = shiftMonthKey(viewMonthKeyRef.current, direction);
        setBrowsedMonthKey(nextMonth);
        setBrowsedYear(Number(nextMonth.slice(0, 4)));
      } else if (mode === 'month') {
        setBrowsedYear(viewYearRef.current + direction);
      } else {
        setBrowsedYearRangeStart(yearRangeStartRef.current + direction * YEAR_PAGE_SPAN);
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

  // 严格按「前天（左）· 昨天（中）· 今天（右）」排布
  const quickOptions = useMemo(
    () => [
      { label: '前天', value: shiftIsoDate(todayIso, -2) },
      { label: '昨天', value: shiftIsoDate(todayIso, -1) },
      { label: '今天', value: todayIso },
    ],
    [todayIso]
  );

  const calendarWeeks = useMemo(() => {
    const cells = getMonthCalendarCells(viewMonthKey);
    // 补齐至固定 6 行，确保左右滑切不同周数的月份时弹窗高度完全稳定不跳动
    const padded = [...cells];
    while (padded.length < 42) {
      padded.push(null);
    }
    return chunkIntoRows(padded, 7);
  }, [viewMonthKey]);

  const monthRows = useMemo(() => chunkIntoRows(MONTHS, 4), []);
  const yearRows = useMemo(() => {
    const years = Array.from({ length: YEAR_PAGE_SPAN }, (_, idx) => yearRangeStart + idx);
    return chunkIntoRows(years, 4);
  }, [yearRangeStart]);

  const selectedMonthKey = isValidIsoDate(selectedDate) ? selectedDate.slice(0, 7) : '';
  const selectedYear = isValidIsoDate(selectedDate) ? Number(selectedDate.slice(0, 4)) : -1;

  const handlePressHeaderTitle = () => {
    if (viewMode === 'day') {
      setBrowsedYear(Number(viewMonthKey.slice(0, 4)));
      setViewMode('month');
    } else if (viewMode === 'month') {
      setBrowsedYearRangeStart(getYearRangeStart(viewYear, YEAR_PAGE_SPAN));
      setViewMode('year');
    }
    // year 视图下顶部年份范围不再响应点击
  };

  const prevAccessibilityLabel =
    viewMode === 'day' ? '上一个月' : viewMode === 'month' ? '上一年' : '上一组年份';
  const nextAccessibilityLabel =
    viewMode === 'day' ? '下一个月' : viewMode === 'month' ? '下一年' : '下一组年份';

  const headerTitleText =
    viewMode === 'day'
      ? formatMonthTitle(viewMonthKey)
      : viewMode === 'month'
        ? `${viewYear}年`
        : `${yearRangeStart}年 - ${yearRangeStart + YEAR_PAGE_SPAN - 1}年`;

  return (
    <BottomSheet
      ref={sheetRef}
      visible={visible}
      onClose={handleClose}
      title="选择日期"
      backdropLabel="关闭日期选择"
    >
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md }}>
          {/* 顶部周期切换头：日期态点年月进选月、月份态点年份进选年、年份范围态不可点击 */}
          <View style={styles.periodBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={prevAccessibilityLabel}
              onPress={() => stepPage(-1)}
              hitSlop={8}
              style={styles.navArrow}
            >
              <AppIcon name="chevron-back" size={20} color={theme.colors.text} />
            </Pressable>

            {viewMode === 'year' ? (
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
                  {headerTitleText}
                </Text>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  viewMode === 'day'
                    ? `切换月份，当前 ${headerTitleText}`
                    : `切换年份，当前 ${headerTitleText}`
                }
                onPress={handlePressHeaderTitle}
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
                  {headerTitleText}
                </Text>
                <AppIcon name="chevron-down" size={14} color={theme.colors.textMuted} />
              </Pressable>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={nextAccessibilityLabel}
              onPress={() => stepPage(1)}
              hitSlop={8}
              style={styles.navArrow}
            >
              <AppIcon name="chevron-forward" size={20} color={theme.colors.text} />
            </Pressable>
          </View>

          {/* 可左右滑动的主选择区（日历 / 12 月 / 12 年区间），与外层向下滑动关闭物理正交 */}
          <GestureDetector gesture={swipeGesture}>
            <View style={styles.swipeViewport}>
              <Animated.View style={{ transform: [{ translateX: slideX }] }}>
                {viewMode === 'day' ? (
                  <View>
                    <View style={[styles.weekRow, { marginTop: theme.spacing.sm }]}>
                      {WEEKDAY_HEADERS.map((wd) => (
                        <View key={wd} style={styles.weekdayCell}>
                          <Text
                            style={{
                              color: theme.colors.textMuted,
                              fontSize: theme.fontSize.xs,
                            }}
                          >
                            {wd}
                          </Text>
                        </View>
                      ))}
                    </View>

                    <View style={{ marginTop: theme.spacing.xs, gap: 2 }}>
                      {calendarWeeks.map((week, weekIdx) => (
                        <View key={weekIdx} style={styles.weekRow}>
                          {week.map((iso, dayIdx) => {
                            if (!iso) {
                              return <View key={`pad_${dayIdx}`} style={styles.dayCell} />;
                            }
                            const selected = iso === selectedDate;
                            const isToday = iso === todayIso;
                            const dayNum = Number(iso.slice(8, 10));

                            return (
                              <Pressable
                                key={iso}
                                accessibilityRole="button"
                                accessibilityLabel={iso}
                                accessibilityState={{ selected }}
                                onPress={() => handlePickDate(iso)}
                                style={styles.dayCell}
                              >
                                <View
                                  style={[
                                    styles.dayCircle,
                                    {
                                      backgroundColor: selected
                                        ? theme.colors.action
                                        : 'transparent',
                                      borderColor:
                                        !selected && isToday ? theme.colors.action : 'transparent',
                                      borderWidth:
                                        !selected && isToday ? theme.borderWidth.hairline : 0,
                                      borderRadius: theme.radius.full,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.tabular,
                                      {
                                        color: selected
                                          ? theme.colors.onAction
                                          : isToday
                                            ? theme.colors.action
                                            : theme.colors.text,
                                        fontSize: theme.fontSize.sm,
                                        fontWeight:
                                          selected || isToday
                                            ? theme.fontWeight.semibold
                                            : theme.fontWeight.regular,
                                      },
                                    ]}
                                  >
                                    {dayNum}
                                  </Text>
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  </View>
                ) : viewMode === 'month' ? (
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
                              onPress={() => {
                                setBrowsedMonthKey(key);
                                setViewMode('day');
                              }}
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
                ) : (
                  <View style={[styles.gridPanel, { gap: theme.spacing.sm }]}>
                    {yearRows.map((row, rowIdx) => (
                      <View key={rowIdx} style={[styles.gridRow, { gap: theme.spacing.sm }]}>
                        {row.map((yr) => {
                          const selected = yr === selectedYear;
                          const isCurrent = yr === currentYear;

                          return (
                            <Pressable
                              key={yr}
                              accessibilityRole="button"
                              accessibilityLabel={`${yr}年`}
                              accessibilityState={{ selected }}
                              onPress={() => {
                                setBrowsedYear(yr);
                                setViewMode('month');
                              }}
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
                )}
              </Animated.View>
            </View>
          </GestureDetector>

          {/* 快捷按钮置于日历表下方：前天（左）· 昨天（中）· 今天（右） */}
          <View
            style={[
              styles.quickRow,
              {
                gap: theme.spacing.sm,
                marginTop: theme.spacing.md,
                paddingTop: theme.spacing.md,
                borderTopColor: theme.colors.border,
                borderTopWidth: theme.borderWidth.hairline,
              },
            ]}
          >
            {quickOptions.map((opt) => {
              const selected = selectedDate === opt.value;
              return (
                <Pressable
                  key={opt.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => handlePickDate(opt.value)}
                  style={({ pressed }) => [
                    styles.quickChip,
                    {
                      backgroundColor: selected
                        ? theme.colors.actionSubtle
                        : theme.colors.surface,
                      borderColor: selected ? theme.colors.action : theme.colors.border,
                      borderRadius: theme.radius.md,
                    },
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <Text
                    style={{
                      color: selected
                        ? theme.colors.actionTextOnSubtle
                        : theme.colors.textSecondary,
                      fontSize: theme.fontSize.sm,
                      fontWeight: selected
                        ? theme.fontWeight.semibold
                        : theme.fontWeight.regular,
                    }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
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
    minHeight: 284,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekdayCell: {
    flex: 1,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCell: {
    flex: 1,
    height: 39,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridPanel: {
    paddingVertical: 16,
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
