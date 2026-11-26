# 0013 记一笔直选账户融合、三层钻取滑动日历与多周期明细/分析

- **状态**：已执行
- **影响范围**：`app/record.tsx`、`app/(tabs)/index.tsx`、`app/analytics.tsx`、`src/features/transactions/`、`src/features/analytics/`、`src/shared/date/`
- **前置文档**：[0008-two-level-categories-and-custom-keypad.md](0008-two-level-categories-and-custom-keypad.md)
- **生效版本**：v0.5.0

## 背景

结合真机使用反馈，本次变更聚焦四大高频交互优化：

1. 记一笔收支账户取消二级弹窗，融合旧版横向直选账户卡片（含实时余额）到键盘抬头区，降低切换付款/收款账户的操作步数；
2. 日期选择弹窗将「前天 / 昨天 / 今天」快捷按钮下置至日历表下方并按时间从左至右排布，升级为支持左右滑动翻页与「日期 → 月份 → 年份区间」三层嵌套钻取，移除多余的「本月」快捷按钮；
3. 明细页同步移除「本月」按钮，支持「按月 / 按年」双模式切换，点击年月/年份标题弹出风格一致的周期选择面板；
4. 账务分析页扩展为「按月 / 按年 / 全部」三维度分析，并配套周期选择弹窗与趋势柱图下钻。

## 方案

1. **记一笔键盘区融合直选账户卡片**（[RecordKeypad.tsx](../../src/features/transactions/components/RecordKeypad.tsx)、[app/record.tsx](../../app/record.tsx)）：
   - 将原账户弹窗胶囊替换为与日期块等高（`46dp`）并排的横向直选账户条：左侧固定日期选择按钮（点击打开三层日历菜单），中间细分隔线，右侧横向滚动展示账户卡片（名称 + 实时余额，选中态 `actionSubtle` + `2px` 主色描边）；
   - 当前已选分类名称紧凑显示在右侧金额下方（无运算预览时），不额外增加行高；转账模式保留上方路由卡与 `AccountPickerSheet`。
2. **三层钻取滑动日期与周期选择器**（[DatePickerSheet.tsx](../../src/features/transactions/components/DatePickerSheet.tsx)、[PeriodPickerSheet.tsx](../../src/features/transactions/components/PeriodPickerSheet.tsx)）：
   - `DatePickerSheet`：日历表固定 6 行高度置于上方，下方放置「前天（左）· 昨天（中）· 今天（右）」快捷按钮，移除「本月」按钮；顶部标题在日期态显示 `YYYY年M月`（点击进入月份视图）、月份态显示 `YYYY年`（点击进入年份视图）、年份态显示 `YYYY年 - YYYY年`（静态不可再点击）；三层视图均支持左右滑动翻页（Modal 内独立包裹 `GestureHandlerRootView` 确保 Android 生效），选年回选月、选月回选日。
   - `PeriodPickerSheet`：供明细页与账务分析页共用；按月模式展示 12 月网格并支持点年份钻入年份区间，下方提供「上上月 / 上月 / 本月」；按年模式直接展示 12 年区间（标题不可点击），下方提供「前年 / 去年 / 今年」。
3. **明细页按月/按年切换**（[MonthlySummaryHeader.tsx](../../src/features/transactions/components/MonthlySummaryHeader.tsx)、[app/(tabs)/index.tsx](../../app/(tabs)/index.tsx)、[src/features/transactions/service.ts](../../src/features/transactions/service.ts)）：
   - 顶栏增加「按月 / 按年」胶囊切换，移除总览卡「本月」按钮，点击居中周期标题弹出 `PeriodPickerSheet`；新增 `getYearlyLedger` 支持全年账单汇总与按日分组；点击「分析」将当前周期模式与年月/年份透传至账务分析页。
4. **账务分析按月/按年/全部三维度**（[src/features/analytics/rules.ts](../../src/features/analytics/rules.ts)、[src/features/analytics/service.ts](../../src/features/analytics/service.ts)、[app/analytics.tsx](../../app/analytics.tsx)）：
   - 新增 `getScopedAnalytics` 支持 `month`（近 6 月趋势）、`year`（当年 12 月紧凑趋势，点月下钻按月）、`all`（起止日期提示 + 多年度趋势，点年下钻按年），统一移除「本月」按钮并接入 `PeriodPickerSheet`。
5. **版本递增**：新增多项兼容功能，按项目版本规则由 `0.4.0` 递增至 `0.5.0`（Android `versionCode: 7`）。

## 实施（改动文件清单）

- **日期与领域服务**：`src/shared/date/date.ts`、`src/shared/date/date.test.ts`、`src/features/transactions/types.ts`、`src/features/transactions/service.ts`、`src/features/transactions/service.test.ts`、`src/features/analytics/types.ts`、`src/features/analytics/rules.ts`、`src/features/analytics/service.ts`、`src/features/analytics/service.test.ts`
- **组件与页面**：`src/features/transactions/components/RecordKeypad.tsx`、`src/features/transactions/components/DatePickerSheet.tsx`、`src/features/transactions/components/PeriodPickerSheet.tsx`、`src/features/transactions/components/MonthlySummaryHeader.tsx`、`app/record.tsx`、`app/(tabs)/index.tsx`、`app/analytics.tsx`、`app/settings.tsx`
- **版本与文档**：`package.json`、`app.json`、`CHANGELOG.md`、`docs/architecture/overview.md`、`docs/changes/0013-direct-account-strip-calendar-drilldown-and-multi-period.md`、`docs/changes/README.md`、`docs/README.md`

## 执行验证记录

- **执行环境**：Windows / PowerShell，Bun + TypeScript 6 + ESLint 9 + Vitest 5.1.1（`node:sqlite` 内存数据库）
- **验证命令**：`bun run verify`
- **实际输出**：
  - `check:version`：`版本校验通过：v0.5.0`
  - `tsc --noEmit`：0 错误
  - `eslint .`：0 错误、0 警告
  - `vitest run`：`Test Files 14 passed (14)`，`Tests 53 passed (53)`（231ms，新增年份区间计算、全年账单查询及按年/全部账务分析测试）
- **验证结论**：全部静态门禁与 53 项单元测试通过。
- **已知限制**：尚未重打 `v0.5.0` APK 并在真机实测 Modal 内左右滑动翻月/翻年及年度 12 柱图显示密度。

## 后续验证建议

1. 如需真机验收，打包 `v0.5.0` APK 安装后依次核验：
   - 记一笔键盘区横向直选账户与日期触发块视觉融合、收支切换及转账路由卡正常；
   - 日期弹窗下方「前天 / 昨天 / 今天」顺序、日历左右滑切月、点年月进选月左右滑切年、点年份进年份区间（标题不可点且支持左右滑）；
   - 明细页「按月 / 按年」切换与点击周期标题弹出菜单、账务分析页「按月 / 按年 / 全部」及趋势柱下钻。
