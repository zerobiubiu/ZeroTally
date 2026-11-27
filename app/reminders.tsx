/**
 * 设置内「提醒与小组件」二级页：
 * - 上半区：可选每日记账本地提醒（默认关闭，用户主动开启时再请求系统通知权限）
 * - 下半区：Android 桌面小组件预览与添加指引（原生零依赖实现，自动读取当月收支并尊重隐私隐藏金额开关）
 */
import { Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../src/db/database-context';
import { syncDailyReminderSchedule } from '../src/features/reminders/native-reminder';
import {
  getDailyReminderConfig,
  saveDailyReminderConfig,
} from '../src/features/reminders/repository';
import {
  DEFAULT_DAILY_REMINDER_CONFIG,
  formatReminderTime,
  MAX_REMINDER_MESSAGE_LENGTH,
  PRESET_REMINDER_TIMES,
  stepReminderTime,
} from '../src/features/reminders/rules';
import type { DailyReminderConfig } from '../src/features/reminders/types';
import { hapticLight, hapticSuccess } from '../src/shared/haptics/haptics';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { Button } from '../src/shared/ui/Button';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { useTheme } from '../src/theme/theme-context';

export default function RemindersScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { db } = useDatabase();

  const [config, setConfig] = useState<DailyReminderConfig>(DEFAULT_DAILY_REMINDER_CONFIG);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    void getDailyReminderConfig(db).then((saved) => {
      if (active) {
        setConfig(saved);
      }
    });
    return () => {
      active = false;
    };
  }, [db]);

  const persistAndSync = async (next: DailyReminderConfig) => {
    setSaving(true);
    setNotice(null);
    try {
      const saved = await saveDailyReminderConfig(db, next);
      setConfig(saved);
      const result = await syncDailyReminderSchedule(saved);
      if (saved.enabled && result.permissionDenied) {
        const disabledFallback = await saveDailyReminderConfig(db, { ...saved, enabled: false });
        setConfig(disabledFallback);
        setNotice({
          tone: 'warn',
          text: '未获得系统通知权限，请在系统设置中允许 ZeroTally 发送通知后再开启',
        });
        return;
      }
      hapticSuccess();
      setNotice({
        tone: 'ok',
        text: saved.enabled
          ? `已设置每天 ${formatReminderTime(saved.hour, saved.minute)} 提醒记账`
          : '已关闭每日记账提醒',
      });
    } catch (err) {
      setNotice({
        tone: 'warn',
        text: err instanceof Error ? err.message : '更新提醒失败',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = (enabled: boolean) => {
    hapticLight();
    void persistAndSync({ ...config, enabled });
  };

  const handleStep = (deltaMinutes: number) => {
    hapticLight();
    const nextTime = stepReminderTime(config.hour, config.minute, deltaMinutes);
    setConfig((prev) => ({ ...prev, ...nextTime }));
  };

  return (
    <SafeScreen edges={['left', 'right']} style={{ backgroundColor: theme.colors.surfaceGrouped }}>
      <Stack.Screen options={{ title: '提醒与小组件' }} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.xl,
          gap: 16,
        }}
      >
        {/* 每日记账提醒 */}
        <View style={{ gap: 8 }}>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.fontSize.xs,
              fontWeight: theme.fontWeight.semibold,
              paddingHorizontal: 4,
            }}
          >
            每日记账提醒
          </Text>

          <View
            style={[
              styles.card,
              { backgroundColor: theme.colors.surfaceRaised, borderRadius: 14 },
            ]}
          >
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontSize: theme.fontSize.base,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  开启本地定时提醒
                </Text>
                <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginTop: 2 }}>
                  完全离线由手机本地定时触发，点击通知直达记一笔
                </Text>
              </View>
              <Switch
                value={config.enabled}
                disabled={saving}
                onValueChange={handleToggleEnabled}
                trackColor={{ false: theme.colors.chipInactive, true: theme.colors.action }}
                thumbColor={theme.colors.surfaceRaised}
              />
            </View>

            {config.enabled ? (
              <View
                style={[
                  styles.configBody,
                  {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: theme.colors.divider,
                  },
                ]}
              >
                {/* 时间微调 */}
                <View style={styles.timeStepper}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="提前 15 分钟"
                    onPress={() => handleStep(-15)}
                    style={({ pressed }) => [
                      styles.stepBtn,
                      { backgroundColor: theme.colors.surfaceGrouped, borderRadius: 10 },
                      pressed && { opacity: theme.opacity.pressed },
                    ]}
                  >
                    <Text
                      style={{
                        color: theme.colors.textSecondary,
                        fontSize: 13,
                        fontWeight: theme.fontWeight.semibold,
                      }}
                    >
                      -15分
                    </Text>
                  </Pressable>

                  <Text
                    style={[
                      styles.tabular,
                      {
                        color: theme.colors.text,
                        fontSize: 30,
                        fontWeight: theme.fontWeight.semibold,
                      },
                    ]}
                  >
                    {formatReminderTime(config.hour, config.minute)}
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="推后 15 分钟"
                    onPress={() => handleStep(15)}
                    style={({ pressed }) => [
                      styles.stepBtn,
                      { backgroundColor: theme.colors.surfaceGrouped, borderRadius: 10 },
                      pressed && { opacity: theme.opacity.pressed },
                    ]}
                  >
                    <Text
                      style={{
                        color: theme.colors.textSecondary,
                        fontSize: 13,
                        fontWeight: theme.fontWeight.semibold,
                      }}
                    >
                      +15分
                    </Text>
                  </Pressable>
                </View>

                {/* 常用时段胶囊 */}
                <View style={styles.presetRow}>
                  {PRESET_REMINDER_TIMES.map((preset) => {
                    const selected =
                      config.hour === preset.hour && config.minute === preset.minute;
                    return (
                      <Pressable
                        key={preset.label}
                        onPress={() => {
                          hapticLight();
                          setConfig((prev) => ({
                            ...prev,
                            hour: preset.hour,
                            minute: preset.minute,
                          }));
                        }}
                        style={[
                          styles.presetChip,
                          {
                            backgroundColor: selected
                              ? theme.colors.actionSurface
                              : theme.colors.surfaceGrouped,
                            borderRadius: 9,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.tabular,
                            {
                              color: selected ? theme.colors.action : theme.colors.textSecondary,
                              fontSize: 12,
                              fontWeight: selected
                                ? theme.fontWeight.semibold
                                : theme.fontWeight.regular,
                            },
                          ]}
                        >
                          {preset.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* 自定义提醒文案 */}
                <View style={{ gap: 6 }}>
                  <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>提醒文案</Text>
                  <TextInput
                    value={config.message}
                    onChangeText={(txt) =>
                      setConfig((prev) => ({
                        ...prev,
                        message: txt.slice(0, MAX_REMINDER_MESSAGE_LENGTH),
                      }))
                    }
                    placeholder={DEFAULT_DAILY_REMINDER_CONFIG.message}
                    placeholderTextColor={theme.colors.placeholder}
                    style={[
                      styles.msgInput,
                      {
                        backgroundColor: theme.colors.surfaceGrouped,
                        color: theme.colors.text,
                        borderRadius: 10,
                      },
                    ]}
                  />
                </View>

                <Button
                  label={saving ? '保存中...' : '保存提醒时间'}
                  disabled={saving}
                  onPress={() => void persistAndSync(config)}
                />
              </View>
            ) : null}
          </View>
        </View>

        {notice ? (
          <View
            style={[
              styles.noticeBar,
              {
                backgroundColor:
                  notice.tone === 'ok' ? theme.colors.actionSurface : theme.colors.warningSubtle,
                borderRadius: 10,
              },
            ]}
          >
            <AppIcon
              name={notice.tone === 'ok' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              size={16}
              color={notice.tone === 'ok' ? theme.colors.action : theme.colors.warningTextOnSubtle}
            />
            <Text
              style={{
                flex: 1,
                color:
                  notice.tone === 'ok' ? theme.colors.action : theme.colors.warningTextOnSubtle,
                fontSize: 12,
              }}
            >
              {notice.text}
            </Text>
          </View>
        ) : null}

        {/* Android 桌面小组件 */}
        <View style={{ gap: 8 }}>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.fontSize.xs,
              fontWeight: theme.fontWeight.semibold,
              paddingHorizontal: 4,
            }}
          >
            Android 桌面小组件
          </Text>

          <View
            style={[
              styles.card,
              { backgroundColor: theme.colors.surfaceRaised, borderRadius: 14, gap: 14 },
            ]}
          >
            {/* 小组件静态视觉预览 */}
            <View
              style={[
                styles.widgetPreview,
                { backgroundColor: theme.colors.heroBg, borderRadius: 16 },
              ]}
            >
              <View style={styles.widgetTop}>
                <Text
                  style={{
                    color: theme.colors.heroSubtext,
                    fontSize: 12,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  ZeroTally · 本月概览
                </Text>
                <View
                  style={[
                    styles.widgetCtaPill,
                    { backgroundColor: theme.colors.surfaceRaised, borderRadius: 999 },
                  ]}
                >
                  <Text
                    style={{
                      color: theme.colors.action,
                      fontSize: 12,
                      fontWeight: theme.fontWeight.semibold,
                    }}
                  >
                    + 记一笔
                  </Text>
                </View>
              </View>

              <View style={styles.widgetMetrics}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.heroSubtext, fontSize: 11 }}>本月支出</Text>
                  <Text
                    style={[
                      styles.tabular,
                      {
                        color: theme.colors.heroText,
                        fontSize: 20,
                        fontWeight: theme.fontWeight.semibold,
                        marginTop: 2,
                      },
                    ]}
                  >
                    ¥1,280.50
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.heroSubtext, fontSize: 11 }}>本月收入</Text>
                  <Text
                    style={[
                      styles.tabular,
                      {
                        color: theme.colors.heroText,
                        fontSize: 20,
                        fontWeight: theme.fontWeight.semibold,
                        marginTop: 2,
                      },
                    ]}
                  >
                    ¥8,500.00
                  </Text>
                </View>
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: theme.fontSize.sm,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                如何添加到手机桌面
              </Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 }}>
                1. 在 Android 手机主屏幕空白处长按，进入「小组件 / 桌面插件」。{'\n'}
                2. 找到「ZeroTally 记账小组件」（4×2），拖动到桌面即可查看当月净支出/收入，并一键直达「记一笔」。{'\n'}
                3. 若在隐私与安全中开启了「默认隐藏敏感金额」，桌面小组件会自动同步脱敏显示为 ••••。
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  configBody: {
    marginTop: 14,
    paddingTop: 14,
    gap: 14,
  },
  timeStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  msgInput: {
    height: 44,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  noticeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  widgetPreview: {
    padding: 14,
    gap: 12,
  },
  widgetTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  widgetCtaPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  widgetMetrics: {
    flexDirection: 'row',
    gap: 12,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
