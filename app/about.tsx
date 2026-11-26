/**
 * 约束简报（Workflow B）：
 * - 信息层级：主（顶部品牌徽章 + 应用名与版本号）、次（软件核心特性清单与开源仓库入口）、弱（版权与协议说明）
 */
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticLight } from '../src/shared/haptics/haptics';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { useTheme } from '../src/theme/theme-context';

const REPO_URL = 'https://github.com/zerobiubiu/ZeroTally';

export default function AboutScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const highlights: readonly { icon: string; title: string; subtitle: string }[] = [
    {
      icon: 'shield-checkmark-outline',
      title: '纯本地离线存储',
      subtitle: '全部数据存于本机 SQLite，无需注册账号，不上传云端',
    },
    {
      icon: 'calculator-outline',
      title: '整数「分」原子记账',
      subtitle: '杜绝浮点误差，收支、退款与账户余额在单一事务内同步',
    },
    {
      icon: 'code-working-outline',
      title: '开放 JSON 格式无锁定',
      subtitle: '支持完整备份与分类配置导入导出，数据完全归你掌控',
    },
  ];

  return (
    <SafeScreen edges={['left', 'right']}>
      <Stack.Screen options={{ title: '关于' }} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.xl,
          gap: theme.spacing.lg,
        }}
      >
        <View
          style={[
            styles.brandCard,
            theme.elevation.card,
            {
              backgroundColor: theme.colors.heroBg,
              borderRadius: theme.radius.lg,
              paddingVertical: theme.spacing.xl,
              paddingHorizontal: theme.spacing.lg,
            },
          ]}
        >
          <View
            style={[
              styles.logoBadge,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderRadius: theme.radius.lg,
              },
            ]}
          >
            <AppIcon name="wallet-outline" size={30} color={theme.colors.action} />
          </View>
          <Text
            style={{
              color: theme.colors.heroText,
              fontSize: theme.fontSize.xxl,
              fontWeight: theme.fontWeight.semibold,
              marginTop: theme.spacing.md,
              letterSpacing: -0.4,
            }}
          >
            ZeroTally
          </Text>
          <Text
            style={{
              color: theme.colors.heroSubtext,
              fontSize: theme.fontSize.sm,
              marginTop: theme.spacing.xs,
            }}
          >
            版本 v{appVersion} · 本地离线个人记账与资产管理
          </Text>
        </View>

        <View
          style={[
            styles.infoCard,
            theme.elevation.card,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderRadius: theme.radius.lg,
            },
          ]}
        >
          {highlights.map((item, idx) => (
            <View
              key={item.title}
              style={[
                styles.featureRow,
                {
                  paddingHorizontal: theme.spacing.lg,
                  paddingVertical: theme.spacing.md,
                  borderBottomColor: theme.colors.border,
                  borderBottomWidth: idx < highlights.length - 1 ? theme.borderWidth.hairline : 0,
                },
              ]}
            >
              <View
                style={[
                  styles.featureIcon,
                  {
                    backgroundColor: theme.colors.actionSubtle,
                    borderRadius: theme.radius.full,
                  },
                ]}
              >
                <AppIcon name={item.icon} size={18} color={theme.colors.actionTextOnSubtle} />
              </View>
              <View style={styles.featureBody}>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontSize: theme.fontSize.base,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  {item.title}
                </Text>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontSize: theme.fontSize.xs,
                    marginTop: 2,
                    lineHeight: 18,
                  }}
                >
                  {item.subtitle}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View
          style={[
            styles.infoCard,
            theme.elevation.card,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderRadius: theme.radius.lg,
            },
          ]}
        >
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="打开 GitHub 开源仓库"
            onPress={() => {
              hapticLight();
              void Linking.openURL(REPO_URL).catch(() => {});
            }}
            style={({ pressed }) => [
              styles.linkRow,
              {
                paddingHorizontal: theme.spacing.lg,
                borderBottomColor: theme.colors.border,
                borderBottomWidth: theme.borderWidth.hairline,
              },
              pressed && { opacity: theme.opacity.pressed },
            ]}
          >
            <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.base }}>
              开源仓库
            </Text>
            <View style={styles.linkRight}>
              <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                GitHub
              </Text>
              <AppIcon name="open-outline" size={16} color={theme.colors.textMuted} />
            </View>
          </Pressable>

          <View style={[styles.linkRow, { paddingHorizontal: theme.spacing.lg }]}>
            <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.base }}>
              开源协议
            </Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.sm }}>
              MIT License
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  brandCard: {
    alignItems: 'center',
  },
  logoBadge: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCard: {
    overflow: 'hidden',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureBody: {
    flex: 1,
    minWidth: 0,
  },
  linkRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linkRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
