export interface DailyReminderConfig {
  /** 是否开启每日记账提醒（默认关闭，绝不主动打扰用户） */
  enabled: boolean;
  /** 每日提醒小时（0-23） */
  hour: number;
  /** 每日提醒分钟（0-59） */
  minute: number;
  /** 提醒通知正文 */
  message: string;
}
