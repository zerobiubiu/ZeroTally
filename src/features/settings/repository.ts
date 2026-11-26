import type { SqlExecutor } from '../../db/types';
import type { ThemePreference } from '../../theme/theme-context';

const THEME_PREFERENCE_KEY = 'theme_preference';

interface SettingRow {
  value: string;
}

export async function getAppSetting(db: SqlExecutor, key: string): Promise<string | null> {
  const row = await db.getFirst<SettingRow>('SELECT value FROM app_settings WHERE key = ?', [key]);
  return row ? row.value : null;
}

export async function setAppSetting(
  db: SqlExecutor,
  key: string,
  value: string,
  updatedAt: string = new Date().toISOString()
): Promise<void> {
  await db.run(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, updatedAt]
  );
}

export async function getThemePreferenceSetting(db: SqlExecutor): Promise<ThemePreference> {
  const raw = await getAppSetting(db, THEME_PREFERENCE_KEY);
  if (raw === 'light' || raw === 'dark' || raw === 'system') {
    return raw;
  }
  return 'system';
}

export async function setThemePreferenceSetting(
  db: SqlExecutor,
  preference: ThemePreference,
  updatedAt?: string
): Promise<void> {
  await setAppSetting(db, THEME_PREFERENCE_KEY, preference, updatedAt);
}
