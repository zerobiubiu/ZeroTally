# 0009 明细左滑二级菜单、下半屏详情浮窗与关联抵扣式退款

- **状态**：已执行
- **影响范围**：`app/`、`src/db/`、`src/features/transactions/`、`src/features/analytics/`、`src/features/export/`、`src/shared/money/`
- **前置文档**：[0008-two-level-categories-and-custom-keypad.md](0008-two-level-categories-and-custom-keypad.md)
- **生效版本**：v0.3.0

## 背景

原流水列表单点记录直接进入「记一笔」编辑页，缺少快捷浏览详情、左滑快捷操作与支出退款闭环。本次变更为明细首页与账户详情页的流水列表统一增加：

1. 单条记录左滑展开二级操作菜单（退款 / 修改 / 删除），同列表最多展开一行且不抢占纵向滚动；
2. 单点记录从下向上平滑浮出占下半屏的详情浮窗，展示完整字段、已退/实付概览、关联退款或原支出跳转，并提供修改、退款、复制再记与删除操作；
3. 基于 Schema v3 的关联抵扣式退款能力，支持全额、部分与多次退款，准确联动账户余额并在统计中抵扣原支出。

## 方案

1. **数据库 Schema v3 与关联抵扣式退款领域层**：
   - `src/db/schema.ts` 升级至 Schema v3，事务内安全重建 `transactions` 表：`type` 新增 `'refund'`，新增 `refund_of_id` 自引用外键及索引 `idx_transactions_refund_of_id`，通过 `CHECK` 约束保障仅退款记录携带 `refund_of_id` 且不能指向自身。
   - `src/features/transactions/rules.ts` / `repository.ts` / `service.ts` 新增 `createRefundTransaction`、`updateRefundTransaction`、`listTransactionRefunds`：
     - 仅支出支持退款，支持多次部分退款并严防累计超退；退款沿用原支出分类，余额增量使退回账户 `+amountCents`；
     - 已存在退款的原支出禁止切换交易类型或将金额改小至已退总额以下，修改分类时同步更新关联退款的分类；
     - 删除原支出时在同一 SQLite 事务内连带删除全部关联退款并合并回滚所有受影响账户余额。
2. **统计汇总与导出适配**：
   - `computeMonthlySummary` 与 `groupTransactionsByDay` 将退款抵扣当月/当日净支出（不虚增收入），日小计在纯退款日展示为「退 ¥xx.xx」。
   - `src/features/analytics/rules.ts` 将退款抵扣至所属一级支出分类、账户支出分布及近 6 月支出趋势。
   - `src/features/export/formatter.ts` 与 `types.ts` 补充 `'refund' -> '退款'` 标签及 `refundOfId`、`refundedCents` 字段。
3. **左滑二级菜单、下半屏详情浮窗与退款/复制交互**：
   - `app/_layout.tsx` 根部包裹 `GestureHandlerRootView`。
   - `src/features/transactions/components/TransactionRow.tsx` 基于 `react-native-gesture-handler` v3 `usePanGesture`（`disableReanimated: true`、`failOffsetY: [-10, 10]`、未展开仅允许左滑）驱动原生 `Animated` 位移，支持左滑展示「退款（未全退支出）/ 修改 / 删除」，已退支出行内呈现已退金额或全额退款删除线标识。
   - `src/features/transactions/components/TransactionDetailSheet.tsx` 采用同步遮罩淡入与自底向上滑入动画，占用下半屏（`minHeight: 52%`、`maxHeight: 72%`），完整呈现收支字段、已退/实付、关联退款/原支出互相跳转与底部固定操作栏（修改 / 退款 / 复制 / 删除）。
   - `src/features/transactions/components/RefundSheet.tsx` 支持新增与编辑退款，支持一键「全额退」、退回账户切换、日期选择（复用 `DatePickerSheet`）与备注录入。
   - `src/features/transactions/components/useTransactionListInteractions.tsx` 集中编排左滑受控互斥、详情浮窗、退款弹窗与删除确认，供 `app/(tabs)/index.tsx` 与 `app/account-detail.tsx` 统一复用；`app/record.tsx` 新增 `copyFromId` 复制再记支持。
4. **版本递增**：兼容新功能按规则递增至 `v0.3.0`（Android `versionCode: 3`），同步更新 `CHANGELOG.md` 与 `docs/architecture/overview.md`。

## 实施（改动文件清单）

- **数据层与迁移**：`src/db/schema.ts`、`src/db/schema.test.ts`
- **交易领域与组件**：`src/shared/money/money.ts`、`src/features/transactions/types.ts`、`src/features/transactions/rules.ts`、`src/features/transactions/rules.test.ts`、`src/features/transactions/repository.ts`、`src/features/transactions/service.ts`、`src/features/transactions/service.test.ts`、`src/features/transactions/components/TransactionRow.tsx`、`src/features/transactions/components/TransactionDetailSheet.tsx`、`src/features/transactions/components/RefundSheet.tsx`、`src/features/transactions/components/useTransactionListInteractions.tsx`、`src/features/transactions/components/RecordKeypad.tsx`
- **统计与导出**：`src/features/analytics/rules.ts`、`src/features/analytics/rules.test.ts`、`src/features/analytics/service.test.ts`、`src/features/export/types.ts`、`src/features/export/formatter.ts`、`src/features/export/formatter.test.ts`
- **页面与版本文档**：`app/_layout.tsx`、`app/(tabs)/index.tsx`、`app/account-detail.tsx`、`app/record.tsx`、`app/settings.tsx`、`package.json`、`app.json`、`CHANGELOG.md`、`docs/architecture/overview.md`、`docs/changes/0009-ledger-swipe-detail-sheet-and-refund.md`、`docs/changes/README.md`、`docs/README.md`

## 执行验证记录

- **执行环境**：Windows / PowerShell，Bun + TypeScript 6 + ESLint 9 + Vitest 5.1.1（`node:sqlite` 内存 SQLite）
- **验证命令**：
  1. Ionicons 字形表校验（覆盖 9 个新增/关联界面图标）
  2. `bun run verify`（依次执行 `check:version`、`tsc --noEmit`、`eslint .`、`vitest run`）
- **实际输出**：
  - 图标校验：`ALL 9 ICONS VALID`
  - 版本校验：`版本校验通过：v0.3.0`
  - 类型检查：`tsc --noEmit` 通过（0 错误）
  - 代码规范：`eslint .` 通过（0 错误、0 警告）
  - 单元测试：`Test Files 14 passed (14)`，`Tests 50 passed (50)`（耗时 210ms，覆盖 v2→v3 迁移、多次部分退款、防超退、编辑退款、连带删除回滚与退款抵扣统计）
- **验证结论**：全部静态门禁与 50 项自动化测试通过。
- **已知限制**：尚未在真机/模拟器安装验证左滑手势跟手度、纵向滚动不冲突及下半屏详情浮窗滑出动画效果。

## 后续验证建议

1. 如需实机体验，可执行 `bun x expo prebuild --platform android --no-install && bun run build:apk` 重新打包 `v0.3.0` APK 并安装测试：
   - 在「明细」与「账户详情」页左滑单条支出/收入/转账，核验同屏仅展开一行、纵向滑动自动收起及「退款 / 修改 / 删除」按钮响应；
   - 单点记录验证下半屏详情浮窗自底向上平滑浮出、点击关联退款/原支出切换及「修改 / 退款 / 复制 / 删除」全链路；
   - 测试部分退款、多次退款与删除原支出连带回滚余额后，核对账务分析页支出抵扣口径。
