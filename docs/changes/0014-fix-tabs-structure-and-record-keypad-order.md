# 0014 修复主界面双 Tab 与底栏结构性错误、多处 UI 缺陷及调换记一笔账户/日期位置

- **状态**：已执行
- **影响范围**：`app/(tabs)/_layout.tsx`、`app/(tabs)/index.tsx`、`app/analytics.tsx`、`app/settings.tsx`、交易键盘/行左滑/弹窗组件、分类选择组件、版本清单与变更日志
- **生效版本**：v0.5.1（Android `versionCode: 8`）
- **前置文档**：[0012-swipeable-main-tabs.md](0012-swipeable-main-tabs.md)、[0013-direct-account-strip-calendar-drilldown-and-multi-period.md](0013-direct-account-strip-calendar-drilldown-and-multi-period.md)

## 背景

在 v0.5.0 真机运行验收中发现并反馈了以下 UI 结构性错误与交互调整需求：

1. **主界面底栏缺失「资产」入口且居中「+ 记一笔」主按钮右偏、首屏无法左滑切至资产页（P0）**：
   - v0.4.0 使用 Expo Router SDK 58 的 `createStandardRouterNavigator(SwipeTabsContent, TabRouter)` 替代内置 `<Tabs>` 时，未配置 `processDescriptors`、`processState` 与 `createProps: createBaseTabProps`。
   - Expo Router SDK 58 的 `TabRouter` 默认懒加载 Tab，初始化时 `state.routes` 仅包含当前焦点页 `['index']`（未挂载的 `'assets'` 仅存在于 `state.routeNames`），导致底栏渲染缺失右侧「资产」Tab、中间「+ 记一笔」被挤到最右侧，且横向轨道 `pageCount === 1` 导致滑动手势被禁用。
2. **多处 UI 结构性缺陷**：
   - 5 个底部弹窗组件（`TransactionDetailSheet`、`RefundSheet`、`DatePickerSheet`、`PeriodPickerSheet`、`AccountPickerSheet`）在关闭态仍持续渲染 `<Modal visible={false}>`，在 Android 上常驻多个原生不可见窗口层。
   - 整页左右切页手势与明细单行左滑菜单的纵向容差阈值相同，斜向拖拽易导致手势错配。
   - 明细页顶栏 `[按月 | 按年]` 胶囊高度低于右侧 `40×40` 设置圆形按钮，视觉基线不齐。
   - 记一笔账户直选卡片在选中态切换 2px 边框时未补偿内边距，导致选中瞬间发生 1px 抖动。
   - 账务分析页分类排行与账户分布行的名称文本缺少 `flexShrink: 1`，自定义长名称会挤压右侧笔数与金额列。
   - 记一笔二级分类抽屉标签字号与一级相同且在 Android 上 `adjustsFontSizeToFit` 不生效，窄屏存在截断风险且主次层级偏弱。
3. **记一笔键盘上方布局调整**：
   - 将日期选择按钮从左侧移至右侧，横向滑动直选账户条移至左侧，更符合右手拇指点选日期与左手/主视野浏览滑动账户的习惯。

## 方案

1. **补齐 Expo Router SDK 58 Tab 完整生命周期**：
   - 在 `app/(tabs)/_layout.tsx` 对齐 Expo Router `TabsClient` 实现，为 `createStandardRouterNavigator` 补充 `processDescriptors`（`appendMissingTabDescriptors`）、`processState`（`normalizeTabRoutesState`，按 `routeNames` 固定顺序输出「明细(0) / 资产(1)」）与 `createProps: createBaseTabProps`。
   - 在 `SwipeTabsContent` 挂载后对占位路由（通过 `isPlaceholderDescriptor` 识别 `descriptor.route.key === undefined`）主动调用 `preload(route.name)` 预挂载「资产」页；渲染轨道中跳过未完成挂载的占位路由以避免空渲染。
   - 底栏固定渲染左「明细」+ 中「+ 记一笔」+ 右「资产」三段对称结构，消除首帧跳动与 FAB 偏移。
   - 整页切页手势 `failOffsetY` 收紧为 `[-10, 10]`，同步将 `TransactionRow` 单行左滑 `failOffsetY` 放宽至 `[-14, 14]`，避免对角线轻拖误触切页。
2. **调换记一笔键盘区账户条与日期按钮位置**：
   - 重排 `RecordKeypad.tsx` 的 `selectorStrip`：支出/收入模式下左侧为横向 `ScrollView` 账户卡片（`flex: 1`）、中间为竖线分隔、右侧为固定日期卡片；转账模式下左侧占位、日期卡片靠右对齐。
   - 账户卡片根据选中态动态补偿内边距（2px 边框时 `paddingHorizontal: 10, paddingVertical: 4`，1px 边框时 `11 / 5`），消除切换选中时的 1px 位移抖动。
3. **全量修复弹窗常驻与局部布局细节**：
   - 5 个底部弹窗组件在不可见时直接返回 `null`（位于全部 Hooks 之后），仅在打开时挂载原生 `Modal`。
   - 明细页顶栏 `modeSwitch` 统一固定 `height: 40`、`modeOption` `height: 32`，与右侧 `40×40` 设置按钮完全齐平。
   - 账务分析页分类与账户名称文本补加 `flexShrink: 1`。
   - 记一笔二级分类子项标签字号调整为 `11`，强化一级/二级视觉层级并提升窄屏可读性。

## 实施（改动文件清单）

- `app/(tabs)/_layout.tsx`：补齐 `TabRouter` 占位描述符、顺序规范化、自动 `preload` 与三段对称底栏，收紧整页切页 `failOffsetY` 至 `[-10, 10]`。
- `src/features/transactions/components/RecordKeypad.tsx`：左侧改为横向滑动直选账户卡片、右侧改为固定日期按钮，补齐选中态边框内边距补偿。
- `src/features/transactions/components/TransactionRow.tsx`：放宽行内左滑 `failOffsetY` 至 `[-14, 14]`。
- `src/features/transactions/components/TransactionDetailSheet.tsx`：不可见或无条目时返回 `null` 卸载 `Modal`。
- `src/features/transactions/components/RefundSheet.tsx`：不可见或无目标记录时返回 `null` 卸载 `Modal`。
- `src/features/transactions/components/DatePickerSheet.tsx`：不可见时返回 `null` 卸载 `Modal`。
- `src/features/transactions/components/PeriodPickerSheet.tsx`：不可见时返回 `null` 卸载 `Modal`。
- `src/features/transactions/components/AccountPickerSheet.tsx`：不可见时返回 `null` 卸载 `Modal`。
- `app/(tabs)/index.tsx`：统一顶栏「按月 / 按年」胶囊高度为 `40px` 与设置按钮齐平。
- `app/analytics.tsx`：分类排行与账户分布行名称文本补加 `flexShrink: 1`。
- `src/features/categories/components/CategoryHierarchyPicker.tsx`：二级分类标签字号调整为 `11`。
- `package.json`、`app.json`、`app/settings.tsx`、`CHANGELOG.md`：递增版本号至 `0.5.1`（Android `versionCode: 8`）并记录变更日志。

## 执行验证记录

- **执行环境**：Windows（PowerShell），Bun + TypeScript 6 + ESLint 9 + Vitest 5
- **验证命令**：`bun run verify`（依次执行 `check:version`、`tsc --noEmit`、`eslint .`、`vitest run`）
- **实际输出**：
  - `node scripts/check-version.mjs`：`版本校验通过：v0.5.1`
  - `tsc --noEmit`：0 错误退出
  - `eslint .`：0 错误、0 警告退出
  - `vitest run`：`Test Files 14 passed (14)`，`Tests 53 passed (53)`（214ms）
- **验证结论**：通过。
- **已知限制**：本次仅执行静态检查与单元测试，尚未重新打包 `v0.5.1` Android Release APK 并在真机实测滑动与弹窗交互。

## 后续验证建议

- 构建 `v0.5.1` Release APK 安装至真机，重点验收：
  1. 首屏冷启动即完整展示「明细 / + 记一笔 / 资产」三段对称底栏，且可直接左滑跟手切换至「资产」页再右滑返回「明细」；
  2. 明细列表中单行轻度斜向左滑优先触发行内菜单，不会误触翻页；
  3. 记一笔页账户卡片位于左侧横向滑动、日期按钮位于右侧，点选账户无 1px 抖动；
  4. 连续开关详情/退款/日期/周期/账户弹窗无残影或手势失灵。
