import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { SqlBindValue, SqlExecutor, SqlRunResult } from './types';

const DATABASE_NAME = 'keep_accounts.db';

let savepointCounter = 0;

interface ExpoQueryLike {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlBindValue[]): Promise<{ changes: number; lastInsertRowId: number }>;
  getFirstAsync<T>(source: string, params: SqlBindValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, params: SqlBindValue[]): Promise<T[]>;
}

function wrapTransactionExecutor(txn: ExpoQueryLike): SqlExecutor {
  const executor: SqlExecutor = {
    async exec(sql: string): Promise<void> {
      await txn.execAsync(sql);
    },
    async run(sql: string, params: readonly SqlBindValue[] = []): Promise<SqlRunResult> {
      const res = await txn.runAsync(sql, [...params]);
      return {
        changes: res.changes,
        lastInsertRowId: res.lastInsertRowId,
      };
    },
    async getFirst<T>(sql: string, params: readonly SqlBindValue[] = []): Promise<T | null> {
      return txn.getFirstAsync<T>(sql, [...params]);
    },
    async getAll<T>(sql: string, params: readonly SqlBindValue[] = []): Promise<T[]> {
      return txn.getAllAsync<T>(sql, [...params]);
    },
    async withTransaction<T>(task: (nestedTx: SqlExecutor) => Promise<T>): Promise<T> {
      savepointCounter += 1;
      const spName = `sp_nested_${savepointCounter}`;
      await txn.execAsync(`SAVEPOINT ${spName}`);
      try {
        const result = await task(executor);
        await txn.execAsync(`RELEASE SAVEPOINT ${spName}`);
        return result;
      } catch (error) {
        await txn.execAsync(`ROLLBACK TO SAVEPOINT ${spName}`);
        await txn.execAsync(`RELEASE SAVEPOINT ${spName}`);
        throw error;
      }
    },
  };
  return executor;
}

function wrapDatabaseExecutor(db: SQLiteDatabase): SqlExecutor {
  return {
    async exec(sql: string): Promise<void> {
      await db.execAsync(sql);
    },
    async run(sql: string, params: readonly SqlBindValue[] = []): Promise<SqlRunResult> {
      const res = await db.runAsync(sql, [...params]);
      return {
        changes: res.changes,
        lastInsertRowId: res.lastInsertRowId,
      };
    },
    async getFirst<T>(sql: string, params: readonly SqlBindValue[] = []): Promise<T | null> {
      return db.getFirstAsync<T>(sql, [...params]);
    },
    async getAll<T>(sql: string, params: readonly SqlBindValue[] = []): Promise<T[]> {
      return db.getAllAsync<T>(sql, [...params]);
    },
    async withTransaction<T>(task: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      let result!: T;
      await db.withExclusiveTransactionAsync(async (txn) => {
        result = await task(wrapTransactionExecutor(txn));
      });
      return result;
    },
  };
}

let cachedExecutorPromise: Promise<SqlExecutor> | null = null;

/**
 * 打开或复用 Android/移动端本地 SQLite 数据库连接
 */
export function getExpoDatabase(): Promise<SqlExecutor> {
  if (!cachedExecutorPromise) {
    cachedExecutorPromise = SQLite.openDatabaseAsync(DATABASE_NAME).then((db) =>
      wrapDatabaseExecutor(db)
    );
  }
  return cachedExecutorPromise;
}
