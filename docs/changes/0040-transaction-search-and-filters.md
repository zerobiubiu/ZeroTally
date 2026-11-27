# 0040：账单搜索与多维筛选

- **状态**：已执行
- **影响范围**：`package.json`、`app.json`、`CHANGELOG.md`、`app/_layout.tsx`、`app/(tabs)/_layout.tsx`、`app/search.tsx`、`src/features/transactions/types.ts`、`src/features/transactions/search-rules.ts`、`src/features/transactions/search-rules.test.ts`、`src/features/transactions/repository.ts`、`src/features/transactions/service.ts`、`src/features/transactions/service.test.ts`、`docs/architecture/overview.md`
- **生效版本**：v1.8.0（Android `versionCode: 34`）
- **前置文档**：[0039-account-form-ui-refactor.md](0039-account-form-ui-refactor.md)

## 背景

明细页此前仅支持按「月 / 年 / 全部」按日期顺次浏览，缺乏按备注关键词、分类、账户、类型、日期区间与金额区间快速定位账单的能力，长期记账后查询成本高。

## 方案

1. **参数化搜索查询引擎（`search-rules.ts` + `repository.ts` + `service.ts`）**：
   - 新增 `buildTransactionSearchWhere`、`escapeSqlLikePattern`、`normalizeSearchPagination` 等纯规则，所有条件严格走 SQLite `?` 参数绑定并对 `LIKE` 通配符（`%` / `_` / `\`）显式转义。
   - 关键词同时覆盖备注、当前分类、父分类与主/对手账户名；分类筛选支持传入一级分类自动匹配其下全部二级分类；账户筛选同时匹配 `account_id` 与 `to_account_id`。
   - `searchTransactionsPage` 在一次查询内返回分页明细列表、命中总笔数及收支/退款总额汇总，支持 `LIMIT / OFFSET` 懒加载。
2. **零破坏极简入口与独立搜索页（`app/(tabs)/_layout.tsx` + `app/search.tsx`）**：
   - 仅在「明细」顶栏分段控件左侧增加轻量搜索图标按钮，不改动主明细页结构。
   - 独立搜索页提供防抖即时搜索栏、单行快捷类型胶囊（全部/支出/收入/转账/退款/还款）及基于统一 `BottomSheet` 的多维筛选面板（日期快捷预设与自定义日历、金额上下限、账户与分类），命中结果以 `FlatList`（`onEndReachedThreshold={0.15}`）分页懒加载，完整复用 `TransactionRow` 与详情/退款/编辑/删除交互，并支持路由参数直达。

## 实施（改动文件清单）

- **版本与日志**：`package.json`（`1.8.0`）、`app.json`（`1.8.0` / `versionCode: 34`）、`CHANGELOG.md`。
- **事务搜索规则、仓储与服务**：`src/features/transactions/types.ts`、新增 `search-rules.ts` & `search-rules.test.ts`、更新 `repository.ts`、`service.ts`、`service.test.ts`。
- **路由与界面**：`app/_layout.tsx`、`app/(tabs)/_layout.tsx`、新增 `app/search.tsx`。
- **文档与索引**：`docs/architecture/overview.md`、`docs/changes/0040-transaction-search-and-filters.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows 11（PowerShell）、Bun `1.4.5`、Node.js（`node:sqlite`）。
- **验证命令与实际输出**：见本次 `bun run verify`（版本校验 `v1.8.0`、TypeScript 零错误、ESLint 零警告、全量 Vitest 单测通过）。
- **验证结论**：搜索条件参数化、通配符转义、一级含二级分类匹配、分页 `hasMore` 与多维组合筛选均经单元测试与真实 SQLite 集成测试验证通过。
- **已知限制**：按阶段打包计划，P0 阶段将在 `v1.8.4` 收官时统一打包 Release APK 验证。

## 后续验证建议

1. 真机打开「明细」顶栏搜索图标，测试输入备注/分类/账户关键词防抖搜索及多维筛选组合。
2. 在搜索结果中测试左滑编辑/退款/删除及点击详情弹窗，验证变更后命中统计与列表自动同步。
