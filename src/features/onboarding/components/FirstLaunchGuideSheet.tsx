/**
 * 首次启动极轻量手势引导弹层：
 * - 仅在全新安装或首次见到时展示一次，关闭后持久化标记不再打扰
 * - 单屏展示 4 个核心顺手手势，一键「开始记账」即可进入，并支持跳转完整手势技巧页
 */
import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { Button } from '../../../shared/ui/Button';
import { useTheme } from '../../../theme/theme-context';
import { getFirstLaunchHighlightTips } from '../rules';

export interface FirstLaunchGuideSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onOpenFullGuide: () => void;
}

export function FirstLaunchGuideSheet({
  visible,
  onDismiss,
  onOpenFullGuide,
}: FirstLaunchGuideSheetProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const tips = useMemo(() => getFirstLaunchHighlightTips(), []);

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭新手手势提示"
          onPress={onDismiss}
          style={[styles.backdrop, { backgroundColor: theme.colors.scrim }]}
        />

        <View
          style={[
            styles.card,
            theme.elevation.floating,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderRadius: 18,
              marginBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={styles.header}>
            <View
              style={[
                styles.brandBadge,
                { backgroundColor: theme.colors.actionSurface, borderRadius: 12 },
              ]}
            >
              <AppIcon name="sparkles-outline" size={20} color={theme.colors.action} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: theme.fontSize.lg,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                顺手记账小技巧
              </Text>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontSize: theme.fontSize.xs,
                  marginTop: 2,
                }}
              >
                全部数据默认仅存本机，这 4 个手势让日常记账更轻快
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 12 }}>
            {tips.map((tip, idx) => (
              <View
                key={tip.id}
                style={[
                  styles.tipRow,
                  idx < tips.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: theme.colors.divider,
                  },
                ]}
              >
                <View
                  style={[
                    styles.tipIcon,
                    { backgroundColor: theme.colors.surfaceGrouped, borderRadius: 10 },
                  ]}
                >
                  <AppIcon name={tip.icon} size={17} color={theme.colors.action} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.tipTitleLine}>
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
                        styles.gesturePill,
                        { backgroundColor: theme.colors.actionSurface, borderRadius: 6 },
                      ]}
                    >
                      <Text
                        style={{
                          color: theme.colors.action,
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
                      lineHeight: 17,
                      marginTop: 3,
                    }}
                  >
                    {tip.summary}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.footer}>
            <Button label="开始记账" onPress={onDismiss} />
            <Pressable
              accessibilityRole="button"
              onPress={onOpenFullGuide}
              style={({ pressed }) => [
                styles.moreBtn,
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontSize: theme.fontSize.xs,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                查看全部手势技巧（可在设置随时查阅）
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    padding: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandBadge: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
  },
  tipIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  tipTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  gesturePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  footer: {
    marginTop: 14,
    gap: 8,
  },
  moreBtn: {
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
