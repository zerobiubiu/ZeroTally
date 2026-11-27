# 0041：明细与账户详情页 90% 触底懒加载分页

- **状态**：已执行
- **影响范围**：`package.json`、`app.json`、`CHANGELOG.md`、`src/features/transactions/pagination-rules.ts`、`pagination-rules.test.ts`、`types.ts`、`repository.ts`、`service.ts`、`service.test.ts`、`app/(tabs)/index.tsx`、`app/account-detail.tsx`、`docs/architecture/overview.md`
- **生效版本**：v1.8.1（Android `versionCode: 35`）
- **前置文档**：[0040-transaction-search-and-filters.md](0040-transaction-search-and-filters.md)

## 背景

此前明细页在「全部」模式下一次性读取并渲染全库记录，长期记账后会造成明显性能负担；账户详情页硬编码 `limit = 1000`，超过 1000 笔的老流水会被静默截断且无法继续翻阅。

## 方案

1. **懒加载触发纯规则（`pagination-rules.ts`）**：定义默认单页 40 条与 90% 滚动触发阈值（`shouldTriggerLazyLoadMore`）以及按 `id` 去重合并规则（`mergePaginatedTransactions`）。
2. **SQL 聚合汇总与增量分页（`repository.ts` + `service.ts`）**：
   - 新增 `summarizeTransactionsByDateRange` 直接在 SQLite 层按与 `computeMonthlySummary` 完全一致的口径聚合总览数据，首屏无需拉取全表；
   - 新增 `getPeriodLedgerPage` 与 `listAccountTransactionsPage`（`LIMIT (limit + 1) OFFSET ?` 探测 `hasMore`），保留既有全量接口向后兼容。
3. **双页无缝接入**：
   - `app/(tabs)/index.tsx` 在现有 RNGH `ScrollView` 上监听滚动进度，滑至 90% 自动加载下一页，不破坏横向跟手切页与单行左滑；同周期内数据刷新保持当前已展开条数避免跳回顶部。
   - `app/account-detail.tsx` 复用既有 60fps `scrollY` 监听接入 90% 触底翻页，彻底移除 `limit = 1000` 硬限制。

## 实施（改动文件清单）

- **版本与日志**：`package.json`（`1.8.1`）、`app.json`（`1.8.1` / `versionCode: 35`）、`CHANGELOG.md`。
- **分页规则与服务**：新增 `pagination-rules.ts` & `pagination-rules.test.ts`，更新 `types.ts`、`repository.ts`、`service.ts`、`service.test.ts`。
- **页面**：`app/(tabs)/index.tsx`、`app/account-detail.tsx`。
- **文档与索引**：`docs/architecture/overview.md`、`docs/changes/0041-lazy-pagination-ledger-and-account-detail.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows 11（PowerShell）、Bun `1.4.5`、Node.js（`node:sqlite`）。
- **验证命令与实际输出**：`bun run verify`（版本校验 `v1.8.1`、TypeScript 零错误、ESLint 零警告、全量 Vitest 单测通过）。
- **验证结论**：90% 触底判定、去重合并、SQL 汇总口径一致性与周期/账户双分页接口全部通过自动化测试。
- **已知限制**：按阶段计划在 `v1.8.4` 统一打包 Release APK。

## 后续验证建议

1. 导入超过 100 条账目的测试备份，在明细「全部」模式与高频账户详情页测试下滑至约 90% 处是否丝滑自动续载且总览金额准确。
