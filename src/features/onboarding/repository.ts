import type { SqlExecutor } from '../../db/types';
import { getAppSetting, setAppSetting } from '../settings/repository';
import { ONBOARDING_TIPS_SETTING_KEY, shouldShowFirstLaunchGuide } from './rules';

export async function getShouldShowFirstLaunchGuide(db: SqlExecutor): Promise<boolean> {
  const raw = await getAppSetting(db, ONBOARDING_TIPS_SETTING_KEY);
  return shouldShowFirstLaunchGuide(raw);
}

export async function markFirstLaunchGuideSeen(db: SqlExecutor): Promise<void> {
  await setAppSetting(db, ONBOARDING_TIPS_SETTING_KEY, '1');
}
