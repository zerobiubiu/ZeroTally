# 0050：设置可选「报销追踪」模块（默认关闭零干扰）

- **状态**：已执行
- **影响范围**：`package.json`、`app.json`、`CHANGELOG.md`、`src/features/reimbursement/`、`app/reimbursements.tsx`、`src/features/transactions/components/TransactionDetailSheet.tsx`、`src/features/settings/components/SettingsPanel.tsx`、`app/_layout.tsx`、`docs/architecture/overview.md`
- **生效版本**：v1.10.0（Android `versionCode: 44`）
- **前置文档**：[0049-onboarding-and-gestures-guide.md](0049-onboarding-and-gestures-guide.md)

## 背景

在保持日常记账界面纯粹、不引入复杂标签系统的前提下，为有差旅或垫付报销需求的用户提供轻量、默认关闭且可随时启停的报销追踪与到账核销能力。

## 方案

1. **零 Schema 侵入设计（`src/features/reimbursement/`）**：
   - 将开关配置与报销状态记录存储于 `app_settings`（`reimbursement_config_v1`、`reimbursement_records_v1`），不破坏核心 SQLite 交易表与既有备份结构；仓储层不依赖 `transactions`，避免跨职责循环依赖。
   - **双核销口径**：支持「抵扣原支出（走 `createRefundTransaction`，自动冲减支出分类统计且不虚增个人收入）」与「记为报销收入（走 `createTransaction` 收入流水）」两种口径，均复用统一事务层原子联动账户余额。
   - 原支出记录被删除时，总览查询自动清理失效索引。
2. **极简非侵入式交互（`app/reimbursements.tsx` + `TransactionDetailSheet.tsx`）**：
   - 开关默认关闭；关闭时对明细列表、记一笔与账单详情浮窗零视觉干扰。
   - 开启后支持在「报销追踪」页从近期支出挑选待报销、按「待报销 / 已报销」分类查看并一键核销入账；同时在支出详情浮窗中提供单行「报销状态 / 标记待报销」快捷入口。

## 实施（改动文件清单）

- **版本与日志**：`package.json`（`1.10.0`）、`app.json`（`1.10.0` / `versionCode: 44`）、`CHANGELOG.md`。
- **报销追踪模块与测试**：新增 `src/features/reimbursement/{types.ts,rules.ts,rules.test.ts,repository.ts,service.ts,service.test.ts}`。
- **页面与入口**：新增 `app/reimbursements.tsx`，更新 `TransactionDetailSheet.tsx`、`SettingsPanel.tsx`、`app/_layout.tsx`。
- **文档与索引**：`docs/architecture/overview.md`、`docs/changes/0050-optional-reimbursement-tracking.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows 11（PowerShell）、Bun `1.4.5`、Node.js（`node:sqlite`）。
- **验证命令与实际输出**：`bun run verify`（版本校验 `v1.10.0`、TypeScript 0 错误、ESLint 0 警告、Vitest 35 个测试文件共 137 条单测全部通过）。
- **验证结论**：报销追踪纯规则、关联退款抵扣与独立收入双口径核销、余额原子联动及删账自动清理索引均经真实 SQLite 集成测试验证通过。
- **已知限制**：按阶段计划在终版 `v2.0.0` 统一打包校验 Release APK。

## 后续验证建议

1. 确认默认状态下打开支出详情无任何报销干扰；进入设置 → 「报销追踪」开启后，挑选支出并分别验证「抵扣原支出」与「记为报销收入」核销后的流水与余额联动。
