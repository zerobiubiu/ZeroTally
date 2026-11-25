import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getExpoDatabase } from './expo-client';
import { initializeSchema } from './schema';
import { seedDefaultData } from './seed';
import type { SqlExecutor } from './types';

interface DatabaseContextValue {
  db: SqlExecutor | null;
  isReady: boolean;
  error: string | null;
  /** 每次数据发生写入变更后递增，供页面订阅刷新 */
  revision: number;
  notifyChange: () => void;
}

const DatabaseContext = createContext<DatabaseContextValue | null>(null);

export function DatabaseProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [db, setDb] = useState<SqlExecutor | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;

    async function bootstrap(): Promise<void> {
      try {
        const database = await getExpoDatabase();
        await initializeSchema(database);
        await seedDefaultData(database);
        if (active) {
          setDb(database);
          setIsReady(true);
        }
      } catch (err) {
        if (active) {
          const message = err instanceof Error ? err.message : '初始化本地数据库失败';
          setError(message);
        }
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  const notifyChange = useCallback(() => {
    setRevision((prev) => prev + 1);
  }, []);

  const value = useMemo<DatabaseContextValue>(
    () => ({ db, isReady, error, revision, notifyChange }),
    [db, isReady, error, revision, notifyChange]
  );

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
}

export function useDatabaseContext(): DatabaseContextValue {
  const ctx = useContext(DatabaseContext);
  if (!ctx) {
    throw new Error('useDatabaseContext 必须在 DatabaseProvider 内部使用');
  }
  return ctx;
}

/**
 * 获取已就绪的数据库实例；仅在根布局确认 isReady 后渲染的业务页面中调用。
 */
export function useDatabase(): {
  db: SqlExecutor;
  revision: number;
  notifyChange: () => void;
} {
  const { db, revision, notifyChange } = useDatabaseContext();
  if (!db) {
    throw new Error('数据库尚未初始化完成');
  }
  return { db, revision, notifyChange };
}
