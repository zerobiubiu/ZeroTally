/**
 * 约束简报（Workflow B）：
 * - 基于统一 BottomSheet（可上滑展开 + 内置滚动 + 软键盘避让 + 贴底操作栏）承载 WebDAV 服务器与凭据配置
 * - 凭据安全：密码输入带显隐切换；已保存密码编辑态留空默认沿用原密码，避免回显明文；默认要求 HTTPS，HTTP 开关附带警示条
 * - Modal 互斥：点击「断开连接」经 sheetRef.dismiss 收起后再交由父页弹出确认框，杜绝 Android 双层 Modal 叠加
 */
import React, { useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { hapticLight, hapticSuccess, hapticWarning } from '../../../shared/haptics/haptics';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { BottomSheet, type BottomSheetHandle } from '../../../shared/ui/BottomSheet';
import { Button } from '../../../shared/ui/Button';
import { useTheme } from '../../../theme/theme-context';
import { WEBDAV_PRESETS } from '../rules';
import type { SaveWebDavInput, WebDavConfig } from '../types';

export interface WebDavConfigSheetProps {
  visible: boolean;
  config: WebDavConfig;
  hasSavedPassword: boolean;
  onClose: () => void;
  onTest: (input: SaveWebDavInput) => Promise<void>;
  onSave: (input: SaveWebDavInput) => Promise<void>;
  onRequestDisconnect: () => void;
}

export function WebDavConfigSheet({
  visible,
  config,
  hasSavedPassword,
  onClose,
  onTest,
  onSave,
  onRequestDisconnect,
}: WebDavConfigSheetProps): React.JSX.Element {
  const { theme } = useTheme();
  const sheetRef = useRef<BottomSheetHandle>(null);

  const [prevVisible, setPrevVisible] = useState(false);
  const [serverUrl, setServerUrl] = useState(config.serverUrl);
  const [username, setUsername] = useState(config.username);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remoteDirectory, setRemoteDirectory] = useState(config.remoteDirectory || '/ZeroTally');
  const [allowInsecureHttp, setAllowInsecureHttp] = useState(config.allowInsecureHttp);
  const [activePresetId, setActivePresetId] = useState<string>('custom');

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);

  if (visible && !prevVisible) {
    setPrevVisible(true);
    setServerUrl(config.serverUrl);
    setUsername(config.username);
    setPassword('');
    setShowPassword(false);
    setRemoteDirectory(config.remoteDirectory || '/ZeroTally');
    setAllowInsecureHttp(config.allowInsecureHttp);
    setFeedback(null);

    if (config.serverUrl.includes('jianguoyun.com')) {
      setActivePresetId('jianguoyun');
    } else if (config.serverUrl.includes('/remote.php/dav')) {
      setActivePresetId('nextcloud');
    } else {
      setActivePresetId('custom');
    }
  } else if (!visible && prevVisible) {
    setPrevVisible(false);
  }

  const busy = testing || saving;

  const buildInput = (): SaveWebDavInput => ({
    serverUrl,
    username,
    password: password || undefined,
    remoteDirectory,
    allowInsecureHttp,
    enabled: true,
  });

  const handleSelectPreset = (presetId: string) => {
    hapticLight();
    setActivePresetId(presetId);
    setFeedback(null);
    const preset = WEBDAV_PRESETS.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }
    if (preset.serverUrl) {
      setServerUrl(preset.serverUrl);
    }
    if (!remoteDirectory.trim()) {
      setRemoteDirectory(preset.defaultDirectory);
    }
  };

  const handleTest = async () => {
    if (busy) {
      return;
    }
    setTesting(true);
    setFeedback(null);
    try {
      await onTest(buildInput());
      hapticSuccess();
      setFeedback({
        tone: 'success',
        message: '连接成功，账号与应用密码校验通过',
      });
    } catch (err) {
      hapticWarning();
      setFeedback({
        tone: 'error',
        message: err instanceof Error ? err.message : '连接测试失败',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (busy) {
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      await onSave(buildInput());
      hapticSuccess();
      sheetRef.current?.dismiss();
    } catch (err) {
      hapticWarning();
      setFeedback({
        tone: 'error',
        message: err instanceof Error ? err.message : '保存配置失败',
      });
    } finally {
      setSaving(false);
    }
  };

  const activePreset = WEBDAV_PRESETS.find((item) => item.id === activePresetId);
  const canDisconnect = hasSavedPassword || config.serverUrl.length > 0;

  return (
    <BottomSheet
      ref={sheetRef}
      visible={visible}
      onClose={onClose}
      title="配置 WebDAV"
      subtitle="密码由系统硬件安全区加密存储"
      expandable
      scrollable
      avoidKeyboard
      collapsedRatio={0.74}
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
              gap: theme.spacing.sm,
            },
          ]}
        >
          <Button
            label="测试连接"
            variant="secondary"
            loading={testing}
            disabled={saving}
            onPress={() => void handleTest()}
            style={styles.footerBtn}
          />
          <Button
            label="保存配置"
            variant="primary"
            loading={saving}
            disabled={testing}
            onPress={() => void handleSave()}
            style={styles.footerBtn}
          />
        </View>
      }
    >
      {/* 常用服务快捷预设 */}
      <View style={{ gap: theme.spacing.xs }}>
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontSize: theme.fontSize.xs,
            fontWeight: theme.fontWeight.semibold,
          }}
        >
          服务预设
        </Text>
        <View style={styles.presetRow}>
          {WEBDAV_PRESETS.map((preset) => {
            const selected = activePresetId === preset.id;
            return (
              <Pressable
                key={preset.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => handleSelectPreset(preset.id)}
                style={[
                  styles.presetChip,
                  {
                    borderRadius: theme.radius.full,
                    borderWidth: theme.borderWidth.hairline,
                    borderColor: selected ? theme.colors.action : theme.colors.borderStrong,
                    backgroundColor: selected
                      ? theme.colors.actionSubtle
                      : theme.colors.surface,
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: theme.spacing.xs + 2,
                  },
                ]}
              >
                <Text
                  style={{
                    color: selected
                      ? theme.colors.actionTextOnSubtle
                      : theme.colors.textSecondary,
                    fontSize: theme.fontSize.xs,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  {preset.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {activePreset ? (
          <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
            {activePreset.hint}
          </Text>
        ) : null}
      </View>

      {/* 服务器地址 */}
      <View style={{ gap: theme.spacing.xs }}>
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontSize: theme.fontSize.xs,
            fontWeight: theme.fontWeight.semibold,
          }}
        >
          服务器地址
        </Text>
        <TextInput
          value={serverUrl}
          onChangeText={(text) => {
            setServerUrl(text);
            setFeedback(null);
          }}
          placeholder="https://dav.jianguoyun.com/dav/"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!busy}
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

      {/* 账号 */}
      <View style={{ gap: theme.spacing.xs }}>
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontSize: theme.fontSize.xs,
            fontWeight: theme.fontWeight.semibold,
          }}
        >
          账号
        </Text>
        <TextInput
          value={username}
          onChangeText={(text) => {
            setUsername(text);
            setFeedback(null);
          }}
          placeholder="邮箱或 WebDAV 用户名"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
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

      {/* 密码 / 应用专用密码 */}
      <View style={{ gap: theme.spacing.xs }}>
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontSize: theme.fontSize.xs,
            fontWeight: theme.fontWeight.semibold,
          }}
        >
          密码 / 应用专用密码
        </Text>
        <View
          style={[
            styles.passwordWrap,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.borderStrong,
              borderRadius: theme.radius.md,
            },
          ]}
        >
          <TextInput
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setFeedback(null);
            }}
            placeholder={hasSavedPassword ? '已加密保存，留空保持不变' : '请输入密码或应用密码'}
            placeholderTextColor={theme.colors.textMuted}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            style={[
              styles.passwordInput,
              {
                color: theme.colors.text,
                fontSize: theme.fontSize.sm,
              },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showPassword ? '隐藏密码' : '显示密码'}
            onPress={() => setShowPassword((prev) => !prev)}
            hitSlop={8}
            style={styles.eyeBtn}
          >
            <AppIcon
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={theme.colors.textMuted}
            />
          </Pressable>
        </View>
      </View>

      {/* 远端目录 */}
      <View style={{ gap: theme.spacing.xs }}>
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontSize: theme.fontSize.xs,
            fontWeight: theme.fontWeight.semibold,
          }}
        >
          远端目录
        </Text>
        <TextInput
          value={remoteDirectory}
          onChangeText={(text) => {
            setRemoteDirectory(text);
            setFeedback(null);
          }}
          placeholder="/ZeroTally"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
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

      {/* 允许局域网 HTTP 明文开关 */}
      <View
        style={[
          styles.switchRow,
          {
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.md,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
          },
        ]}
      >
        <View style={styles.switchBody}>
          <Text
            style={{
              color: theme.colors.text,
              fontSize: theme.fontSize.sm,
              fontWeight: theme.fontWeight.semibold,
            }}
          >
            允许 HTTP 明文连接
          </Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
            仅限家庭 NAS 等局域网服务按需开启
          </Text>
        </View>
        <Switch
          value={allowInsecureHttp}
          onValueChange={(val) => {
            hapticLight();
            setAllowInsecureHttp(val);
            setFeedback(null);
          }}
          disabled={busy}
          trackColor={{
            false: theme.colors.borderStrong,
            true: theme.colors.action,
          }}
          thumbColor={theme.colors.surfaceRaised}
        />
      </View>

      {allowInsecureHttp ? (
        <View
          style={[
            styles.banner,
            {
              backgroundColor: theme.colors.warningSubtle,
              borderLeftColor: theme.colors.warning,
              borderRadius: theme.radius.sm,
            },
          ]}
        >
          <Text style={{ color: theme.colors.warningTextOnSubtle, fontSize: theme.fontSize.xs }}>
            HTTP 连接不加密传输密码与账本内容，切勿在公共 Wi-Fi 或公网地址开启。
          </Text>
        </View>
      ) : null}

      {feedback ? (
        <View
          style={[
            styles.banner,
            {
              backgroundColor:
                feedback.tone === 'success'
                  ? theme.colors.incomeSubtle
                  : theme.colors.expenseSubtle,
              borderLeftColor:
                feedback.tone === 'success' ? theme.colors.income : theme.colors.expense,
              borderRadius: theme.radius.sm,
            },
          ]}
        >
          <Text
            style={{
              color:
                feedback.tone === 'success'
                  ? theme.colors.incomeTextOnSubtle
                  : theme.colors.expenseTextOnSubtle,
              fontSize: theme.fontSize.xs,
            }}
          >
            {feedback.message}
          </Text>
        </View>
      ) : null}

      {canDisconnect ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="断开 WebDAV 并清除密码"
          disabled={busy}
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
            断开连接并清除加密密码
          </Text>
        </Pressable>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {},
  input: {
    minHeight: 46,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  passwordWrap: {
    minHeight: 46,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 8,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 10,
  },
  eyeBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  switchBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  banner: {
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
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtn: {
    flex: 1,
  },
});
