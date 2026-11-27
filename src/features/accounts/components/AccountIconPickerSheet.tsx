/**
 * 约束简报（Workflow B / C）：
 * - 基于全应用统一 BottomSheet（单段不可展开，仅下滑收起）就地承接账户图标选择，释放新增/编辑页主界面常驻空间
 * - 无厚重描边：选中态以柔和品牌浅底 + 主色图标与轻量角标区分，未选中以柔和浅灰块呈现，点选即关闭
 */
import React, { useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { hapticLight } from '../../../shared/haptics/haptics';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { BottomSheet, type BottomSheetHandle } from '../../../shared/ui/BottomSheet';
import { useTheme } from '../../../theme/theme-context';
import { ACCOUNT_ICON_OPTIONS } from '../types';

export interface AccountIconPickerSheetProps {
  visible: boolean;
  selectedIcon: string;
  onSelect: (iconName: string) => void;
  onClose: () => void;
}

const ICON_LABELS: Record<string, string> = {
  'wallet-outline': '钱包图标',
  'cash-outline': '现金图标',
  'card-outline': '银行卡图标',
  'phone-portrait-outline': '移动支付图标',
  'trending-up-outline': '理财趋势图标',
  'business-outline': '机构银行图标',
  'receipt-outline': '账单借据图标',
  'layers-outline': '综合账户图标',
};

function chunkIntoRows(items: readonly string[], columns: number): string[][] {
  const rows: string[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}

export function AccountIconPickerSheet({
  visible,
  selectedIcon,
  onSelect,
  onClose,
}: AccountIconPickerSheetProps): React.JSX.Element {
  const { theme } = useTheme();
  const sheetRef = useRef<BottomSheetHandle>(null);
  const rows = useMemo(() => chunkIntoRows(ACCOUNT_ICON_OPTIONS, 4), []);

  const handlePick = (iconName: string) => {
    hapticLight();
    onSelect(iconName);
    if (sheetRef.current) {
      sheetRef.current.dismiss();
    } else {
      onClose();
    }
  };

  return (
    <BottomSheet
      ref={sheetRef}
      visible={visible}
      onClose={onClose}
      title="选择图标"
      backdropLabel="关闭图标选择"
      expandable={false}
    >
      <View style={[styles.grid, { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg }]}>
        {rows.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.row}>
            {row.map((iconName) => {
              const selected = selectedIcon === iconName;
              return (
                <Pressable
                  key={iconName}
                  accessibilityRole="button"
                  accessibilityLabel={ICON_LABELS[iconName] ?? iconName}
                  accessibilityState={{ selected }}
                  onPress={() => handlePick(iconName)}
                  style={({ pressed }) => [
                    styles.cell,
                    {
                      backgroundColor: selected
                        ? theme.colors.actionSurface
                        : theme.colors.chipInactive,
                      borderRadius: 10,
                    },
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <AppIcon
                    name={iconName}
                    size={24}
                    color={selected ? theme.colors.action : theme.colors.textSecondary}
                  />
                  {selected ? (
                    <View
                      style={[
                        styles.checkDot,
                        { backgroundColor: theme.colors.action },
                      ]}
                    >
                      <AppIcon name="checkmark" size={9} color={theme.colors.onAction} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: 10,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  cell: {
    flex: 1,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 14,
    height: 14,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
