/**
 * 约束简报（Workflow B）：
 * - 简明透明的隐私与数据安全说明：如实告知本地 SQLite 存储、可选 WebDAV / Google Drive 云备份、硬件安全凭据隔离与零遥测原则
 */
import { Stack } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { InsetDivider } from '../src/shared/ui/InsetDivider';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { SurfaceCard } from '../src/shared/ui/SurfaceCard';
import { useTheme } from '../src/theme/theme-context';

const PRIVACY_ITEMS: readonly { icon: string; title: string; body: string }[] = [
  {
    icon: 'phone-portrait-outline',
    title: '本地离线优先，无中心服务器',
    body: 'ZeroTally 不设账号体系，也不接入任何第三方统计埋点、广告 SDK 或后台遥测。所有账目、账户、银行卡信息与分类默认仅保存在本机 SQLite 数据库中。',
  },
  {
    icon: 'cloud-outline',
    title: '云备份完全由你主动授权并直连自有网盘',
    body: '仅在你手动配置 WebDAV 或登录 Google Drive 后，应用才会将账本快照直接上传至你自己的服务端或 Google Drive 根目录 ZeroTally 文件夹（最小权限 drive.file，不读取其他云盘文件）。',
  },
  {
    icon: 'key-outline',
    title: '敏感凭据硬件级隔离存储',
    body: 'WebDAV 密码与 Google Drive OAuth 令牌均通过系统安全存储（Android Keystore / iOS Keychain）加密保存，绝不写入本地 SQLite、导出的备份 JSON 或调试日志。',
  },
  {
    icon: 'document-text-outline',
    title: '完全的数据导出与销毁控制权',
    body: '你可以随时在「高级设置」中将全部数据导出为开放可读的 JSON 文件，或通过 4 位随机安全验证码一键彻底清空本机全部记录。',
  },
];

export default function PrivacyScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <SafeScreen
      edges={['left', 'right']}
      style={{ backgroundColor: theme.colors.surfaceGrouped }}
    >
      <Stack.Screen options={{ title: '隐私说明' }} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
        }}
      >
        <SurfaceCard>
          {PRIVACY_ITEMS.map((item, idx) => (
            <View key={item.title}>
              <View style={styles.row}>
                <View
                  style={[
                    styles.iconWrap,
                    { backgroundColor: theme.colors.actionSurface, borderRadius: 10 },
                  ]}
                >
                  <AppIcon name={item.icon} size={18} color={theme.colors.action} />
                </View>
                <View style={styles.body}>
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
                      color: theme.colors.textSecondary,
                      fontSize: theme.fontSize.sm,
                      lineHeight: 20,
                      marginTop: 4,
                    }}
                  >
                    {item.body}
                  </Text>
                </View>
              </View>
              {idx < PRIVACY_ITEMS.length - 1 ? <InsetDivider /> : null}
            </View>
          ))}
        </SurfaceCard>
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    gap: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  body: {
    flex: 1,
  },
});
