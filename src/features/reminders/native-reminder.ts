/**
 * 本地每日记账提醒系统通知适配层（基于 expo-notifications，100% 本地定时触发、零远端推送依赖）。
 */
import {
  addNotificationResponseReceivedListener,
  AndroidImportance,
  cancelScheduledNotificationAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  SchedulableTriggerInputTypes,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
  setNotificationHandler,
} from 'expo-notifications';
import { Platform } from 'react-native';
import {
  DAILY_REMINDER_CHANNEL_ID,
  DAILY_REMINDER_NOTIFICATION_ID,
} from './rules';
import type { DailyReminderConfig } from './types';

let handlerConfigured = false;

export function ensureNotificationHandlerConfigured(): void {
  if (handlerConfigured || Platform.OS === 'web') {
    return;
  }
  handlerConfigured = true;
  setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  await setNotificationChannelAsync(DAILY_REMINDER_CHANNEL_ID, {
    name: '每日记账提醒',
    importance: AndroidImportance.DEFAULT,
    vibrationPattern: [0, 180],
    lightColor: '#017853',
  });
}

async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }
  const current = await getPermissionsAsync();
  if (current.granted) {
    return true;
  }
  const requested = await requestPermissionsAsync();
  return requested.granted;
}

/**
 * 幂等同步系统每日本地定时提醒：先取消旧计划再按需重建，保证同一时刻最多只存在 1 条每日提醒。
 */
export async function syncDailyReminderSchedule(
  config: DailyReminderConfig
): Promise<{ scheduled: boolean; permissionDenied: boolean }> {
  if (Platform.OS === 'web') {
    return { scheduled: false, permissionDenied: false };
  }

  ensureNotificationHandlerConfigured();

  try {
    await cancelScheduledNotificationAsync(DAILY_REMINDER_NOTIFICATION_ID);
  } catch {
    // 若此前未注册该标识，安全忽略
  }

  if (!config.enabled) {
    return { scheduled: false, permissionDenied: false };
  }

  const granted = await requestNotificationPermission();
  if (!granted) {
    return { scheduled: false, permissionDenied: true };
  }

  await ensureAndroidChannel();

  await scheduleNotificationAsync({
    identifier: DAILY_REMINDER_NOTIFICATION_ID,
    content: {
      title: 'ZeroTally 记账提醒',
      body: config.message,
      sound: 'default',
      data: { route: '/record' },
    },
    trigger: {
      type: SchedulableTriggerInputTypes.DAILY,
      channelId: DAILY_REMINDER_CHANNEL_ID,
      hour: config.hour,
      minute: config.minute,
    },
  });

  return { scheduled: true, permissionDenied: false };
}

/**
 * 监听用户点击本地提醒通知进入应用，回调通知载荷中的目标路由（默认 '/record'）。
 */
export function subscribeReminderNotificationTap(
  onNavigate: (route: string) => void
): () => void {
  if (Platform.OS === 'web') {
    return () => {};
  }
  ensureNotificationHandlerConfigured();
  const sub = addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { route?: unknown } | undefined;
    if (typeof data?.route === 'string' && data.route.startsWith('/')) {
      onNavigate(data.route);
    }
  });
  return () => {
    sub.remove();
  };
}
