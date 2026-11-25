import { DatabaseSync } from 'node:sqlite';
import type { SqlBindValue, SqlExecutor, SqlRunResult } from './types';

/**
 * Node.js 内置 node:sqlite 内存数据库适配器，专供单元测试运行真实 SQL 与事务验证。
 */
export function createNodeTestDatabase(filename = ':memory:'): {
  db: SqlExecutor;
  close: () => void;
} {
  const nativeDb = new DatabaseSync(filename);
  let txDepth = 0;
  let spCounter = 0;

  const executor: SqlExecutor = {
    async exec(sql: string): Promise<void> {
      nativeDb.exec(sql);
    },
    async run(sql: string, params: readonly SqlBindValue[] = []): Promise<SqlRunResult> {
      const stmt = nativeDb.prepare(sql);
      const res = stmt.run(...params);
      return {
        changes: Number(res.changes),
        lastInsertRowId: Number(res.lastInsertRowid),
      };
    },
    async getFirst<T>(sql: string, params: readonly SqlBindValue[] = []): Promise<T | null> {
      const stmt = nativeDb.prepare(sql);
      const row = stmt.get(...params);
      if (row === undefined) {
        return null;
      }
      return { ...(row as Record<string, unknown>) } as T;
    },
    async getAll<T>(sql: string, params: readonly SqlBindValue[] = []): Promise<T[]> {
      const stmt = nativeDb.prepare(sql);
      const rows = stmt.all(...params);
      return rows.map((row) => ({ ...(row as Record<string, unknown>) }) as T);
    },
    async withTransaction<T>(task: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      const isOuter = txDepth === 0;
      let spName = '';
      if (isOuter) {
        nativeDb.exec('BEGIN IMMEDIATE');
      } else {
        spCounter += 1;
        spName = `sp_test_${spCounter}`;
        nativeDb.exec(`SAVEPOINT ${spName}`);
      }
      txDepth += 1;

      try {
        const result = await task(executor);
        txDepth -= 1;
        if (isOuter) {
          nativeDb.exec('COMMIT');
        } else {
          nativeDb.exec(`RELEASE SAVEPOINT ${spName}`);
        }
        return result;
      } catch (error) {
        txDepth -= 1;
        if (isOuter) {
          nativeDb.exec('ROLLBACK');
        } else {
          nativeDb.exec(`ROLLBACK TO SAVEPOINT ${spName}`);
          nativeDb.exec(`RELEASE SAVEPOINT ${spName}`);
        }
        throw error;
      }
    },
  };

  return {
    db: executor,
    close: () => nativeDb.close(),
  };
}
