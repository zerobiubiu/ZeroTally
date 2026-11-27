# 0046：周期性账单、弹性月薪、房贷（含提前还款）与信用卡日历中心

- **状态**：已执行
- **影响范围**：`package.json`、`app.json`、`CHANGELOG.md`、`src/features/recurring/*`、`app/recurring.tsx`、`app/_layout.tsx`、`SettingsPanel.tsx`、`docs/architecture/overview.md`
- **生效版本**：v1.9.1（Android `versionCode: 40`）
- **前置文档**：[0045-optional-budget-management.md](0045-optional-budget-management.md)

## 背景

用户在房租、宽带、软件订阅、弹性发薪日/扣款月薪、等额本息/等额本金房贷（尤其是提前还款后利息结清与次月新月供变化）以及信用卡账单/还款日等周期财务场景中需要高度适配的管理能力，同时不能干扰日常极速记账主流程。

## 方案

1. **房贷精确计算引擎（`mortgage-rules.ts` & `mortgage-rules.test.ts`）**：
   - 采用整数「分」与年利率万分比（bps）计算等额本息与等额本金每期本息拆解；
   - `simulateMortgagePrepayment` 支持「缩短期限」与「减少月供」双策略，按实际占用天数计算应结利息，精准给出提前还款总支出、次月新月供（本金+利息）、新剩余期数与累计节省利息。
2. **周期与弹性月薪规则（`rules.ts` & `rules.test.ts`）**：
   - 按 `YYYY-MM` / `YYYY-Qn` / `YYYY` / `YYYY-Wxx` 周期键保证幂等不重记；
   - `resolveSalaryPosting` 支持提前/延时实际到账日期与当月扣款/补贴加项自动生成实发金额与明细备注；
   - `computeCreditCardCycleStatus` 计算距下个账单日与还款日天数。
3. **服务编排与设置一级二级页（`service.ts` + `app/recurring.tsx`）**：
   - 计划元数据存于 `app_settings`（零破坏现有主表 Schema），实际入账复用 `createTransaction` 保证账本余额原子一致；
   - 启动时静默运行 `processAutoDueRecurringPlans` 仅处理开启 `autoPost` 的计划，未配置用户零感知。

## 实施（改动文件清单）

- **版本与日志**：`package.json`（`1.9.1`）、`app.json`（`1.9.1` / `versionCode: 40`）、`CHANGELOG.md`。
- **周期账单与房贷模块**：新增 `src/features/recurring/types.ts`、`mortgage-rules.ts`、`mortgage-rules.test.ts`、`rules.ts`、`rules.test.ts`、`service.ts`、`service.test.ts`、`components/RecurringEditorSheet.tsx`、`components/MortgagePrepaySheet.tsx`、`components/SalaryPostSheet.tsx`、`app/recurring.tsx`。
- **入口接线与文档**：更新 `app/_layout.tsx`、`SettingsPanel.tsx`、`docs/architecture/overview.md`、`docs/changes/0046-recurring-bills-salary-mortgage-and-credit-cycle.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows 11（PowerShell）、Bun `1.4.5`、Node.js（`node:sqlite`）。
- **验证命令与实际输出**：`bun run verify`（版本校验 `v1.9.1`、TypeScript 0 错误、ESLint 0 警告、全量 Vitest 单测通过）。
- **验证结论**：等额本息/等额本金、提前还款双策略利息与次月月供、弹性月薪提前/延时/扣款、信用卡还款日倒计时与真实 SQLite 幂等入账测试全部通过。
- **已知限制**：按阶段计划在 P1 收官 `v1.9.4` 统一打包 Release APK。

## 后续验证建议

1. 真机从侧边设置进入「周期账单」，分别创建固定支出、弹性月薪、等额本息房贷与信用卡计划，验证发薪扣款入账与房贷提前还款试算及余额联动。
