/**
 * 全应用马达震动反馈统一封装：
 * - 自动忽略无震动硬件或模拟器上的异常，避免业务层散落 try/catch
 * - 按交互语义分层：selection（轻切）/ light（轻击与起手）/ medium（拖拽换位与一键入账）/ success / warning
 */
import * as Haptics from 'expo-haptics';

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
