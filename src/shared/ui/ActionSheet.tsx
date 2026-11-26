/**
 * 约束简报（Workflow B / C）：
 * - 信息层级：主（顶部标题与各操作项主文案）、次（图标徽章与副标题说明）、弱（拖拽指示条与底部取消按钮）
 * - 交互形态：基于统一 BottomSheet 基座，支持平滑上滑进场与全区跟手向下滑动收起，不可见时卸载 Modal
 */
import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/theme-context';
import { AppIcon } from './AppIcon';
import { BottomSheet, type BottomSheetHandle } from './BottomSheet';

export interface ActionSheetOption {
  key: string;
  label: string;
  subtitle?: string;
  icon: string;
  tone?: 'default' | 'destructive';
  onPress: () => void;
}

export interface ActionSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  options: readonly ActionSheetOption[];
  cancelLabel?: string;
  onClose: () => void;
}

export function ActionSheet({
  visible,
  title,
  subtitle,
  options,
  cancelLabel = '取消',
  onClose,
}: ActionSheetProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const sheetRef = useRef<BottomSheetHandle>(null);

  return (
    <BottomSheet
      ref={sheetRef}
      visible={visible}
      onClose={onClose}
      backdropLabel="关闭操作菜单"
      header={
        <View
          style={[
            styles.header,
            {
              paddingHorizontal: theme.spacing.lg,
              paddingBottom: theme.spacing.md,
              borderBottomColor: theme.colors.border,
              borderBottomWidth: theme.borderWidth.hairline,
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: theme.fontSize.base,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontSize: theme.fontSize.xs,
                  marginTop: 2,
                }}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭"
            onPress={() => sheetRef.current?.dismiss()}
            hitSlop={10}
            style={({ pressed }) => [
              styles.closeBtn,
              pressed && { opacity: theme.opacity.pressed },
            ]}
          >
            <AppIcon name="close" size={20} color={theme.colors.textMuted} />
          </Pressable>
        </View>
      }
    >
      <View
        style={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
          gap: theme.spacing.sm,
        }}
      >
        {options.map((opt) => {
          const isDanger = opt.tone === 'destructive';
          return (
            <Pressable
              key={opt.key}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              onPress={() => sheetRef.current?.dismiss(() => opt.onPress())}
              style={({ pressed }) => [
                styles.optionRow,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderWidth: theme.borderWidth.hairline,
                  borderRadius: theme.radius.md,
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.md,
                },
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor: isDanger
                      ? theme.colors.expenseSubtle
                      : theme.colors.actionSubtle,
                    borderRadius: theme.radius.full,
                  },
                ]}
              >
                <AppIcon
                  name={opt.icon}
                  size={18}
                  color={
                    isDanger
                      ? theme.colors.expenseTextOnSubtle
                      : theme.colors.actionTextOnSubtle
                  }
                />
              </View>

              <View style={styles.optionText}>
                <Text
                  style={{
                    color: isDanger ? theme.colors.expense : theme.colors.text,
                    fontSize: theme.fontSize.base,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  {opt.label}
                </Text>
                {opt.subtitle ? (
                  <Text
                    style={{
                      color: theme.colors.textMuted,
                      fontSize: theme.fontSize.xs,
                      marginTop: 2,
                    }}
                  >
                    {opt.subtitle}
                  </Text>
                ) : null}
              </View>

              <AppIcon name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </Pressable>
          );
        })}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          onPress={() => sheetRef.current?.dismiss()}
          style={({ pressed }) => [
            styles.cancelBtn,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderWidth: theme.borderWidth.hairline,
              borderRadius: theme.radius.md,
              marginTop: theme.spacing.xs,
            },
            pressed && { opacity: theme.opacity.pressed },
          ]}
        >
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: theme.fontSize.base,
              fontWeight: theme.fontWeight.semibold,
            }}
          >
            {cancelLabel}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
    minWidth: 0,
  },
  cancelBtn: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
