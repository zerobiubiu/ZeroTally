/**
 * 约束简报（Workflow B）：
 * - 信息层级：主（顶部品牌徽章 + 应用名与版本号）、次（软件核心特性清单与隐私/开源入口）、弱（协议说明）
 * - 视觉统一：复用 SurfaceCard、SettingLinkRow 与 InsetDivider，保持原内容结构与重心不变
 */
import Constants from 'expo-constants';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticLight } from '../src/shared/haptics/haptics';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { InsetDivider } from '../src/shared/ui/InsetDivider';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { SettingLinkRow } from '../src/shared/ui/SettingRow';
import { SurfaceCard } from '../src/shared/ui/SurfaceCard';
import { useTheme } from '../src/theme/theme-context';

const REPO_URL = 'https://github.com/zerobiubiu/ZeroTally';

export default function AboutScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const appVersion = Constants.expoConfig?.version ?? '2.0.0';

  const highlights: readonly { icon: string; title: string; subtitle: string }[] = [
    {
      icon: 'shield-checkmark-outline',
      title: '本地优先，主权归己',
      subtitle: '账本默认存于本机 SQLite 无需注册；仅在主动配置 WebDAV 或 Google Drive 后同步至自有网盘',
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
    <SafeScreen edges={['left', 'right']} style={{ backgroundColor: theme.colors.surfaceGrouped }}>
      <Stack.Screen options={{ title: '关于' }} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
          gap: 14,
        }}
      >
        <View
          style={[
            styles.brandCard,
            {
              backgroundColor: theme.colors.heroBg,
              borderRadius: 14,
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
                borderRadius: 14,
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

        <SurfaceCard>
          {highlights.map((item, idx) => (
            <View key={item.title}>
              <View style={styles.featureRow}>
                <View
                  style={[
                    styles.featureIcon,
                    {
                      backgroundColor: theme.colors.actionSurface,
                      borderRadius: 10,
                    },
                  ]}
                >
                  <AppIcon name={item.icon} size={18} color={theme.colors.action} />
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
              {idx < highlights.length - 1 ? <InsetDivider /> : null}
            </View>
          ))}
        </SurfaceCard>

        <SurfaceCard>
          <SettingLinkRow
            title="隐私说明"
            accessibilityLabel="查看隐私说明"
            onPress={() => {
              hapticLight();
              router.push('/privacy');
            }}
            showDivider
          />
          <SettingLinkRow
            title="开源仓库"
            accessibilityRole="link"
            accessibilityLabel="打开 GitHub 开源仓库"
            onPress={() => {
              hapticLight();
              void Linking.openURL(REPO_URL).catch(() => {});
            }}
            rightAccessory={
              <View style={styles.linkRight}>
                <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                  GitHub
                </Text>
                <AppIcon name="open-outline" size={16} color={theme.colors.textMuted} />
              </View>
            }
            showDivider
          />
          <SettingLinkRow title="开源协议" valueText="MIT License" showChevron={false} />
        </SurfaceCard>
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
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
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
  linkRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
