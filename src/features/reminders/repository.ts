import type { SqlExecutor } from '../../db/types';
import { getAppSetting, setAppSetting } from '../settings/repository';
import {
  DAILY_REMINDER_CONFIG_KEY,
  normalizeDailyReminderConfig,
  parseDailyReminderConfig,
} from './rules';
import type { DailyReminderConfig } from './types';

export async function getDailyReminderConfig(db: SqlExecutor): Promise<DailyReminderConfig> {
  const raw = await getAppSetting(db, DAILY_REMINDER_CONFIG_KEY);
  return parseDailyReminderConfig(raw);
}

export async function saveDailyReminderConfig(
  db: SqlExecutor,
  config: DailyReminderConfig
): Promise<DailyReminderConfig> {
  const normalized = normalizeDailyReminderConfig(config);
  await setAppSetting(db, DAILY_REMINDER_CONFIG_KEY, JSON.stringify(normalized));
  return normalized;
}
