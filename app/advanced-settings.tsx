/**
 * 约束简报（Workflow B / C）：
 * - 职责边界：收口「完整配置与数据 JSON 导出」「JSON 校验与原子导入恢复」「4 位随机验证码清空账本」三大高阶数据管理能力
 * - 安全与一致化：所有确认与结果反馈统一走 ActionSheet / ConfirmDialog / ClearLedgerDialog，零原生 Alert.alert
 */
import { Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../src/db/database-context';
import { getDatabaseStats, resetDatabase, type DatabaseStats } from '../src/db/seed';
import { suppressAutoCloudBackup } from '../src/features/cloud-backup/service';
import {
  pickJsonFileText,
  saveExportArtifactToDirectory,
  shareExportArtifact,
} from '../src/features/export/native-io';
import {
  generateLedgerExport,
  importFullLedgerBackup,
  parseAndValidateFullBackup,
} from '../src/features/export/service';
import type { ValidatedLedgerImport } from '../src/features/export/types';
import { ClearLedgerDialog } from '../src/features/settings/components/ClearLedgerDialog';
import {
  hapticLight,
  hapticMedium,
  hapticSuccess,
  hapticWarning,
} from '../src/shared/haptics/haptics';
import { ActionSheet } from '../src/shared/ui/ActionSheet';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { ConfirmDialog } from '../src/shared/ui/ConfirmDialog';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { useTheme } from '../src/theme/theme-context';

export default function AdvancedSettingsScreen(): React.JSX.Element {
  const { theme, setPreference } = useTheme();
  const insets = useSafeAreaInsets();
  const { db, revision, notifyChange } = useDatabase();

  const [stats, setStats] = useState<DatabaseStats>({
    transactionCount: 0,
    activeAccountCount: 0,
    archivedAccountCount: 0,
    activeCategoryCount: 0,
  });

  const [exportSheetOpen, setExportSheetOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [pendingImport, setPendingImport] = useState<{
    filename: string;
    validated: ValidatedLedgerImport;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearConfirmSheetOpen, setClearConfirmSheetOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const [noticeDialog, setNoticeDialog] = useState<{
    title: string;
    message: string;
    tone: 'primary' | 'destructive';
    icon: string;
  } | null>(null);

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

  const handleExportJson = async (target: 'save' | 'share') => {
    setExporting(true);
    try {
      const artifact = await generateLedgerExport(db);
      if (target === 'save') {
        const res = await saveExportArtifactToDirectory(artifact);
        if (res.saved) {
          hapticSuccess();
          setNoticeDialog({
            title: '导出成功',
            message: `${artifact.filename}（含 ${artifact.transactionCount} 笔账目、${artifact.accountCount} 个账户、${artifact.categoryCount} 个分类及外观配置，已附完整性校验）`,
            tone: 'primary',
            icon: 'checkmark-circle-outline',
          });
        }
      } else {
        await shareExportArtifact(artifact);
      }
    } catch (err) {
      hapticWarning();
      setNoticeDialog({
        title: '导出失败',
        message: err instanceof Error ? err.message : '无法写入或分享 JSON 文件',
        tone: 'destructive',
        icon: 'alert-circle-outline',
      });
    } finally {
      setExporting(false);
    }
  };

  const handlePickImportFile = async () => {
    hapticLight();
    try {
      const res = await pickJsonFileText();
      if (res.cancelled || res.content === undefined) {
        return;
      }
      const validated = parseAndValidateFullBackup(res.content);
      setImportError(null);
      setPendingImport({
        filename: res.filename ?? 'backup.json',
        validated,
      });
    } catch (err) {
      hapticWarning();
      setNoticeDialog({
        title: 'JSON 校验未通过',
        message: err instanceof Error ? err.message : '无法解析所选文件',
        tone: 'destructive',
        icon: 'alert-circle-outline',
      });
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingImport || importing) {
      return;
    }
    setImporting(true);
    setImportError(null);
    try {
      suppressAutoCloudBackup(25_000);
      const summary = await importFullLedgerBackup(db, pendingImport.validated.payload);
      setPreference(summary.themePreference);
      setPendingImport(null);
      notifyChange();
      hapticSuccess();
      setNoticeDialog({
        title: '导入恢复成功',
        message: `已恢复 ${summary.transactionCount} 笔账目、${summary.accountCount} 个账户、${summary.categoryCount} 个分类与外观配置。`,
        tone: 'primary',
        icon: 'checkmark-circle-outline',
      });
    } catch (err) {
      hapticWarning();
      setImportError(err instanceof Error ? err.message : '导入恢复失败，原数据未受影响');
    } finally {
      setImporting(false);
    }
  };

  const handlePassVerificationCode = () => {
    hapticMedium();
    setClearDialogOpen(false);
    setClearError(null);
    setClearConfirmSheetOpen(true);
  };

  const handleConfirmClear = async () => {
    if (clearing) {
      return;
    }
    setClearing(true);
    setClearError(null);
    try {
      suppressAutoCloudBackup(25_000);
      await resetDatabase(db);
      setClearConfirmSheetOpen(false);
      notifyChange();
      hapticSuccess();
      setNoticeDialog({
        title: '账本已清空',
        message: '已删除全部明细与快捷模板，账户已重置为「钱包（¥0.00）」，分类已恢复默认设置。',
        tone: 'primary',
        icon: 'checkmark-circle-outline',
      });
    } catch (err) {
      hapticWarning();
      setNoticeDialog({
        title: '清空失败',
        message: err instanceof Error ? err.message : '无法完成清空操作',
        tone: 'destructive',
        icon: 'alert-circle-outline',
      });
    } finally {
      setClearing(false);
    }
  };

  return (
    <SafeScreen edges={['left', 'right']}>
      <Stack.Screen options={{ title: '高级设置' }} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.xl,
          gap: theme.spacing.md,
        }}
      >
        {/* 导出完整 JSON */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="导出完整备份 JSON"
          disabled={exporting}
          onPress={() => {
            hapticLight();
            setExportSheetOpen(true);
          }}
          style={({ pressed }) => [
            styles.actionCard,
            theme.elevation.card,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderRadius: theme.radius.lg,
              padding: theme.spacing.md,
              opacity: exporting ? theme.opacity.disabled : 1,
            },
            pressed && !exporting && { opacity: theme.opacity.pressed },
          ]}
        >
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: theme.colors.actionSubtle, borderRadius: theme.radius.full },
            ]}
          >
            <AppIcon name="download-outline" size={20} color={theme.colors.actionTextOnSubtle} />
          </View>
          <View style={styles.cardBody}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: theme.fontSize.base,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              导出数据与配置（JSON）
            </Text>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSize.xs,
                marginTop: 2,
              }}
            >
              完整导出账目、账户、分类、快捷模板与外观配置，附校验指纹
            </Text>
          </View>
          {exporting ? (
            <ActivityIndicator size="small" color={theme.colors.action} />
          ) : (
            <AppIcon name="chevron-forward" size={18} color={theme.colors.textMuted} />
          )}
        </Pressable>

        {/* 导入完整 JSON */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="导入恢复备份 JSON"
          disabled={importing}
          onPress={() => void handlePickImportFile()}
          style={({ pressed }) => [
            styles.actionCard,
            theme.elevation.card,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderRadius: theme.radius.lg,
              padding: theme.spacing.md,
              opacity: importing ? theme.opacity.disabled : 1,
            },
            pressed && !importing && { opacity: theme.opacity.pressed },
          ]}
        >
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: theme.colors.transferSubtle, borderRadius: theme.radius.full },
            ]}
          >
            <AppIcon name="push-outline" size={20} color={theme.colors.transferTextOnSubtle} />
          </View>
          <View style={styles.cardBody}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: theme.fontSize.base,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              导入并恢复（JSON）
            </Text>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSize.xs,
                marginTop: 2,
              }}
            >
              校验完整性与外键后完整覆盖恢复账本与配置
            </Text>
          </View>
          <AppIcon name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </Pressable>

        {/* 清空账本 */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="清空账本"
          onPress={() => {
            hapticMedium();
            setClearError(null);
            setClearDialogOpen(true);
          }}
          style={({ pressed }) => [
            styles.actionCard,
            theme.elevation.card,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderRadius: theme.radius.lg,
              padding: theme.spacing.md,
              marginTop: theme.spacing.md,
            },
            pressed && { opacity: theme.opacity.pressed },
          ]}
        >
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: theme.colors.expenseSubtle, borderRadius: theme.radius.full },
            ]}
          >
            <AppIcon name="trash-outline" size={20} color={theme.colors.expense} />
          </View>
          <View style={styles.cardBody}>
            <Text
              style={{
                color: theme.colors.expense,
                fontSize: theme.fontSize.base,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              清空账本
            </Text>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSize.xs,
                marginTop: 2,
              }}
            >
              删除全部明细并仅保留「钱包（¥0.00）」，需输入 4 位验证码确认
            </Text>
          </View>
          <AppIcon name="chevron-forward" size={18} color={theme.colors.expense} />
        </Pressable>
      </ScrollView>

      <ActionSheet
        visible={exportSheetOpen}
        title="导出完整 JSON 备份"
        subtitle="包含账目、账户、分类、快捷模板与外观配置"
        onClose={() => setExportSheetOpen(false)}
        options={[
          {
            key: 'save',
            label: '保存到本地文件夹',
            subtitle: '写入设备目录，方便长期离线留存或迁移',
            icon: 'folder-open-outline',
            onPress: () => void handleExportJson('save'),
          },
          {
            key: 'share',
            label: '通过系统分享',
            subtitle: '发送到其他应用或跨设备传输',
            icon: 'share-social-outline',
            onPress: () => void handleExportJson('share'),
          },
        ]}
      />

      <ConfirmDialog
        visible={pendingImport !== null}
        title="确认覆盖导入恢复？"
        message={
          pendingImport
            ? `文件「${pendingImport.filename}」已通过结构与外键校验，确认后将完整替换当前账本数据与配置。`
            : ''
        }
        icon="push-outline"
        tone="primary"
        confirmLabel="确认恢复"
        loading={importing}
        error={importError}
        onCancel={() => {
          if (!importing) {
            setPendingImport(null);
            setImportError(null);
          }
        }}
        onConfirm={() => void handleConfirmImport()}
      >
        {pendingImport ? (
          <View style={{ gap: theme.spacing.sm }}>
            <View
              style={[
                styles.previewBox,
                {
                  backgroundColor: theme.colors.surface,
                  borderRadius: theme.radius.md,
                  padding: theme.spacing.md,
                  gap: theme.spacing.xs,
                },
              ]}
            >
              <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold }}>
                账目 {pendingImport.validated.payload.summary.transactionCount} 笔 · 账户{' '}
                {pendingImport.validated.payload.summary.accountCount} 个 · 分类{' '}
                {pendingImport.validated.payload.summary.categoryCount} 个
              </Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                快捷模板 {pendingImport.validated.payload.summary.quickTemplateCount} 项 · 校验指纹
                {pendingImport.validated.checksumMatched ? '完整匹配' : '已变更（已通过结构校验）'}
              </Text>
            </View>

            {pendingImport.validated.warnings.length > 0 ? (
              <View
                style={[
                  styles.warningStrip,
                  {
                    backgroundColor: theme.colors.warningSubtle,
                    borderLeftColor: theme.colors.warning,
                    borderRadius: theme.radius.sm,
                    paddingHorizontal: theme.spacing.sm,
                    paddingVertical: theme.spacing.xs,
                  },
                ]}
              >
                <Text style={{ color: theme.colors.warningTextOnSubtle, fontSize: theme.fontSize.xs }}>
                  {pendingImport.validated.warnings[0]}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </ConfirmDialog>

      <ClearLedgerDialog
        visible={clearDialogOpen}
        stats={stats}
        loading={clearing}
        error={clearError}
        onPressExportBackup={() => {
          setClearDialogOpen(false);
          setClearError(null);
          setExportSheetOpen(true);
        }}
        onCancel={() => {
          if (!clearing) {
            setClearDialogOpen(false);
            setClearError(null);
          }
        }}
        onConfirm={handlePassVerificationCode}
      />

      {/* 验证码通过后的最终二次确认菜单，杜绝误清空 */}
      <ActionSheet
        visible={clearConfirmSheetOpen}
        title="确认立即清空账本？"
        subtitle={`将永久删除全部 ${stats.transactionCount} 笔明细与快捷模板，账户重置为「钱包（¥0.00）」且不可恢复`}
        onClose={() => {
          if (!clearing) {
            setClearConfirmSheetOpen(false);
          }
        }}
        options={[
          {
            key: 'export-first',
            label: '先去导出 JSON 备份',
            subtitle: '暂不清空，先保存当前账本与配置副本',
            icon: 'download-outline',
            onPress: () => {
              setClearConfirmSheetOpen(false);
              setExportSheetOpen(true);
            },
          },
          {
            key: 'confirm-clear',
            label: '确认永久清空账本',
            subtitle: '我已确认备份无误，立即清空并重置',
            icon: 'trash-outline',
            tone: 'destructive',
            onPress: () => void handleConfirmClear(),
          },
        ]}
      />

      <ConfirmDialog
        visible={noticeDialog !== null}
        title={noticeDialog?.title ?? ''}
        message={noticeDialog?.message ?? ''}
        icon={noticeDialog?.icon ?? 'checkmark-circle-outline'}
        tone={noticeDialog?.tone ?? 'primary'}
        confirmLabel="知道了"
        hideCancel
        onCancel={() => setNoticeDialog(null)}
        onConfirm={() => setNoticeDialog(null)}
      />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  actionCard: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  previewBox: {},
  warningStrip: {
    borderLeftWidth: 3,
  },
});
