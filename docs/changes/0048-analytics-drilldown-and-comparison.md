# 0048：财务分析深度增强（环比同比、二级下钻、消费洞察与大额排行）

- **状态**：已执行
- **影响范围**：`package.json`、`app.json`、`CHANGELOG.md`、`src/features/analytics/types.ts`、`rules.ts`、`rules.test.ts`、`service.ts`、`service.test.ts`、`app/analytics.tsx`、`docs/architecture/overview.md`
- **生效版本**：v1.9.3（Android `versionCode: 42`）
- **前置文档**：[0047-quick-batch-recording.md](0047-quick-batch-recording.md)

## 背景

原有账务分析仅提供一级分类聚合与基础趋势柱图，缺少同比/环比趋势判断、二级分类拆分、大额单笔定位以及直接下钻查明细的闭环能力。

## 方案

1. **规则与服务扩展（`src/features/analytics/`）**：
   - 在 `buildCategoryBreakdown` 中同步生成 `children` 二级子分类占比拆分（仅当该一级大类下存在二级流水时返回，保留直接挂在一级下的「未细分」项）。
   - 新增 `computeMetricDelta`、`buildPeriodComparisonSnapshot`、`buildPeriodHighlights`（消费活跃天数、峰值消费日、单笔均价）与 `buildTopTransactions`（按扣减退款后的净额取 Top 5）。
   - `getScopedAnalytics` 利用 `summarizeTransactionsByDateRange` 轻量补齐按月「环比上月 + 同比去年」及按年「同比上年」数据。
2. **分析页交互与视觉升级（`app/analytics.tsx`）**：
   - 接入 `surfaceGrouped` 画布与无外描边 14px 纯白卡片，在核心卡展示环比/同比增幅胶囊与消费节奏洞察条。
   - 一级分类行支持展开二级子分类并可一键下钻 `/search` 查阅对应周期原始账单；账户分布支持下钻对应账户周期明细；大额 Top 5 接入 `useTransactionListInteractions` 直接弹出下半屏详情浮窗。

## 实施（改动文件清单）

- **版本与日志**：`package.json`（`1.9.3`）、`app.json`（`1.9.3` / `versionCode: 42`）、`CHANGELOG.md`。
- **分析规则、服务与测试**：`src/features/analytics/{types.ts,rules.ts,rules.test.ts,service.ts,service.test.ts}`。
- **分析页面**：`app/analytics.tsx`。
- **文档与索引**：`docs/architecture/overview.md`、`docs/changes/0048-analytics-drilldown-and-comparison.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows 11（PowerShell）、Bun `1.4.5`、Node.js（`node:sqlite`）。
- **验证命令与实际输出**：`bun run verify`（版本校验 `v1.9.3`、TypeScript 0 错误、ESLint 0 警告、Vitest 32 个测试文件共 130 条单测全部通过）。
- **验证结论**：环比/同比增幅计算、二级分类 children 拆分、峰值消费日洞察及 Top 5 大额排行均经单元与真实 SQLite 集成测试验证通过。
- **已知限制**：按阶段计划在 P1 收官 `v1.9.4` 统一打包 Release APK。

## 后续验证建议

1. 进入「账务分析」切换按月/按年/全部视图，确认环比/同比胶囊显示准确；点击含二级分类的条目展开拆分，并测试点击分类、账户与大额单笔的下钻跳转及详情浮窗。
