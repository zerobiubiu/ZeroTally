# 0017 全量 UI 状态一致性审核修复与 App 名称全链路统一

- **状态**：已执行
- **影响范围**：全项目 30 个 UI 组件与页面（重点修改 `app/account-detail.tsx`、`app/categories.tsx`、`app/settings.tsx`、`app/account-form.tsx`、`app/analytics.tsx`、`app/record.tsx`、`src/shared/ui/ConfirmDialog.tsx`、`src/shared/ui/ActionSheet.tsx`、`src/features/transactions/components/DeleteTransactionDialog.tsx`、`RefundSheet.tsx`、`AccountPickerSheet.tsx`）及导出模块 `src/features/export/`
- **生效版本**：v0.6.2（Android `versionCode: 11`）
- **前置文档**：[0015-keyboard-avoidance-delete-dialog-all-ledger-and-swipe-tabs.md](0015-keyboard-avoidance-delete-dialog-all-ledger-and-swipe-tabs.md)、[0016-rename-app-to-zerotally.md](0016-rename-app-to-zerotally.md)

## 背景

在明细删除弹窗美化上线后，真机验证发现资产详情页删除账户仍弹出系统原生 `Alert.alert`，存在明显跨页风格割裂。本次对全项目全部 30 个 `.tsx` 页面/组件及数据导出、配置与品牌名称进行了一次地毯式一致性审计，共定位出三大类问题：

1. **12 处系统原生 `Alert.alert` 残留**：分布于 `app/account-detail.tsx`（5 处）、`app/categories.tsx`（3 处）与 `app/settings.tsx`（4 处），涵盖删除/停用账户、删除/停用分类、重置账本、导出方式选择及各类成败反馈弹窗。
2. **7 类跨页视觉与交互状态不一致**：
   - `app/settings.tsx` 外观分段器选中态与其他页面（`actionSubtle` + `actionTextOnSubtle`）不统一；
   - `app/account-detail.tsx`（余额校准面板）与 `app/categories.tsx`（分类编辑卡片）缺少 `KeyboardAvoidingView` 软键盘避让；
   - `app/account-form.tsx` 账户类型芯片 2px 聚焦边框未补偿内边距存在 1px 抖动，错误条缺少告警图标；
   - `RefundSheet.tsx` 仍使用 `animationType="slide"` 导致遮罩整屏上滑穿帮，且日期快捷按钮为「今天 / 昨天」（与 `DatePickerSheet` 的「前天 / 昨天 / 今天」顺序相反）；
   - `DeleteTransactionDialog.tsx` 退款图标徽章色使用 `incomeSubtle`，与 `TransactionRow.tsx` / `TransactionDetailSheet.tsx` 的 `warningSubtle` 不一致；
   - `app/account-detail.tsx`、`app/categories.tsx`、`app/analytics.tsx`、`app/record.tsx` 多处可交互按钮缺少 `pressed` 按压态反馈，且账户详情底部管理操作未成组卡片化；
   - `AccountPickerSheet.tsx` 账户名称缺少 `flexShrink: 1`，长名称在转账模式下会挤压对端提示标签。
3. **App 名称全链路残留**：
   - 结构化数据导出（`src/features/export/formatter.ts` 与 `types.ts`）中 JSON `app` 字段与导出文件名前缀仍为 `keep-accounts`；
   - 设置页版本行未展示品牌名 `ZeroTally`；
   - `android/app/src/main/res/values/strings.xml` 尚未重新执行 `prebuild`，旧 APK 的 `app_name` 仍为旧名（需下次重打 APK 时随 `prebuild` 自动同步）。

## 方案

1. **扩展通用浮层基础设施并彻底清零 `Alert.alert`**：
   - `src/shared/ui/ConfirmDialog.tsx` 新增 `hideCancel?: boolean`，支持单按钮结果/错误提示弹窗；
   - 新增 `src/shared/ui/ActionSheet.tsx` 统一底部操作选择面板（拖拽指示条 + 标题/副标题 + 带图标操作行 + 取消按钮，不可见时卸载 `Modal`）；
   - `app/account-detail.tsx`：停用/删除账户改为 `ConfirmDialog` 并内嵌账户摘要预览卡（名称、类型、当前余额/欠款），错误直接弹窗内联展示；底部「停用/恢复」「删除」收敛进统一圆角卡片；
   - `app/categories.tsx`：停用/删除分类改为 `ConfirmDialog` 并内嵌分类预览卡及下属二级分类连带警示条；
   - `app/settings.tsx`：导出方式选择改用 `ActionSheet`，重置账本改为含数据概览卡的高警示 `ConfirmDialog`，导出成败反馈改用单按钮 `ConfirmDialog`。
2. **拉齐所有页面视觉与交互细节**：
   - 统一 `app/settings.tsx` 外观分段器选中色为 `actionSubtle` / `actionTextOnSubtle`；
   - 为 `app/account-detail.tsx` 与 `app/categories.tsx` 补齐 `KeyboardAvoidingView behavior="padding"`；
   - 统一 `account-detail`、`categories`、`RefundSheet`、`account-form` 全部内联错误提示为「左竖条 + `expenseSubtle` 底 + 告警图标」样式；
   - 统一 `DeleteTransactionDialog` 退款徽章为 `warningSubtle` / `warningTextOnSubtle`，修正 `RefundSheet` 动画为 `fade`、快捷日期顺序为「昨天 / 今天」；
   - 为 `account-form` 账户类型芯片补偿选中态 1px 内边距，为 `AccountPickerSheet` 名称补充 `flexShrink: 1`，并补齐各页缺失的 `pressed` 按压态反馈。
3. **统一导出与设置页 `ZeroTally` 品牌标识**：
   - 导出 JSON `app` 字段改为 `'ZeroTally'`，文件名改为 `ZeroTally-YYYY-MM-DD.json` / `.csv`（同步更新单测与 `README.md` 示例）；
   - 设置页版本行展示 `ZeroTally v0.6.2`；保留 `android.package`（`com.keepaccounts.app`）与本地数据库文件名（`keep_accounts.db`）不变，确保真机覆盖升级不丢账本数据。

## 实施（改动文件清单）

- 新增：`src/shared/ui/ActionSheet.tsx`。
- 修改：`src/shared/ui/ConfirmDialog.tsx`、`src/features/transactions/components/DeleteTransactionDialog.tsx`、`src/features/transactions/components/RefundSheet.tsx`、`src/features/transactions/components/AccountPickerSheet.tsx`。
- 修改：`app/account-detail.tsx`、`app/categories.tsx`、`app/settings.tsx`、`app/account-form.tsx`、`app/analytics.tsx`、`app/record.tsx`。
- 修改：`src/features/export/types.ts`、`src/features/export/formatter.ts`、`src/features/export/formatter.test.ts`、`src/features/export/service.test.ts`、`README.md`。
- 版本与文档：`package.json`、`app.json`、`CHANGELOG.md`、`docs/architecture/overview.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows（PowerShell），Bun + TypeScript 6 + ESLint 9 + Vitest 5
- **验证命令**：`bun run verify` + 全业务代码（`app/` 与 `src/`）正则扫描 `Alert\.alert|简记|keep-accounts`
- **实际输出**：
  - `node scripts/check-version.mjs`：`版本校验通过：v0.6.2`
  - `tsc --noEmit`：0 错误退出
  - `eslint .`：0 错误、0 警告退出
  - `vitest run`：`Test Files 15 passed (15)`，`Tests 56 passed (56)`（223ms）
  - 正则扫描 `app/` 与 `src/`：0 命中（`Alert.alert`、旧中文名「简记」与业务层 `keep-accounts` 标识全部清零）。
- **验证结论**：通过。
- **已知限制**：尚未重新执行 `expo prebuild` 与打包 `v0.6.2` Android Release APK（磁盘 `android/` 内旧构建产物仍为 `v0.6.0` 且 `strings.xml` 为旧应用名）。

## 后续验证建议

- 执行 `bun x expo prebuild --platform android --no-install && bun run build:apk` 构建 `v0.6.2` Release APK，安装覆盖验证：
  1. 桌面图标名与系统应用详情显示为 `ZeroTally`，且原本地 SQLite 历史账目完整保留；
  2. 资产详情页删除/停用账户、分类管理页删除/停用分类、设置页导出菜单与重置账本弹窗风格全部与明细删除弹窗保持统一；
  3. 导出 JSON / CSV 文件名为 `ZeroTally-YYYY-MM-DD.json/csv`。
