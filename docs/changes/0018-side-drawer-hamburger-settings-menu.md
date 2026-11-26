# 0018 新增侧边抽屉与左上角汉堡设置菜单并取消右上角设置按钮

- **状态**：已执行
- **影响范围**：`app/(tabs)/_layout.tsx`、`app/(tabs)/index.tsx`、`app/(tabs)/assets.tsx`、`app/settings.tsx`、`src/features/navigation/drawer-context.tsx`、`src/features/settings/components/SettingsPanel.tsx`、`src/features/settings/components/SettingsDrawer.tsx`、版本清单与文档
- **生效版本**：v0.7.0（Android `versionCode: 12`）
- **前置文档**：[0005-refine-bottom-nav-and-settings-entry.md](0005-refine-bottom-nav-and-settings-entry.md)、[0017-full-ui-consistency-audit-and-app-name-cleanup.md](0017-full-ui-consistency-audit-and-app-name-cleanup.md)

## 背景

此前「明细」与「资产」两个主页的右上角均放置了独立的设置齿轮按钮，点击后整页推入 `/settings` 路由。为让顶栏右侧更聚焦高频主操作（「按月 / 按年 / 全部」切换与「+ 新增」账户），并提升设置面板的随手可达性，现将设置入口改版为左上角汉堡菜单（`≡`）展开的左侧边抽屉，同时取消两页右上角设置按钮。

## 方案

1. **高内聚复用设置面板（`src/features/settings/components/SettingsPanel.tsx`）**：
   - 将原 `app/settings.tsx` 中的账本概览、分类管理入口、外观三段切换、JSON/CSV 数据导出（统一 `ActionSheet` + `ConfirmDialog`）、存储/版本信息与重置账本（含数据概览卡的破坏性 `ConfirmDialog`）抽离至独立设置面板组件。
   - 抽屉形态（`variant="drawer"`）顶部配备与明细总览卡、净资产卡一脉相承的深玉青（`heroBg`）品牌数据头（含 `ZeroTally`、版本号、关闭按钮及实时账目/账户/分类计数），自动隔离异形屏顶部安全区；点击「分类管理」前自动收起抽屉再跳转 `/categories`。
   - `app/settings.tsx` 精简为薄壳页面，复用 `SettingsPanel`（`variant="page"`）保持深链接与路由兼容。
2. **零新增依赖的原生流畅侧边抽屉（`src/features/settings/components/SettingsDrawer.tsx`）**：
   - 挂载在 `app/(tabs)/_layout.tsx` 顶层叠加容器（不使用嵌套原生 `Modal`），避免 Android 双层 `Modal` 叠加导致抽屉内 `ActionSheet` / `ConfirmDialog` 错层或闪烁；完全收起后卸载子树不常驻内存。
   - 抽屉宽为屏宽 84%（上限 336dp），支持右侧遮罩点击、关闭按钮、**跟手向左滑动收起**（RNGH `usePanGesture` 与内部 RNGH `ScrollView` 协同）与 Android 物理/手势返回键（`BackHandler`）关闭。
3. **双页汉堡菜单入口与手势隔离**：
   - 新增轻量上下文 `src/features/navigation/drawer-context.tsx`（`MainDrawerContext` / `useMainDrawer`），在 `app/(tabs)/_layout.tsx` 统一编排抽屉开合状态，并在抽屉打开时临时禁用底层 `SwipeTabs` 横滑手势。
   - `app/(tabs)/index.tsx` 与 `app/(tabs)/assets.tsx` 均移除右上角设置按钮，顶栏最左侧新增 `40×40` 圆形汉堡按钮（`menu-outline`，与右侧控件 40px 高度完全齐平）；明细页打开抽屉时自动收起已展开的行内左滑菜单。

## 实施（改动文件清单）

- 新增：`src/features/navigation/drawer-context.tsx`、`src/features/settings/components/SettingsPanel.tsx`、`src/features/settings/components/SettingsDrawer.tsx`。
- 修改：`app/(tabs)/_layout.tsx`、`app/(tabs)/index.tsx`、`app/(tabs)/assets.tsx`、`app/settings.tsx`。
- 版本与文档：`package.json`、`app.json`、`CHANGELOG.md`、`README.md`、`docs/architecture/overview.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows（PowerShell），Bun + TypeScript 6 + ESLint 9 + Vitest 5
- **验证命令**：`bun run verify`（依次执行 `check:version`、`tsc --noEmit`、`eslint .`、`vitest run`）
- **实际输出**：
  - `node scripts/check-version.mjs`：`版本校验通过：v0.7.0`
  - `tsc --noEmit`：0 错误退出
  - `eslint .`：0 错误、0 警告退出
  - `vitest run`：`Test Files 15 passed (15)`，`Tests 56 passed (56)`（219ms）
- **验证结论**：通过。
- **已知限制**：本次仅执行静态检查与单元测试，尚未重新打包 `v0.7.0` Android Release APK 并在真机实测抽屉滑出、左滑关闭与返回键交互。

## 后续验证建议

- 构建 `v0.7.0` Release APK 安装至真机验收：
  1. 明细与资产两页右上角设置按钮均已移除，左上角汉堡菜单按钮点击后左侧抽屉平滑滑出并覆盖底栏；
  2. 抽屉内切换浅色/深色外观、点击分类管理（先关抽屉再跳转）、触发 JSON/CSV 导出 `ActionSheet` 与重置账本 `ConfirmDialog` 层级均正常浮于抽屉之上；
  3. 抽屉展开态下支持点遮罩、点 `×`、跟手左滑与按系统返回键关闭，且不会误拖到底层双页切换。
