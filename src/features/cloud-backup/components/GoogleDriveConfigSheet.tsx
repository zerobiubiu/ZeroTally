/**
 * 约束简报（Workflow B）：
 * - 基于统一 BottomSheet 承载 Google Drive OAuth 2.0 PKCE 授权配置（支持编译期预置 Client ID 或应用内自填）
 * - 展示固定回调 URI（com.keepaccounts.app:/cloud-backup）与包名一键复制，附可折叠 3 步配置指引保持默认视图整洁
 * - 断开授权经 sheetRef.dismiss 收起后交由父页确认弹窗执行，杜绝 Android 双层 Modal 叠加
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Clipboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { hapticLight, hapticSuccess, hapticWarning } from '../../../shared/haptics/haptics';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { BottomSheet, type BottomSheetHandle } from '../../../shared/ui/BottomSheet';
import { Button } from '../../../shared/ui/Button';
import { useTheme } from '../../../theme/theme-context';
import { GOOGLE_DRIVE_FOLDER_NAME, GOOGLE_DRIVE_REDIRECT_URI } from '../rules';
import type { GoogleDriveConfig } from '../types';

const ANDROID_PACKAGE_NAME = 'com.keepaccounts.app';

export interface GoogleDriveConfigSheetProps {
  visible: boolean;
  config: GoogleDriveConfig;
  hasSavedTokens: boolean;
  presetClientId: string;
  onClose: () => void;
  onAuthorize: (clientId: string) => Promise<void>;
  onRequestDisconnect: () => void;
}

export function GoogleDriveConfigSheet({
  visible,
  config,
  hasSavedTokens,
  presetClientId,
  onClose,
  onAuthorize,
  onRequestDisconnect,
}: GoogleDriveConfigSheetProps): React.JSX.Element {
  const { theme } = useTheme();
  const sheetRef = useRef<BottomSheetHandle>(null);

  const [prevVisible, setPrevVisible] = useState(false);
  const [clientId, setClientId] = useState(config.clientId);
  const [guideOpen, setGuideOpen] = useState(
    !presetClientId && !config.clientId && !hasSavedTokens
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [authorizing, setAuthorizing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  if (visible && !prevVisible) {
    setPrevVisible(true);
    setClientId(config.clientId);
    setGuideOpen(!presetClientId && !config.clientId && !hasSavedTokens);
    setCopiedKey(null);
    setErrorText(null);
  } else if (!visible && prevVisible) {
    setPrevVisible(false);
  }

  useEffect(() => {
    if (!copiedKey) {
      return;
    }
    const timer = setTimeout(() => setCopiedKey(null), 1500);
    return () => clearTimeout(timer);
  }, [copiedKey]);

  const handleCopy = (key: string, value: string) => {
    Clipboard.setString(value);
    hapticLight();
    setCopiedKey(key);
  };

  const handleAuthorize = async () => {
    if (authorizing) {
      return;
    }
    setAuthorizing(true);
    setErrorText(null);
    try {
      await onAuthorize(clientId.trim());
      hapticSuccess();
      sheetRef.current?.dismiss();
    } catch (err) {
      hapticWarning();
      setErrorText(err instanceof Error ? err.message : 'Google Drive 授权失败');
    } finally {
      setAuthorizing(false);
    }
  };

  const isConnected = hasSavedTokens && config.enabled;

  return (
    <BottomSheet
      ref={sheetRef}
      visible={visible}
      onClose={onClose}
      title="配置 Google Drive"
      subtitle={`仅申请 drive.file 最小权限，备份至 ${GOOGLE_DRIVE_FOLDER_NAME}/ 目录`}
      expandable
      scrollable
      avoidKeyboard
      collapsedRatio={0.72}
      contentContainerStyle={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.sm,
        paddingBottom: theme.spacing.lg,
        gap: theme.spacing.md,
      }}
      footer={
        <View
          style={[
            styles.footerBar,
            {
              borderTopColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceOverlay,
              paddingHorizontal: theme.spacing.lg,
              paddingTop: theme.spacing.md,
              paddingBottom: theme.spacing.md,
            },
          ]}
        >
          <Button
            label={isConnected ? '重新登录并刷新授权' : '登录并授权 Google Drive'}
            variant="primary"
            loading={authorizing}
            onPress={() => void handleAuthorize()}
            style={styles.fullBtn}
          />
        </View>
      }
    >
      {/* 已连接账号状态 */}
      {isConnected ? (
        <View
          style={[
            styles.accountCard,
            {
              backgroundColor: theme.colors.incomeSubtle,
              borderRadius: theme.radius.md,
              padding: theme.spacing.md,
            },
          ]}
        >
          <AppIcon
            name="checkmark-circle-outline"
            size={20}
            color={theme.colors.incomeTextOnSubtle}
          />
          <View style={styles.flexBody}>
            <Text
              style={{
                color: theme.colors.incomeTextOnSubtle,
                fontSize: theme.fontSize.sm,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              {config.accountEmail ?? config.accountName ?? '已授权 Google 账号'}
            </Text>
            <Text
              style={{
                color: theme.colors.incomeTextOnSubtle,
                fontSize: theme.fontSize.xs,
                marginTop: 2,
              }}
            >
              OAuth 令牌已由系统硬件加密保存
            </Text>
          </View>
        </View>
      ) : null}

      {/* Android OAuth Client ID */}
      <View style={{ gap: theme.spacing.xs }}>
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontSize: theme.fontSize.xs,
            fontWeight: theme.fontWeight.semibold,
          }}
        >
          Android OAuth Client ID{presetClientId ? '（可选，留空使用内置配置）' : ''}
        </Text>
        <TextInput
          value={clientId}
          onChangeText={(text) => {
            setClientId(text);
            setErrorText(null);
          }}
          placeholder={
            presetClientId
              ? '已预置构建期 Client ID，留空即可直接登录'
              : '例如：1234567890-xxxx.apps.googleusercontent.com'
          }
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!authorizing}
          style={[
            styles.input,
            {
              color: theme.colors.text,
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.borderStrong,
              borderRadius: theme.radius.md,
              fontSize: theme.fontSize.sm,
            },
          ]}
        />
      </View>

      {/* 固定回调参数（一键复制） */}
      <View
        style={[
          styles.infoCard,
          {
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.md,
            padding: theme.spacing.md,
            gap: theme.spacing.sm,
          },
        ]}
      >
        <View style={styles.copyRow}>
          <View style={styles.flexBody}>
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
              Android 包名
            </Text>
            <Text
              selectable
              style={{
                color: theme.colors.text,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
                marginTop: 2,
              }}
            >
              {ANDROID_PACKAGE_NAME}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => handleCopy('pkg', ANDROID_PACKAGE_NAME)}
            style={[
              styles.copyPill,
              {
                backgroundColor: theme.colors.actionSubtle,
                borderRadius: theme.radius.full,
              },
            ]}
          >
            <Text
              style={{
                color: theme.colors.actionTextOnSubtle,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              {copiedKey === 'pkg' ? '已复制' : '复制'}
            </Text>
          </Pressable>
        </View>

        <View style={[styles.hairline, { backgroundColor: theme.colors.border }]} />

        <View style={styles.copyRow}>
          <View style={styles.flexBody}>
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
              OAuth 回调 URI
            </Text>
            <Text
              selectable
              style={{
                color: theme.colors.text,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
                marginTop: 2,
              }}
            >
              {GOOGLE_DRIVE_REDIRECT_URI}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => handleCopy('uri', GOOGLE_DRIVE_REDIRECT_URI)}
            style={[
              styles.copyPill,
              {
                backgroundColor: theme.colors.actionSubtle,
                borderRadius: theme.radius.full,
              },
            ]}
          >
            <Text
              style={{
                color: theme.colors.actionTextOnSubtle,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              {copiedKey === 'uri' ? '已复制' : '复制'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* 可折叠 3 步创建指引 */}
      <View
        style={[
          styles.guideBox,
          {
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            hapticLight();
            setGuideOpen((prev) => !prev);
          }}
          style={styles.guideHeader}
        >
          <Text
            style={{
              flex: 1,
              color: theme.colors.textSecondary,
              fontSize: theme.fontSize.xs,
              fontWeight: theme.fontWeight.semibold,
            }}
          >
            如何获取 Android OAuth Client ID？
          </Text>
          <AppIcon
            name={guideOpen ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={theme.colors.textMuted}
          />
        </Pressable>
        {guideOpen ? (
          <View style={styles.guideBody}>
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs, lineHeight: 18 }}>
              1. 在 Google Cloud Console 启用 Google Drive API，并在 OAuth 同意屏幕添加你的测试邮箱。
            </Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs, lineHeight: 18 }}>
              2. 创建「Android」类型 OAuth 客户端 ID，填入上方包名与签名证书 SHA-1，并开启自定义 URI scheme。
            </Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs, lineHeight: 18 }}>
              3. 将生成的 Client ID 粘贴到上方输入框，点击底部按钮在系统浏览器中完成 PKCE 安全登录。
            </Text>
          </View>
        ) : null}
      </View>

      {errorText ? (
        <View
          style={[
            styles.errorBanner,
            {
              backgroundColor: theme.colors.expenseSubtle,
              borderLeftColor: theme.colors.expense,
              borderRadius: theme.radius.sm,
            },
          ]}
        >
          <Text style={{ color: theme.colors.expenseTextOnSubtle, fontSize: theme.fontSize.xs }}>
            {errorText}
          </Text>
        </View>
      ) : null}

      {hasSavedTokens ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="断开 Google Drive 授权"
          disabled={authorizing}
          onPress={() => {
            hapticLight();
            sheetRef.current?.dismiss(onRequestDisconnect);
          }}
          style={({ pressed }) => [
            styles.disconnectBtn,
            pressed && { opacity: theme.opacity.pressed },
          ]}
        >
          <AppIcon name="unlink-outline" size={16} color={theme.colors.expense} />
          <Text
            style={{
              color: theme.colors.expense,
              fontSize: theme.fontSize.sm,
              fontWeight: theme.fontWeight.semibold,
            }}
          >
            断开授权并清除本地令牌
          </Text>
        </Pressable>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  flexBody: {
    flex: 1,
    minWidth: 0,
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  infoCard: {},
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  copyPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
  },
  guideBox: {
    overflow: 'hidden',
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  guideBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 6,
  },
  errorBanner: {
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  footerBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  fullBtn: {
    width: '100%',
  },
});
