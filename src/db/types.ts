/**
 * SQLite 执行器抽象契约
 * 用于屏蔽运行时（expo-sqlite）与单元测试（node:sqlite）的底层驱动差异。
 */

export type SqlBindValue = string | number | null;

export interface SqlRunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface SqlExecutor {
  /** 执行无返回结果的 DDL 或多条静态 SQL（严禁拼接用户输入） */
  exec(sql: string): Promise<void>;
  /** 执行参数化写入语句（INSERT / UPDATE / DELETE） */
  run(sql: string, params?: readonly SqlBindValue[]): Promise<SqlRunResult>;
  /** 执行参数化查询并返回首行，不存在则返回 null */
  getFirst<T>(sql: string, params?: readonly SqlBindValue[]): Promise<T | null>;
  /** 执行参数化查询并返回全部行 */
  getAll<T>(sql: string, params?: readonly SqlBindValue[]): Promise<T[]>;
  /** 在原子事务内执行任务；抛出异常时自动回滚 */
  withTransaction<T>(task: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}
