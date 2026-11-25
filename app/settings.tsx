/**
 * 约束简报（Workflow B / C）：
 * - 信息层级：主（账本数据概览）、次（分类管理、外观、结构化 JSON/CSV 导出）、弱（存储/版本与重置危险操作）
 * - 数据导出：支持导出标准可读的 JSON（完整账本结构）与 UTF-8 BOM CSV（流水表格），提供本地目录保存与系统分享两种交付方式
 * - 文案密度：无冗余功能说明，保留不可逆操作风险提示与导出结果反馈
 */
import Constants from 'expo-constants';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../src/db/database-context';
import { getDatabaseStats, resetDatabase, type DatabaseStats } from '../src/db/seed';
import {
  saveExportArtifactToDirectory,
  shareExportArtifact,
} from '../src/features/export/native-io';
import { generateLedgerExport } from '../src/features/export/service';
import type { ExportFormat } from '../src/features/export/types';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { useTheme, type ThemePreference } from '../src/theme/theme-context';

const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: '系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

export default function SettingsScreen(): React.JSX.Element {
  const { theme, preference, setPreference } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { db, revision, notifyChange } = useDatabase();

  const [stats, setStats] = useState<DatabaseStats>({
    transactionCount: 0,
    activeAccountCount: 0,
    archivedAccountCount: 0,
    activeCategoryCount: 0,
  });
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const data = await getDatabaseStats(db);
      if (active) {
        setStats(data);
      }
    })();
    return () => {
      active = false;
    };
  }, [db, revision]);

  const handleExport = async (format: ExportFormat, target: 'save' | 'share') => {
    setExportingFormat(format);
    try {
      const artifact = await generateLedgerExport(db, format);
      if (target === 'save') {
        const res = await saveExportArtifactToDirectory(artifact);
        if (res.saved) {
          Alert.alert(
            '导出成功',
            `${artifact.filename}（${artifact.transactionCount} 笔账目）`
          );
        }
      } else {
        await shareExportArtifact(artifact);
      }
    } catch (err) {
      Alert.alert('导出失败', err instanceof Error ? err.message : '无法写入或分享文件');
    } finally {
      setExportingFormat(null);
    }
  };

  const handleChooseExportMethod = (format: ExportFormat) => {
    const label = format === 'json' ? 'JSON' : 'CSV';
    Alert.alert(`导出 ${label}`, `含 ${stats.transactionCount} 笔账目`, [
      { text: '取消', style: 'cancel' },
      {
        text: '保存到文件夹',
        onPress: () => void handleExport(format, 'save'),
      },
      {
        text: '分享',
        onPress: () => void handleExport(format, 'share'),
      },
    ]);
  };

  const handleResetBook = () => {
    Alert.alert('重置账本', '将清空全部账目、自定义账户与分类，无法撤销。', [
      { text: '取消', style: 'cancel' },
      {
        text: '重置',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await resetDatabase(db);
            notifyChange();
          })();
        },
      },
    ]);
  };

  const appVersion = Constants.expoConfig?.version ?? '0.1.0';

  return (
    <SafeScreen edges={['left', 'right']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: theme.spacing.lg,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.xl,
        }}
      >
        <Stack.Screen options={{ title: '设置' }} />

        <View
          style={[
            styles.statsCard,
            theme.elevation.card,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderRadius: theme.radius.lg,
              padding: theme.spacing.lg,
            },
          ]}
        >
          <View style={styles.statItem}>
            <Text
              style={[
                styles.tabular,
                {
                  color: theme.colors.text,
                  fontSize: theme.fontSize.xxl,
                  fontWeight: theme.fontWeight.semibold,
                },
              ]}
            >
              {stats.transactionCount}
            </Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 4 }}>
              账目
            </Text>
          </View>

          <View style={[styles.statDivider, { backgroundColor: theme.colors.border }]} />

          <View style={styles.statItem}>
            <Text
              style={[
                styles.tabular,
                {
                  color: theme.colors.text,
                  fontSize: theme.fontSize.xxl,
                  fontWeight: theme.fontWeight.semibold,
                },
              ]}
            >
              {stats.activeAccountCount}
            </Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 4 }}>
              账户
            </Text>
          </View>

          <View style={[styles.statDivider, { backgroundColor: theme.colors.border }]} />

          <View style={styles.statItem}>
            <Text
              style={[
                styles.tabular,
                {
                  color: theme.colors.text,
                  fontSize: theme.fontSize.xxl,
                  fontWeight: theme.fontWeight.semibold,
                },
              ]}
            >
              {stats.activeCategoryCount}
            </Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 4 }}>
              分类
            </Text>
          </View>
        </View>

        {/* 配置 */}
        <View style={{ marginTop: theme.spacing.xl }}>
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: theme.fontSize.xs,
              fontWeight: theme.fontWeight.semibold,
              marginBottom: theme.spacing.sm,
              paddingHorizontal: 4,
            }}
          >
            配置
          </Text>

          <View
            style={[
              styles.groupCard,
              theme.elevation.card,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderRadius: theme.radius.lg,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="分类管理"
              onPress={() => router.push('/categories')}
              style={({ pressed }) => [
                styles.menuRow,
                {
                  paddingHorizontal: theme.spacing.lg,
                  borderBottomColor: theme.colors.border,
                  borderBottomWidth: theme.borderWidth.hairline,
                },
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <View style={styles.menuLeft}>
                <AppIcon name="pricetags-outline" size={20} color={theme.colors.action} />
                <Text
                  style={{
                    color: theme.colors.text,
                    fontSize: theme.fontSize.base,
                    marginLeft: theme.spacing.md,
                  }}
                >
                  分类管理
                </Text>
              </View>
              <AppIcon name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </Pressable>

            <View style={{ padding: theme.spacing.lg }}>
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: theme.fontSize.base,
                  marginBottom: theme.spacing.md,
                }}
              >
                外观
              </Text>
              <View
                style={[
                  styles.segmentContainer,
                  {
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.radius.md,
                    padding: theme.spacing.xs,
                  },
                ]}
              >
                {THEME_OPTIONS.map((opt) => {
                  const selected = preference === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setPreference(opt.value)}
                      style={[
                        styles.segmentItem,
                        {
                          borderRadius: theme.radius.sm,
                          backgroundColor: selected ? theme.colors.surfaceRaised : 'transparent',
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: selected ? theme.colors.text : theme.colors.textMuted,
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
          </View>
        </View>

        {/* 数据导出（标准结构化 JSON / CSV） */}
        <View style={{ marginTop: theme.spacing.xl }}>
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: theme.fontSize.xs,
              fontWeight: theme.fontWeight.semibold,
              marginBottom: theme.spacing.sm,
              paddingHorizontal: 4,
            }}
          >
            数据导出
          </Text>

          <View
            style={[
              styles.groupCard,
              theme.elevation.card,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderRadius: theme.radius.lg,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="导出 JSON"
              disabled={exportingFormat !== null}
              onPress={() => handleChooseExportMethod('json')}
              style={({ pressed }) => [
                styles.menuRow,
                {
                  paddingHorizontal: theme.spacing.lg,
                  borderBottomColor: theme.colors.border,
                  borderBottomWidth: theme.borderWidth.hairline,
                },
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <View style={styles.menuLeft}>
                <AppIcon name="code-slash-outline" size={20} color={theme.colors.action} />
                <Text
                  style={{
                    color: theme.colors.text,
                    fontSize: theme.fontSize.base,
                    marginLeft: theme.spacing.md,
                  }}
                >
                  导出 JSON
                </Text>
              </View>
              <View style={styles.menuRight}>
                <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                  {exportingFormat === 'json' ? '导出中' : '完整账本'}
                </Text>
                <AppIcon name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="导出 CSV"
              disabled={exportingFormat !== null}
              onPress={() => handleChooseExportMethod('csv')}
              style={({ pressed }) => [
                styles.menuRow,
                { paddingHorizontal: theme.spacing.lg },
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <View style={styles.menuLeft}>
                <AppIcon name="document-text-outline" size={20} color={theme.colors.action} />
                <Text
                  style={{
                    color: theme.colors.text,
                    fontSize: theme.fontSize.base,
                    marginLeft: theme.spacing.md,
                  }}
                >
                  导出 CSV
                </Text>
              </View>
              <View style={styles.menuRight}>
                <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                  {exportingFormat === 'csv' ? '导出中' : '明细表格'}
                </Text>
                <AppIcon name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </View>
            </Pressable>
          </View>
        </View>

        {/* 系统 */}
        <View style={{ marginTop: theme.spacing.xl }}>
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: theme.fontSize.xs,
              fontWeight: theme.fontWeight.semibold,
              marginBottom: theme.spacing.sm,
              paddingHorizontal: 4,
            }}
          >
            系统
          </Text>

          <View
            style={[
              styles.groupCard,
              theme.elevation.card,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderRadius: theme.radius.lg,
              },
            ]}
          >
            <View
              style={[
                styles.infoRow,
                {
                  paddingHorizontal: theme.spacing.lg,
                  borderBottomColor: theme.colors.border,
                  borderBottomWidth: theme.borderWidth.hairline,
                },
              ]}
            >
              <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.base }}>
                存储
              </Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.sm }}>
                本地 SQLite
              </Text>
            </View>

            <View
              style={[
                styles.infoRow,
                {
                  paddingHorizontal: theme.spacing.lg,
                  borderBottomColor: theme.colors.border,
                  borderBottomWidth: theme.borderWidth.hairline,
                },
              ]}
            >
              <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.base }}>
                版本
              </Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.sm }}>
                v{appVersion}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="重置账本"
              onPress={handleResetBook}
              style={({ pressed }) => [
                styles.menuRow,
                { paddingHorizontal: theme.spacing.lg },
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <Text
                style={{
                  color: theme.colors.expense,
                  fontSize: theme.fontSize.base,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                重置账本
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 32,
  },
  groupCard: {
    overflow: 'hidden',
  },
  menuRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  segmentContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
