/**
 * 约束简报（Workflow B / C）：
 * - 职责边界：编排 WebDAV 与 Google Drive 双通道云备份配置、手动一键备份、历史快照浏览/校验恢复/删除及自动备份与保留策略
 * - 视觉与交互：遵循 useTheme() 语义令牌与两档字重，单一主按钮「立即备份」置顶概览卡；全部弹窗与确认框采用严格互斥状态机，杜绝 Android 双层 Modal 叠加且零原生 Alert.alert
 */
import { Stack } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../src/db/database-context';
import { CloudSnapshotsSheet } from '../src/features/cloud-backup/components/CloudSnapshotsSheet';
import { GoogleDriveConfigSheet } from '../src/features/cloud-backup/components/GoogleDriveConfigSheet';
import { WebDavConfigSheet } from '../src/features/cloud-backup/components/WebDavConfigSheet';
import {
  CLOUD_RETENTION_OPTIONS,
  formatCloudTimestamp,
  GOOGLE_DRIVE_FOLDER_NAME,
} from '../src/features/cloud-backup/rules';
import {
  backupToAllEnabledProviders,
  backupToCloudProvider,
  connectGoogleDrive,
  deleteCloudSnapshot,
  disconnectGoogleDrive,
  disconnectWebDav,
  downloadAndValidateCloudSnapshot,
  getCloudBackupOverview,
  listCloudSnapshots,
  restoreCloudSnapshot,
  saveWebDavSettings,
  testWebDavSettings,
  updateCloudBackupPolicy,
} from '../src/features/cloud-backup/service';
import type {
  CloudBackupOverview,
  CloudProviderId,
  CloudRetentionLimit,
  CloudSnapshotItem,
  SaveWebDavInput,
} from '../src/features/cloud-backup/types';
import type { ValidatedLedgerImport } from '../src/features/export/types';
import {
  hapticLight,
  hapticSuccess,
  hapticWarning,
} from '../src/shared/haptics/haptics';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { Button } from '../src/shared/ui/Button';
import { ConfirmDialog } from '../src/shared/ui/ConfirmDialog';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { SlidingSegmentedControl } from '../src/shared/ui/SlidingSegmentedControl';
import { useTheme } from '../src/theme/theme-context';

type ActiveCloudModal =
  | { kind: 'none' }
  | { kind: 'webdav-config' }
  | { kind: 'google-config' }
  | { kind: 'snapshots'; provider: CloudProviderId }
  | {
      kind: 'confirm-restore';
      provider: CloudProviderId;
      snapshot: CloudSnapshotItem;
      validated: ValidatedLedgerImport;
    }
  | {
      kind: 'confirm-delete-snapshot';
      provider: CloudProviderId;
      snapshot: CloudSnapshotItem;
    }
  | { kind: 'confirm-disconnect'; provider: CloudProviderId }
  | {
      kind: 'notice';
      title: string;
      message: string;
      tone: 'primary' | 'destructive';
      icon: string;
    };

const RETENTION_SEGMENT_OPTIONS = CLOUD_RETENTION_OPTIONS.map((item) => ({
  value: String(item.value),
  label: item.label,
}));

function providerDisplayName(provider: CloudProviderId): string {
  return provider === 'google-drive' ? 'Google Drive' : 'WebDAV';
}

function summarizeHost(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host || url;
  } catch {
    return url;
  }
}

export default function CloudBackupScreen(): React.JSX.Element {
  const { theme, setPreference } = useTheme();
  const insets = useSafeAreaInsets();
  const { db, notifyChange } = useDatabase();

  const [overview, setOverview] = useState<CloudBackupOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [backingUpTarget, setBackingUpTarget] = useState<'all' | CloudProviderId | null>(null);
  const [downloadingText, setDownloadingText] = useState<string | null>(null);

  const [activeModal, setActiveModal] = useState<ActiveCloudModal>({ kind: 'none' });
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [snapshots, setSnapshots] = useState<CloudSnapshotItem[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [snapshotsError, setSnapshotsError] = useState<string | null>(null);

  const reloadOverview = useCallback(async () => {
    try {
      const next = await getCloudBackupOverview(db);
      setOverview(next);
    } finally {
      setLoadingOverview(false);
    }
  }, [db]);

  useEffect(() => {
    void reloadOverview();
  }, [reloadOverview]);

  const latestSyncAt = useMemo(() => {
    if (!overview) {
      return null;
    }
    const times = [
      overview.config.webdav.lastBackupAt,
      overview.config.googleDrive.lastBackupAt,
    ].filter((item): item is string => Boolean(item));
    if (times.length === 0) {
      return null;
    }
    times.sort((a, b) => Date.parse(b) - Date.parse(a));
    return times[0] ?? null;
  }, [overview]);

  const loadSnapshotsForProvider = useCallback(
    async (provider: CloudProviderId) => {
      setSnapshotsLoading(true);
      setSnapshotsError(null);
      try {
        const list = await listCloudSnapshots(db, provider);
        setSnapshots(list);
      } catch (err) {
        setSnapshots([]);
        setSnapshotsError(err instanceof Error ? err.message : '无法读取云端历史快照');
      } finally {
        setSnapshotsLoading(false);
      }
    },
    [db]
  );

  const handleOpenSnapshots = (provider: CloudProviderId) => {
    hapticLight();
    setSnapshots([]);
    setSnapshotsError(null);
    setActiveModal({ kind: 'snapshots', provider });
    void loadSnapshotsForProvider(provider);
  };

  const handleBackupAll = async () => {
    if (backingUpTarget !== null) {
      return;
    }
    hapticLight();
    setBackingUpTarget('all');
    try {
      const results = await backupToAllEnabledProviders(db);
      await reloadOverview();
      const succeeded = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);

      if (failed.length === 0) {
        hapticSuccess();
        const details = succeeded
          .map((r) => {
            const pruneText = r.prunedCount > 0 ? `，已清理 ${r.prunedCount} 份旧快照` : '';
            return `${providerDisplayName(r.provider)}（${r.transactionCount ?? 0} 笔账目${pruneText}）`;
          })
          .join('\n');
        setActiveModal({
          kind: 'notice',
          title: '云备份完成',
          message: details,
          tone: 'primary',
          icon: 'checkmark-circle-outline',
        });
      } else {
        hapticWarning();
        const lines = results.map((r) =>
          r.ok
            ? `${providerDisplayName(r.provider)}：已上传 ${r.filename ?? ''}`
            : `${providerDisplayName(r.provider)}：${r.error ?? '失败'}`
        );
        setActiveModal({
          kind: 'notice',
          title: succeeded.length > 0 ? '部分通道备份失败' : '云备份失败',
          message: lines.join('\n'),
          tone: 'destructive',
          icon: 'alert-circle-outline',
        });
      }
    } catch (err) {
      hapticWarning();
      setActiveModal({
        kind: 'notice',
        title: '无法执行云备份',
        message: err instanceof Error ? err.message : '请先配置并启用云备份通道',
        tone: 'destructive',
        icon: 'alert-circle-outline',
      });
    } finally {
      setBackingUpTarget(null);
    }
  };

  const handleBackupSingle = async (provider: CloudProviderId) => {
    if (backingUpTarget !== null) {
      return;
    }
    hapticLight();
    setBackingUpTarget(provider);
    try {
      const result = await backupToCloudProvider(db, provider);
      await reloadOverview();
      if (result.ok) {
        hapticSuccess();
        const pruneSuffix =
          result.prunedCount > 0 ? `，并自动清理 ${result.prunedCount} 份超限旧快照` : '';
        setActiveModal({
          kind: 'notice',
          title: `${providerDisplayName(provider)} 备份成功`,
          message: `已上传 ${result.filename ?? ''}（共 ${result.transactionCount ?? 0} 笔账目${pruneSuffix}）。`,
          tone: 'primary',
          icon: 'checkmark-circle-outline',
        });
      } else {
        hapticWarning();
        setActiveModal({
          kind: 'notice',
          title: `${providerDisplayName(provider)} 备份失败`,
          message: result.error ?? '上传备份失败',
          tone: 'destructive',
          icon: 'alert-circle-outline',
        });
      }
    } finally {
      setBackingUpTarget(null);
    }
  };

  const handleRequestRestoreSnapshot = async (
    provider: CloudProviderId,
    snapshot: CloudSnapshotItem
  ) => {
    setActiveModal({ kind: 'none' });
    setDownloadingText(`正在从 ${providerDisplayName(provider)} 下载并校验快照…`);
    try {
      const validated = await downloadAndValidateCloudSnapshot(db, provider, snapshot);
      setModalError(null);
      setActiveModal({
        kind: 'confirm-restore',
        provider,
        snapshot,
        validated,
      });
    } catch (err) {
      hapticWarning();
      setActiveModal({
        kind: 'notice',
        title: '快照下载或校验失败',
        message: err instanceof Error ? err.message : '无法下载或解析所选云端快照',
        tone: 'destructive',
        icon: 'alert-circle-outline',
      });
    } finally {
      setDownloadingText(null);
    }
  };

  const handleConfirmRestore = async () => {
    if (activeModal.kind !== 'confirm-restore' || modalBusy) {
      return;
    }
    setModalBusy(true);
    setModalError(null);
    try {
      const summary = await restoreCloudSnapshot(db, activeModal.validated);
      setPreference(summary.themePreference);
      notifyChange();
      hapticSuccess();
      setActiveModal({
        kind: 'notice',
        title: '云端快照已恢复',
        message: `已恢复 ${summary.transactionCount} 笔账目、${summary.accountCount} 个账户、${summary.categoryCount} 个分类与外观配置。`,
        tone: 'primary',
        icon: 'checkmark-circle-outline',
      });
    } catch (err) {
      hapticWarning();
      setModalError(err instanceof Error ? err.message : '覆盖恢复失败，原账本未受影响');
    } finally {
      setModalBusy(false);
    }
  };

  const handleConfirmDeleteSnapshot = async () => {
    if (activeModal.kind !== 'confirm-delete-snapshot' || modalBusy) {
      return;
    }
    const { provider, snapshot } = activeModal;
    setModalBusy(true);
    setModalError(null);
    try {
      await deleteCloudSnapshot(db, provider, snapshot);
      hapticSuccess();
      setActiveModal({
        kind: 'notice',
        title: '快照已删除',
        message: `已从 ${providerDisplayName(provider)} 删除「${snapshot.filename}」。`,
        tone: 'primary',
        icon: 'checkmark-circle-outline',
      });
    } catch (err) {
      hapticWarning();
      setModalError(err instanceof Error ? err.message : '删除云端快照失败');
    } finally {
      setModalBusy(false);
    }
  };

  const handleConfirmDisconnect = async () => {
    if (activeModal.kind !== 'confirm-disconnect' || modalBusy) {
      return;
    }
    const { provider } = activeModal;
    setModalBusy(true);
    setModalError(null);
    try {
      if (provider === 'webdav') {
        await disconnectWebDav(db);
      } else {
        await disconnectGoogleDrive(db);
      }
      await reloadOverview();
      hapticSuccess();
      setActiveModal({ kind: 'none' });
    } catch (err) {
      hapticWarning();
      setModalError(err instanceof Error ? err.message : '断开连接失败');
    } finally {
      setModalBusy(false);
    }
  };

  const handleSaveWebDav = async (input: SaveWebDavInput) => {
    await saveWebDavSettings(db, input);
    await reloadOverview();
  };

  const handleAuthorizeGoogle = async (clientId: string) => {
    await connectGoogleDrive(db, { clientId });
    await reloadOverview();
  };

  const handleToggleAutoBackup = async (enabled: boolean) => {
    hapticLight();
    await updateCloudBackupPolicy(db, { autoBackupEnabled: enabled });
    await reloadOverview();
  };

  const handleChangeRetention = async (maxSnapshots: CloudRetentionLimit) => {
    await updateCloudBackupPolicy(db, { maxSnapshots });
    await reloadOverview();
  };

  const handleToggleProvider = async (provider: CloudProviderId, enabled: boolean) => {
    hapticLight();
    await updateCloudBackupPolicy(
      db,
      provider === 'webdav' ? { webdavEnabled: enabled } : { googleDriveEnabled: enabled }
    );
    await reloadOverview();
  };

  const webdavConfigured = Boolean(
    overview &&
      overview.config.webdav.serverUrl.trim() &&
      overview.config.webdav.username.trim() &&
      overview.hasWebDavPassword
  );
  const googleConfigured = Boolean(
    overview &&
      overview.hasGoogleDriveTokens &&
      (overview.config.googleDrive.clientId.trim() || overview.presetGoogleClientId)
  );
  const readyCount = overview?.readyProviders.length ?? 0;

  return (
    <SafeScreen edges={['left', 'right']}>
      <Stack.Screen options={{ title: '云备份' }} />

      {loadingOverview || !overview ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={theme.colors.action} />
        </View>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={{
            padding: theme.spacing.lg,
            paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.xl,
            gap: theme.spacing.md,
          }}
        >
          {/* 顶部同步概览卡 + 单一主 CTA */}
          <View
            style={[
              styles.card,
              theme.elevation.card,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderRadius: theme.radius.lg,
                padding: theme.spacing.lg,
                gap: theme.spacing.md,
              },
            ]}
          >
            <View style={styles.overviewHeader}>
              <View
                style={[
                  styles.heroIconWrap,
                  {
                    backgroundColor:
                      readyCount > 0 ? theme.colors.actionSubtle : theme.colors.surfaceSunken,
                    borderRadius: theme.radius.full,
                  },
                ]}
              >
                <AppIcon
                  name={readyCount > 0 ? 'cloud-done-outline' : 'cloud-upload-outline'}
                  size={22}
                  color={
                    readyCount > 0 ? theme.colors.actionTextOnSubtle : theme.colors.textMuted
                  }
                />
              </View>
              <View style={styles.flexBody}>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontSize: theme.fontSize.lg,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  {readyCount > 0 ? `已就绪 ${readyCount} 个云通道` : '配置云备份通道'}
                </Text>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontSize: theme.fontSize.xs,
                    marginTop: 2,
                  }}
                >
                  {latestSyncAt
                    ? `最近备份：${formatCloudTimestamp(latestSyncAt)}`
                    : '与手动导出的完整 JSON 备份格式 100% 互通'}
                </Text>
              </View>
            </View>

            {downloadingText ? (
              <View
                style={[
                  styles.downloadingRow,
                  {
                    backgroundColor: theme.colors.actionSubtle,
                    borderRadius: theme.radius.md,
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: theme.spacing.sm,
                  },
                ]}
              >
                <ActivityIndicator size="small" color={theme.colors.actionTextOnSubtle} />
                <Text
                  style={{
                    color: theme.colors.actionTextOnSubtle,
                    fontSize: theme.fontSize.xs,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  {downloadingText}
                </Text>
              </View>
            ) : null}

            <Button
              label={readyCount > 1 ? '立即备份全部通道' : '立即备份'}
              variant="primary"
              disabled={readyCount === 0 || backingUpTarget !== null || downloadingText !== null}
              loading={backingUpTarget === 'all'}
              onPress={() => void handleBackupAll()}
            />
          </View>

          {/* WebDAV 通道卡片 */}
          <View
            style={[
              styles.card,
              theme.elevation.card,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderRadius: theme.radius.lg,
                padding: theme.spacing.md,
                gap: theme.spacing.md,
              },
            ]}
          >
            <View style={styles.providerHeader}>
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor: theme.colors.transferSubtle,
                    borderRadius: theme.radius.full,
                  },
                ]}
              >
                <AppIcon
                  name="server-outline"
                  size={20}
                  color={theme.colors.transferTextOnSubtle}
                />
              </View>

              <View style={styles.flexBody}>
                <View style={styles.titleBadgeRow}>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontSize: theme.fontSize.base,
                      fontWeight: theme.fontWeight.semibold,
                    }}
                  >
                    WebDAV
                  </Text>
                  <StatusPill
                    configured={webdavConfigured}
                    enabled={overview.config.webdav.enabled}
                    status={overview.config.webdav.lastStatus}
                  />
                </View>
                <Text
                  numberOfLines={1}
                  style={{
                    color: theme.colors.textMuted,
                    fontSize: theme.fontSize.xs,
                    marginTop: 2,
                  }}
                >
                  {webdavConfigured
                    ? `${summarizeHost(overview.config.webdav.serverUrl)} · ${overview.config.webdav.remoteDirectory}`
                    : '坚果云、Nextcloud、群晖 NAS 等标准 WebDAV'}
                </Text>
              </View>

              {webdavConfigured ? (
                <Switch
                  value={overview.config.webdav.enabled}
                  onValueChange={(val) => void handleToggleProvider('webdav', val)}
                  trackColor={{
                    false: theme.colors.borderStrong,
                    true: theme.colors.action,
                  }}
                  thumbColor={theme.colors.surfaceRaised}
                />
              ) : null}
            </View>

            {webdavConfigured ? (
              <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                账号：{overview.config.webdav.username} · 最近备份：
                {formatCloudTimestamp(overview.config.webdav.lastBackupAt)}
              </Text>
            ) : null}

            {overview.config.webdav.lastStatus === 'error' &&
            overview.config.webdav.lastError ? (
              <View
                style={[
                  styles.errorStrip,
                  {
                    backgroundColor: theme.colors.expenseSubtle,
                    borderLeftColor: theme.colors.expense,
                    borderRadius: theme.radius.sm,
                  },
                ]}
              >
                <Text
                  style={{
                    color: theme.colors.expenseTextOnSubtle,
                    fontSize: theme.fontSize.xs,
                  }}
                >
                  {overview.config.webdav.lastError}
                </Text>
              </View>
            ) : null}

            <View style={styles.actionBar}>
              <Button
                label={webdavConfigured ? '配置' : '配置 WebDAV'}
                variant="secondary"
                size="sm"
                onPress={() => {
                  hapticLight();
                  setActiveModal({ kind: 'webdav-config' });
                }}
                style={styles.actionBtn}
              />
              {webdavConfigured ? (
                <>
                  <Button
                    label="备份"
                    variant="secondary"
                    size="sm"
                    loading={backingUpTarget === 'webdav'}
                    disabled={backingUpTarget !== null || downloadingText !== null}
                    onPress={() => void handleBackupSingle('webdav')}
                    style={styles.actionBtn}
                  />
                  <Button
                    label="历史快照"
                    variant="secondary"
                    size="sm"
                    disabled={backingUpTarget !== null || downloadingText !== null}
                    onPress={() => handleOpenSnapshots('webdav')}
                    style={styles.actionBtn}
                  />
                </>
              ) : null}
            </View>
          </View>

          {/* Google Drive 通道卡片 */}
          <View
            style={[
              styles.card,
              theme.elevation.card,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderRadius: theme.radius.lg,
                padding: theme.spacing.md,
                gap: theme.spacing.md,
              },
            ]}
          >
            <View style={styles.providerHeader}>
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor: theme.colors.actionSubtle,
                    borderRadius: theme.radius.full,
                  },
                ]}
              >
                <AppIcon
                  name="logo-google"
                  size={19}
                  color={theme.colors.actionTextOnSubtle}
                />
              </View>

              <View style={styles.flexBody}>
                <View style={styles.titleBadgeRow}>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontSize: theme.fontSize.base,
                      fontWeight: theme.fontWeight.semibold,
                    }}
                  >
                    Google Drive
                  </Text>
                  <StatusPill
                    configured={googleConfigured}
                    enabled={overview.config.googleDrive.enabled}
                    status={overview.config.googleDrive.lastStatus}
                  />
                </View>
                <Text
                  numberOfLines={1}
                  style={{
                    color: theme.colors.textMuted,
                    fontSize: theme.fontSize.xs,
                    marginTop: 2,
                  }}
                >
                  {googleConfigured
                    ? `${overview.config.googleDrive.accountEmail ?? '已授权账号'} · ${GOOGLE_DRIVE_FOLDER_NAME}/`
                    : `OAuth 2.0 PKCE 授权，备份至 ${GOOGLE_DRIVE_FOLDER_NAME}/ 文件夹`}
                </Text>
              </View>

              {googleConfigured ? (
                <Switch
                  value={overview.config.googleDrive.enabled}
                  onValueChange={(val) => void handleToggleProvider('google-drive', val)}
                  trackColor={{
                    false: theme.colors.borderStrong,
                    true: theme.colors.action,
                  }}
                  thumbColor={theme.colors.surfaceRaised}
                />
              ) : null}
            </View>

            {googleConfigured ? (
              <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                最近备份：{formatCloudTimestamp(overview.config.googleDrive.lastBackupAt)}
              </Text>
            ) : null}

            {overview.config.googleDrive.lastStatus === 'error' &&
            overview.config.googleDrive.lastError ? (
              <View
                style={[
                  styles.errorStrip,
                  {
                    backgroundColor: theme.colors.expenseSubtle,
                    borderLeftColor: theme.colors.expense,
                    borderRadius: theme.radius.sm,
                  },
                ]}
              >
                <Text
                  style={{
                    color: theme.colors.expenseTextOnSubtle,
                    fontSize: theme.fontSize.xs,
                  }}
                >
                  {overview.config.googleDrive.lastError}
                </Text>
              </View>
            ) : null}

            <View style={styles.actionBar}>
              <Button
                label={googleConfigured ? '配置' : '连接 Google Drive'}
                variant="secondary"
                size="sm"
                onPress={() => {
                  hapticLight();
                  setActiveModal({ kind: 'google-config' });
                }}
                style={styles.actionBtn}
              />
              {googleConfigured ? (
                <>
                  <Button
                    label="备份"
                    variant="secondary"
                    size="sm"
                    loading={backingUpTarget === 'google-drive'}
                    disabled={backingUpTarget !== null || downloadingText !== null}
                    onPress={() => void handleBackupSingle('google-drive')}
                    style={styles.actionBtn}
                  />
                  <Button
                    label="历史快照"
                    variant="secondary"
                    size="sm"
                    disabled={backingUpTarget !== null || downloadingText !== null}
                    onPress={() => handleOpenSnapshots('google-drive')}
                    style={styles.actionBtn}
                  />
                </>
              ) : null}
            </View>
          </View>

          {/* 备份策略设置卡片 */}
          <View
            style={[
              styles.card,
              theme.elevation.card,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderRadius: theme.radius.lg,
                padding: theme.spacing.md,
                gap: theme.spacing.md,
              },
            ]}
          >
            <View style={styles.policySwitchRow}>
              <View style={styles.flexBody}>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontSize: theme.fontSize.base,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  账本变动自动云备份
                </Text>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontSize: theme.fontSize.xs,
                    marginTop: 2,
                  }}
                >
                  记账或改账后自动静默防抖上传，不打断操作
                </Text>
              </View>
              <Switch
                value={overview.config.autoBackupEnabled}
                onValueChange={(val) => void handleToggleAutoBackup(val)}
                trackColor={{
                  false: theme.colors.borderStrong,
                  true: theme.colors.action,
                }}
                thumbColor={theme.colors.surfaceRaised}
              />
            </View>

            <View style={[styles.hairline, { backgroundColor: theme.colors.border }]} />

            <View style={{ gap: theme.spacing.sm }}>
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: theme.fontSize.sm,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                历史快照保留上限
              </Text>
              <SlidingSegmentedControl
                options={RETENTION_SEGMENT_OPTIONS}
                value={String(overview.config.maxSnapshots)}
                onChange={(next) => {
                  const parsed = Number(next) as CloudRetentionLimit;
                  void handleChangeRetention(parsed);
                }}
                fullWidth
                height={40}
                shape="pill"
                trackTone="surface"
                textSize="sm"
              />
            </View>
          </View>
        </ScrollView>
      )}

      {/* 1. WebDAV 配置抽屉 */}
      {overview ? (
        <WebDavConfigSheet
          visible={activeModal.kind === 'webdav-config'}
          config={overview.config.webdav}
          hasSavedPassword={overview.hasWebDavPassword}
          onClose={() => setActiveModal({ kind: 'none' })}
          onTest={(input) => testWebDavSettings(input)}
          onSave={handleSaveWebDav}
          onRequestDisconnect={() => {
            setModalError(null);
            setActiveModal({ kind: 'confirm-disconnect', provider: 'webdav' });
          }}
        />
      ) : null}

      {/* 2. Google Drive 授权配置抽屉 */}
      {overview ? (
        <GoogleDriveConfigSheet
          visible={activeModal.kind === 'google-config'}
          config={overview.config.googleDrive}
          hasSavedTokens={overview.hasGoogleDriveTokens}
          presetClientId={overview.presetGoogleClientId}
          onClose={() => setActiveModal({ kind: 'none' })}
          onAuthorize={handleAuthorizeGoogle}
          onRequestDisconnect={() => {
            setModalError(null);
            setActiveModal({ kind: 'confirm-disconnect', provider: 'google-drive' });
          }}
        />
      ) : null}

      {/* 3. 历史快照列表抽屉 */}
      <CloudSnapshotsSheet
        visible={activeModal.kind === 'snapshots'}
        provider={activeModal.kind === 'snapshots' ? activeModal.provider : null}
        snapshots={snapshots}
        loading={snapshotsLoading}
        error={snapshotsError}
        onClose={() => setActiveModal({ kind: 'none' })}
        onRefresh={() => {
          if (activeModal.kind === 'snapshots') {
            void loadSnapshotsForProvider(activeModal.provider);
          }
        }}
        onRequestRestore={(snapshot) => {
          if (activeModal.kind === 'snapshots') {
            void handleRequestRestoreSnapshot(activeModal.provider, snapshot);
          }
        }}
        onRequestDelete={(snapshot) => {
          if (activeModal.kind === 'snapshots') {
            setModalError(null);
            setActiveModal({
              kind: 'confirm-delete-snapshot',
              provider: activeModal.provider,
              snapshot,
            });
          }
        }}
      />

      {/* 4. 校验通过后的覆盖恢复确认弹窗 */}
      <ConfirmDialog
        visible={activeModal.kind === 'confirm-restore'}
        title="确认用云端快照覆盖恢复？"
        message={
          activeModal.kind === 'confirm-restore'
            ? `已从 ${providerDisplayName(activeModal.provider)} 下载并校验「${activeModal.snapshot.filename}」，确认后将完整替换当前账本与外观配置。`
            : ''
        }
        icon="cloud-download-outline"
        tone="primary"
        confirmLabel="确认恢复"
        loading={modalBusy}
        error={modalError}
        onCancel={() => {
          if (!modalBusy) {
            setModalError(null);
            setActiveModal({ kind: 'none' });
          }
        }}
        onConfirm={() => void handleConfirmRestore()}
      >
        {activeModal.kind === 'confirm-restore' ? (
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
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: theme.fontSize.sm,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                账目 {activeModal.validated.payload.summary.transactionCount} 笔 · 账户{' '}
                {activeModal.validated.payload.summary.accountCount} 个 · 分类{' '}
                {activeModal.validated.payload.summary.categoryCount} 个
              </Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                快捷模板 {activeModal.validated.payload.summary.quickTemplateCount} 项 · 校验指纹
                {activeModal.validated.checksumMatched ? '完整匹配' : '已变更（已通过结构校验）'}
              </Text>
            </View>

            {activeModal.validated.warnings.length > 0 ? (
              <View
                style={[
                  styles.errorStrip,
                  {
                    backgroundColor: theme.colors.warningSubtle,
                    borderLeftColor: theme.colors.warning,
                    borderRadius: theme.radius.sm,
                  },
                ]}
              >
                <Text
                  style={{
                    color: theme.colors.warningTextOnSubtle,
                    fontSize: theme.fontSize.xs,
                  }}
                >
                  {activeModal.validated.warnings[0]}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </ConfirmDialog>

      {/* 5. 删除云端单份快照确认弹窗 */}
      <ConfirmDialog
        visible={activeModal.kind === 'confirm-delete-snapshot'}
        title="删除云端快照？"
        message={
          activeModal.kind === 'confirm-delete-snapshot'
            ? `将从 ${providerDisplayName(activeModal.provider)} 永久删除「${activeModal.snapshot.filename}」，不影响本地账本数据。`
            : ''
        }
        icon="trash-outline"
        tone="destructive"
        confirmLabel="确认删除"
        loading={modalBusy}
        error={modalError}
        onCancel={() => {
          if (!modalBusy) {
            setModalError(null);
            setActiveModal({ kind: 'none' });
          }
        }}
        onConfirm={() => void handleConfirmDeleteSnapshot()}
      />

      {/* 6. 断开云通道确认弹窗 */}
      <ConfirmDialog
        visible={activeModal.kind === 'confirm-disconnect'}
        title={
          activeModal.kind === 'confirm-disconnect'
            ? `断开 ${providerDisplayName(activeModal.provider)}？`
            : ''
        }
        message="将清除本机硬件安全存储中的凭据或授权令牌，已上传的云端历史快照会保留在你的网盘中。"
        icon="unlink-outline"
        tone="destructive"
        confirmLabel="确认断开"
        loading={modalBusy}
        error={modalError}
        onCancel={() => {
          if (!modalBusy) {
            setModalError(null);
            setActiveModal({ kind: 'none' });
          }
        }}
        onConfirm={() => void handleConfirmDisconnect()}
      />

      {/* 7. 结果提示弹窗 */}
      <ConfirmDialog
        visible={activeModal.kind === 'notice'}
        title={activeModal.kind === 'notice' ? activeModal.title : ''}
        message={activeModal.kind === 'notice' ? activeModal.message : ''}
        icon={activeModal.kind === 'notice' ? activeModal.icon : 'checkmark-circle-outline'}
        tone={activeModal.kind === 'notice' ? activeModal.tone : 'primary'}
        confirmLabel="知道了"
        hideCancel
        onCancel={() => setActiveModal({ kind: 'none' })}
        onConfirm={() => setActiveModal({ kind: 'none' })}
      />
    </SafeScreen>
  );
}

function StatusPill({
  configured,
  enabled,
  status,
}: {
  configured: boolean;
  enabled: boolean;
  status: 'idle' | 'success' | 'error';
}): React.JSX.Element {
  const { theme } = useTheme();

  let label = '未配置';
  let bg = theme.colors.surfaceSunken;
  let fg = theme.colors.textMuted;

  if (configured) {
    if (!enabled) {
      label = '已暂停';
      bg = theme.colors.warningSubtle;
      fg = theme.colors.warningTextOnSubtle;
    } else if (status === 'error') {
      label = '异常';
      bg = theme.colors.expenseSubtle;
      fg = theme.colors.expenseTextOnSubtle;
    } else {
      label = '已连接';
      bg = theme.colors.incomeSubtle;
      fg = theme.colors.incomeTextOnSubtle;
    }
  }

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: bg,
          borderRadius: theme.radius.full,
        },
      ]}
    >
      <Text
        style={{
          color: fg,
          fontSize: 11,
          fontWeight: theme.fontWeight.semibold,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {},
  overviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroIconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  providerHeader: {
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
  flexBody: {
    flex: 1,
    minWidth: 0,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  errorStrip: {
    borderLeftWidth: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionBar: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
  },
  policySwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
  },
  previewBox: {},
});
