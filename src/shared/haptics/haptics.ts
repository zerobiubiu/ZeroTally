/**
 * 全应用马达震动反馈统一封装：
 * - 自动忽略无震动硬件或模拟器上的异常，避免业务层散落 try/catch
 * - 按交互语义分层：selection（轻切）/ light（轻击与快捷入账）/ medium（拖拽起手与长按触发）/ longAlert（撤回长震动提醒）/ success / warning
 */
import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

export function hapticSelection(): void {
  void Haptics.selectionAsync().catch(() => {});
}

export function hapticLight(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function hapticMedium(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

export function hapticSuccess(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function hapticWarning(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

/**
 * 撤回等强感知操作的长震动提醒（Android 使用 140ms 持续震动，与轻震动形成鲜明触感区分）。
 */
export function hapticLongAlert(): void {
  if (Platform.OS === 'android') {
    try {
      Vibration.vibrate(140);
      return;
    } catch {
      // 回退到 Expo Haptics
    }
  }
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  setTimeout(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  }, 75);
}
