# 0045：设置可选预算管理（默认关闭、非侵入补充）

- **状态**：已执行
- **影响范围**：`package.json`、`app.json`、`CHANGELOG.md`、`src/features/budgets/*`、`app/budgets.tsx`、`app/_layout.tsx`、`SettingsPanel.tsx`、`MonthlySummaryHeader.tsx`、`app/(tabs)/index.tsx`、`docs/architecture/overview.md`
- **生效版本**：v1.9.0（Android `versionCode: 39`）
- **前置文档**：[0044-strict-release-signing-and-r8-shrink.md](0044-strict-release-signing-and-r8-shrink.md)

## 背景

预算管理对成熟财务工具具有补充价值，但并非所有用户的刚需。按「默认不打扰、设置中按需开启」原则实现月度总预算与分类预算管理。

## 方案

1. **预算领域规则与配置持久化（`src/features/budgets/`）**：配置以 JSON 存于既有 `app_settings`（`budget_config_v1`），零数据库 Schema 变更；`computeBudgetProgress` 按当月净支出（自动扣减同月退款）计算剩余、占比及 `safe / warning / exceeded` 状态。
2. **独立设置页（`app/budgets.tsx`）**：由设置面板「预算管理」进入，默认关闭；开启后可配置月度总预算、预警阈值（70%/80%/90%）与一级支出分类预算，实时对比本月净支出。
3. **非侵入式主界面补充**：仅当用户启用预算且设置月度总预算时，在明细页「按月」总览卡底部展示单行细进度条并支持点击直达预算页；关闭态与此前界面完全一致。

## 实施（改动文件清单）

- **版本与日志**：`package.json`（`1.9.0`）、`app.json`（`1.9.0` / `versionCode: 39`）、`CHANGELOG.md`。
- **预算模块与界面**：新增 `src/features/budgets/types.ts`、`rules.ts`、`rules.test.ts`、`repository.ts`、`app/budgets.tsx`；更新 `app/_layout.tsx`、`SettingsPanel.tsx`、`MonthlySummaryHeader.tsx`、`app/(tabs)/index.tsx`。
- **文档与索引**：`docs/architecture/overview.md`、`docs/changes/0045-optional-budget-management.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows 11（PowerShell）、Bun `1.4.5`、Node.js（`node:sqlite`）。
- **验证命令与实际输出**：`bun run verify`（版本校验 `v1.9.0`、TypeScript 零错误、ESLint 零警告、全量 Vitest 单测通过）。
- **验证结论**：预算配置容错解析与安全/预警/超支计算均通过单元测试，未开启态零影响主流程。
- **已知限制**：按阶段计划在 P1 收官版本 `v1.9.4` 统一打包 Release APK 验证。

## 后续验证建议

1. 核对默认关闭时明细页无任何预算元素；进入「设置 → 预算管理」开启并配置总预算与分类预算，核对月度总览卡底部轻量进度条与超支变色。
