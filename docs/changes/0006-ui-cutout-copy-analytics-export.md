# 0006 异形屏安全区适配、全页布局与文案精修、账务分析及结构化数据导出

- **状态**：已执行
- **影响范围**：全应用页面布局与安全区适配、全页 UI 文案审计精简、新增「账务分析」与「标准结构化数据导出（JSON / CSV）」功能模块
- **生效版本**：v0.1.0
- **前置文档**：[0005-refine-bottom-nav-and-settings-entry.md](0005-refine-bottom-nav-and-settings-entry.md)、[overview.md](../architecture/overview.md)
- **替代文档**：无

## 背景

针对移动端实际体验开展四项集中改进：
1. 做好异形屏、刘海屏、挖孔屏及系统顶部工具栏安全区隔离，避免页面内容（含滑动过程中）超过系统顶部状态栏。
2. 逐页排查并修复窄屏下布局不规整、按钮换行、网格断行与日期输入截断问题。
3. 严格落实《UI 文案密度与信息表达规范》，开展全页面文案审计，删除冗余解释与说明段落，同时完整保留金额口径、输入规则、格式约束与不可逆操作风险提示。
4. 支持点击明细页顶部月度卡片直达「账务分析」页，并新增标准可读的结构化数据导出（JSON 与 UTF-8 BOM CSV）。

## 方案

### 1. 异形屏与系统顶栏防侵入适配

- 在 `app/_layout.tsx` 为 `SafeAreaProvider` 注入 `initialWindowMetrics`，消除首帧安全区跳动。
- 新增 `src/shared/ui/SafeScreen.tsx`：Android 端顶部安全区取 `max(insets.top, StatusBar.currentHeight)`，以不透明实体顶区硬隔离系统状态栏与刘海/挖孔区域，内容容器开启 `overflow: 'hidden'`；同时适配 `left` / `right` 水平安全边。
- 明细页与资产页采用固定 52dp 顶部应用栏置于安全区下方，滚动区域仅在顶栏之下滑动，杜绝内容滑入顶部状态栏。
- 底栏交互行同步增加 `insets.left` / `insets.right` 水平避让，底部留白结合 `insets.bottom` 避开系统手势导航条。

### 2. 全页布局规整修复

- **记账页（`app/record.tsx`）**：日期区将「今天」「昨天」移至标题行右侧，下方 `< YYYY-MM-DD >` 步进器占满整行不再截断；分类网格由 `25%` 折行改为显式 4 列等宽行，杜绝安卓小数 dp 舍入导致的 3+1 断行。
- **账户详情页（`app/account-detail.tsx`）**：新增 `Button` 的 `sm` 紧凑尺寸与单行约束，三联操作按钮（`记一笔` / `校准` / `编辑`）在窄屏下严格单行对齐；余额校准面板直接展示实时变动差额。
- **账户表单与分类管理页（`app/account-form.tsx`、`app/categories.tsx`）**：图标选择区分别规整为显式 4 列与 5 列等宽行；顶部切换条与按钮高度统一对齐。
- **总览金额数字（`MonthlySummaryHeader`、`NetWorthCard`、`account-detail`）**：大额金额开启 `numberOfLines={1}` + `adjustsFontSizeToFit` 防止超长金额撑破卡片。

### 3. 全页面 UI 文案审计结果

- 删除空状态冗余引导句（`本月暂无账目`、`暂无可用账户`、`暂无流水` 仅保留简短状态与必要操作按钮）。
- 精简字段标签与示例占位（如 `金额（人民币）` 改为 `金额`、`备注（选填）` 改为 `备注`、占位符统一为简短示例 `午餐` / `招商储蓄卡` / `尾号 8821` / `咖啡`）。
- 删除开关下方冗余解释句（`计入净资产` 通过账户列表状态标签自解释），去除账户校准面板中重复展示的账面值文字。
- 完整保留影响决策与安全的信息：负债账户输入规则（`填正数（如 500），无欠款填 0`）、所有日期/金额口径单位、表单校验原因及删除/停用/重置账本的不可逆风险确认提示。

### 4. 账务分析页与标准结构化导出

- **账务分析（`src/features/analytics/` + `app/analytics.tsx`）**：点击明细页顶部月度总览卡直达（携带当前查看月份），提供月度支出/收入/结余、日均支出、结余率、记账笔数、近 6 个月收支双柱趋势图（点击柱子切月）、支出/收入分类占比排行及账户分布。
- **结构化数据导出（`src/features/export/` + `app/settings.tsx`）**：
  - **JSON**：2 空格缩进标准 UTF-8 结构化账本快照（`schemaVersion`、`currency`、`summary`、`accounts`、`categories`、`transactions`，同时包含精确整数 `cents` 与两位小数 `yuan` 字段）。
  - **CSV**：带 UTF-8 BOM 的 RFC 4180 标准表格（兼容 Excel / WPS），对用户自由文本执行 CSV 公式注入防护（`=` / `+` / `-` / `@` 前置单引号）。
  - Android 端接入 `expo-file-system` 的 `Directory.pickDirectoryAsync()`（本地目录保存）与系统 `Share` 面板（快速分享）。

## 实施（改动文件清单）

- 新增基础设施与业务模块：
  - [SafeScreen.tsx](../../src/shared/ui/SafeScreen.tsx)
  - `src/features/analytics/types.ts`、`rules.ts`、`service.ts`、`rules.test.ts`、`service.test.ts`
  - `src/features/export/types.ts`、`formatter.ts`、`service.ts`、`native-io.ts`、`formatter.test.ts`、`service.test.ts`
  - [app/analytics.tsx](../../app/analytics.tsx)
- 修改页面与组件：
  - [app/_layout.tsx](../../app/_layout.tsx)、[app/(tabs)/_layout.tsx](../../app/(tabs)/_layout.tsx)、[app/(tabs)/index.tsx](../../app/(tabs)/index.tsx)、[app/(tabs)/assets.tsx](../../app/(tabs)/assets.tsx)
  - [app/record.tsx](../../app/record.tsx)、[app/account-form.tsx](../../app/account-form.tsx)、[app/account-detail.tsx](../../app/account-detail.tsx)、[app/categories.tsx](../../app/categories.tsx)、[app/settings.tsx](../../app/settings.tsx)
  - [Button.tsx](../../src/shared/ui/Button.tsx)、[EmptyState.tsx](../../src/shared/ui/EmptyState.tsx)、[MonthlySummaryHeader.tsx](../../src/features/transactions/components/MonthlySummaryHeader.tsx)、[NetWorthCard.tsx](../../src/features/accounts/components/NetWorthCard.tsx)、[repository.ts](../../src/features/transactions/repository.ts)
- 文档更新：[overview.md](../architecture/overview.md)、[README.md](../../README.md)、[docs/changes/0006-ui-cutout-copy-analytics-export.md](0006-ui-cutout-copy-analytics-export.md)、[docs/changes/README.md](README.md)、[docs/README.md](../README.md)

## 执行验证记录

- **执行环境**：Windows 11，Bun `1.4.5`，Node.js `v26.13.1`，Expo SDK `58.0.26`，TypeScript `6.0.3`，Vitest `5.1.1`。
- **验证命令与实际输出**：
  1. `bun run verify`：
     - `版本校验通过：v0.1.0`
     - `tsc --noEmit`：0 错误
     - `eslint .`：0 错误、0 警告
     - `vitest run`：12 个测试文件、33 条测试用例全部通过（288ms，新增覆盖 JSON/CSV 结构化导出、公式注入防护、分类占比、日均支出、结余率与跨年 6 月趋势）
  2. `bun x expo export --platform android --output-dir .expo/verify-ui`：Metro 成功打包 1241 个模块（8157ms），输出 2.9MB Hermes 字节码与 27 项资源，验证后已清理临时目录。
  3. `bun run build:apk`：`BUILD SUCCESSFUL in 3m 17s`（`575 actionable tasks`），输出 `android/app/build/outputs/apk/release/app-release.apk`（`55.01 MB`，同步验证 Bun 迁移后本地原生 APK 全链路可用）。
- **验证结论**：通过。静态检查、全量真实 SQLite 单元测试、Android Metro 打包与本地 Release APK 构建均通过。
- **已知限制**：尚未在带刘海/挖孔屏的实体安卓设备或模拟器上拉起运行并人工逐屏截屏验证 SAF 文件保存弹窗与顶栏像素间距。

## 后续验证建议

1. 安装最新 `android/app/build/outputs/apk/release/app-release.apk` 至真机或模拟器 `Medium_Phone_API_37.0`，重点实测：
   - 刘海/挖孔屏下首页与资产页上滑时内容是否严格止于系统顶部工具栏下方；
   - 点击明细顶卡跳转「账务分析」页及切换近 6 月趋势柱；
   - 设置页「导出 JSON」与「导出 CSV」保存到手机目录并用 Excel / 文本编辑器打开核验中文与结构可读性。
