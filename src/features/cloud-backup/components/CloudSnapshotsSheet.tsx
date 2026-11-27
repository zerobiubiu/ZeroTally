/**
 * 约束简报（Workflow B）：
 * - 基于统一两段式可展开 BottomSheet 浏览云端多版本历史快照，支持刷新、点选恢复与单条删除
 * - 恢复与删除均先调用 sheetRef.dismiss 完整卸载弹窗后再交由父页展示确认框，避免 Android 并发 Modal 错层
 */
import React, { useRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { hapticLight } from '../../../shared/haptics/haptics';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { BottomSheet, type BottomSheetHandle } from '../../../shared/ui/BottomSheet';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { useTheme } from '../../../theme/theme-context';
import { formatCloudTimestamp, formatSnapshotSize } from '../rules';
import type { CloudProviderId, CloudSnapshotItem } from '../types';

export interface CloudSnapshotsSheetProps {
  visible: boolean;
  provider: CloudProviderId | null;
  snapshots: readonly CloudSnapshotItem[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onRequestRestore: (snapshot: CloudSnapshotItem) => void;
  onRequestDelete: (snapshot: CloudSnapshotItem) => void;
}

export function CloudSnapshotsSheet({
  visible,
  provider,
  snapshots,
  loading,
  error,
  onClose,
  onRefresh,
  onRequestRestore,
  onRequestDelete,
}: CloudSnapshotsSheetProps): React.JSX.Element {
  const { theme } = useTheme();
  const sheetRef = useRef<BottomSheetHandle>(null);

  const providerTitle = provider === 'google-drive' ? 'Google Drive' : 'WebDAV';

  return (
    <BottomSheet
      ref={sheetRef}
      visible={visible}
      onClose={onClose}
      title={`${providerTitle} 历史快照`}
      subtitle={
        loading
          ? '正在读取云端文件列表…'
          : `共 ${snapshots.length} 份可用备份，选择任意版本校验并恢复`
      }
      expandable
      scrollable
      collapsedRatio={0.62}
      contentContainerStyle={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.sm,
        paddingBottom: theme.spacing.xl,
        gap: theme.spacing.sm,
      }}
    >
      {/* 顶部刷新条 */}
      <View style={styles.toolbarRow}>
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
          按备份时间倒序排列
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="刷新快照列表"
          disabled={loading}
          onPress={() => {
            hapticLight();
            onRefresh();
          }}
          style={({ pressed }) => [
            styles.refreshBtn,
            {
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.full,
              paddingHorizontal: theme.spacing.sm + 2,
              paddingVertical: theme.spacing.xs + 1,
            },
            pressed && { opacity: theme.opacity.pressed },
          ]}
        >
          <AppIcon name="refresh-outline" size={14} color={theme.colors.action} />
          <Text
            style={{
              color: theme.colors.action,
              fontSize: theme.fontSize.xs,
              fontWeight: theme.fontWeight.semibold,
            }}
          >
            刷新
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={theme.colors.action} />
          <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.sm }}>
            正在从 {providerTitle} 拉取快照…
          </Text>
        </View>
      ) : error ? (
        <View
          style={[
            styles.errorBox,
            {
              backgroundColor: theme.colors.expenseSubtle,
              borderLeftColor: theme.colors.expense,
              borderRadius: theme.radius.md,
              padding: theme.spacing.md,
            },
          ]}
        >
          <Text style={{ color: theme.colors.expenseTextOnSubtle, fontSize: theme.fontSize.sm }}>
            {error}
          </Text>
        </View>
      ) : snapshots.length === 0 ? (
        <EmptyState
          icon="cloud-outline"
          title="暂无历史快照"
          description="点击「立即备份」上传第一份加密传输的账本快照"
        />
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          {snapshots.map((item, idx) => (
            <View
              key={`${item.provider}-${item.id}`}
              style={[
                styles.snapshotCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderRadius: theme.radius.md,
                  padding: theme.spacing.md,
                  borderWidth: theme.borderWidth.hairline,
                  borderColor: idx === 0 ? theme.colors.action : theme.colors.border,
                },
              ]}
            >
              <View style={styles.snapshotMain}>
                <View style={styles.titleLine}>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: theme.colors.text,
                      fontSize: theme.fontSize.sm,
                      fontWeight: theme.fontWeight.semibold,
                    }}
                  >
                    {formatCloudTimestamp(item.modifiedAt)}
                  </Text>
                  {idx === 0 ? (
                    <View
                      style={[
                        styles.latestBadge,
                        {
                          backgroundColor: theme.colors.actionSubtle,
                          borderRadius: theme.radius.full,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: theme.colors.actionTextOnSubtle,
                          fontSize: 11,
                          fontWeight: theme.fontWeight.semibold,
                        }}
                      >
                        最新
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  numberOfLines={1}
                  style={{
                    color: theme.colors.textMuted,
                    fontSize: theme.fontSize.xs,
                    marginTop: 2,
                  }}
                >
                  {item.filename} · {formatSnapshotSize(item.sizeBytes)}
                </Text>
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`恢复 ${item.filename}`}
                  onPress={() => {
                    hapticLight();
                    sheetRef.current?.dismiss(() => onRequestRestore(item));
                  }}
                  style={({ pressed }) => [
                    styles.restorePill,
                    {
                      backgroundColor: theme.colors.actionSubtle,
                      borderRadius: theme.radius.full,
                    },
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <Text
                    style={{
                      color: theme.colors.actionTextOnSubtle,
                      fontSize: theme.fontSize.xs,
                      fontWeight: theme.fontWeight.semibold,
                    }}
                  >
                    恢复
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`删除 ${item.filename}`}
                  onPress={() => {
                    hapticLight();
                    sheetRef.current?.dismiss(() => onRequestDelete(item));
                  }}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.deleteBtn,
                    {
                      backgroundColor: theme.colors.expenseSubtle,
                      borderRadius: theme.radius.full,
                    },
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <AppIcon name="trash-outline" size={15} color={theme.colors.expense} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    gap: 10,
  },
  errorBox: {
    borderLeftWidth: 3,
  },
  snapshotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  snapshotMain: {
    flex: 1,
    minWidth: 0,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  latestBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  restorePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
