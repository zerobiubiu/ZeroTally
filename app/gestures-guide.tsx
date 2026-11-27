/**
 * 设置内精简「手势与快捷技巧」页：
 * - 单一数据源复用 onboarding/rules.ts，并统一基于 SurfaceCard / SectionHeader / InsetDivider 原子组件装配
 */
import { Stack } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getGroupedGestureTips } from '../src/features/onboarding/rules';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { InsetDivider } from '../src/shared/ui/InsetDivider';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { SectionHeader } from '../src/shared/ui/SectionHeader';
import { SurfaceCard } from '../src/shared/ui/SurfaceCard';
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
          padding: 16,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
          gap: 16,
        }}
      >
        {groups.map((group) => (
          <View key={group.group}>
            <SectionHeader title={group.title} />

            <SurfaceCard>
              {group.items.map((tip, idx) => (
                <View key={tip.id}>
                  <View style={styles.row}>
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
                  {idx < group.items.length - 1 ? <InsetDivider /> : null}
                </View>
              ))}
            </SurfaceCard>
          </View>
        ))}
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
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
