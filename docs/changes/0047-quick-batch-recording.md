# 0047：快捷批量记账（单事务原子批量入账）

- **状态**：已执行
- **影响范围**：`package.json`、`app.json`、`CHANGELOG.md`、`src/features/transactions/service.ts`、`service.test.ts`、`src/features/quick-record/components/QuickRecordSheet.tsx`、`app/batch-record.tsx`、`app/_layout.tsx`、`docs/architecture/overview.md`
- **生效版本**：v1.9.2（Android `versionCode: 41`）
- **前置文档**：[0046-recurring-bills-salary-mortgage-and-credit-cycle.md](0046-recurring-bills-salary-mortgage-and-credit-cycle.md)

## 背景

用户无需外部账单 CSV 导入，但在旅行归来或一日多笔漏记补录场景下，希望能够借助既有快捷模板快速连续拼装多笔账目后一次性入账，同时不打扰正常单笔记账路径。

## 方案

1. **原子批量入账服务（`transactions/service.ts` `createTransactionsBatch`）**：在进入事务前统一校验全部条目，在单一 SQLite 事务内依次核验引用、写入流水并聚合账户净余额增量，确保任意一行异常时整批回滚。
2. **非侵入式快捷批量记账页（`app/batch-record.tsx` + `QuickRecordSheet.tsx`）**：仅在快捷记账面板顶栏新增轻量图标入口，支持点击快捷模板一键追加行、点按切换收支/分类/账户、统一选定补记日期与底部实时汇总一键提交。

## 实施（改动文件清单）

- **版本与日志**：`package.json`（`1.9.2`）、`app.json`（`1.9.2` / `versionCode: 41`）、`CHANGELOG.md`。
- **服务与测试**：`src/features/transactions/service.ts`、`service.test.ts`。
- **页面与入口**：新增 `app/batch-record.tsx`，更新 `QuickRecordSheet.tsx`、`app/_layout.tsx`。
- **文档与索引**：`docs/architecture/overview.md`、`docs/changes/0047-quick-batch-recording.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows 11（PowerShell）、Bun `1.4.5`、Node.js（`node:sqlite`）。
- **验证命令与实际输出**：`bun run verify`（版本校验 `v1.9.2`、TypeScript 0 错误、ESLint 0 警告、Vitest 32 个测试文件共 127 条单测全部通过）。
- **验证结论**：多笔批量入账余额合并与失败整批回滚均经真实 SQLite 集成测试验证通过。
- **已知限制**：按阶段计划在 P1 收官 `v1.9.4` 统一打包 Release APK。

## 后续验证建议

1. 上滑底栏打开快捷记账面板，点击顶栏批量图标进入「快捷批量记账」，尝试点选模板并手填数行，核对一次性提交后明细与账户余额。
