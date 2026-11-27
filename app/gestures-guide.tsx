/**
 * 设置内精简「手势与快捷技巧」页：
 * - 单一数据源复用 onboarding/rules.ts，按「极速与批量记账 / 导航与视图 / 明细与高效录入」清晰分组
 * - 无冗余说明段落，每项卡片一行标题 + 手势标签 + 一句说明
 */
import { Stack } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getGroupedGestureTips } from '../src/features/onboarding/rules';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { useTheme } from '../src/theme/theme-context';

export default function GesturesGuideScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const groups = useMemo(() => getGroupedGestureTips(), []);

  return (
    <SafeScreen edges={['left', 'right']} style={{ backgroundColor: theme.colors.surfaceGrouped }}>
      <Stack.Screen options={{ title: '手势与快捷技巧' }} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.xl,
          gap: 16,
        }}
      >
        {groups.map((group) => (
          <View key={group.group} style={{ gap: 8 }}>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
                paddingHorizontal: 4,
              }}
            >
              {group.title}
            </Text>

            <View
              style={[
                styles.card,
                { backgroundColor: theme.colors.surfaceRaised, borderRadius: 14 },
              ]}
            >
              {group.items.map((tip, idx) => (
                <View
                  key={tip.id}
                  style={[
                    styles.row,
                    idx < group.items.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: theme.colors.divider,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.iconWrap,
                      { backgroundColor: theme.colors.actionSurface, borderRadius: 10 },
                    ]}
                  >
                    <AppIcon name={tip.icon} size={18} color={theme.colors.action} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={styles.titleRow}>
                      <Text
                        style={{
                          color: theme.colors.text,
                          fontSize: theme.fontSize.sm,
                          fontWeight: theme.fontWeight.semibold,
                        }}
                      >
                        {tip.title}
                      </Text>
                      <View
                        style={[
                          styles.gestureTag,
                          { backgroundColor: theme.colors.surfaceGrouped, borderRadius: 6 },
                        ]}
                      >
                        <Text
                          style={{
                            color: theme.colors.textSecondary,
                            fontSize: 11,
                            fontWeight: theme.fontWeight.semibold,
                          }}
                        >
                          {tip.gesture}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={{
                        color: theme.colors.textMuted,
                        fontSize: 12,
                        lineHeight: 18,
                        marginTop: 4,
                      }}
                    >
                      {tip.summary}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
  },
  iconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  gestureTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
});
