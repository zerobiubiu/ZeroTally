/**
 * 隐私与安全中心领域类型定义（所有安全与隐私项均为用户自主开启的个性化可选项）
 */

export type RelockTimeoutSeconds = 0 | 30 | 60 | 300;

export interface PrivacySecurityConfig {
  /** 应用启动锁（冷启动与后台返回超期后需验证解锁） */
  appLockEnabled: boolean;
  /** 允许调用系统生物识别器（指纹 / 面容）解锁 */
  biometricEnabled: boolean;
  /** 切到后台超过该秒数返回时重新上锁（0 表示立即上锁） */
  relockTimeoutSeconds: RelockTimeoutSeconds;
  /** 开启防截屏与后台任务切换遮罩 */
  preventScreenCapture: boolean;
  /** 每次启动默认隐藏敏感金额（显示为 ****） */
  hideAmountsByDefault: boolean;
  /** 在明细与资产总览卡展示快捷小眼睛显隐按钮 */
  showAmountPrivacyToggle: boolean;
  /** 是否已设置本地独立 4~6 位数字密码（密码加盐哈希仅存于系统 SecureStore） */
  hasPin: boolean;
}

export interface BiometricCapability {
  hasHardware: boolean;
  isEnrolled: boolean;
  label: string;
}

export interface PinVerifyResult {
  ok: boolean;
  message?: string;
}
