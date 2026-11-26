# 0015 修复备注软键盘遮挡、美化删除确认弹窗、精简周期快捷钮与明细全部模式及双页滑动切屏协同

- **状态**：已执行
- **影响范围**：`app/record.tsx`、`app/account-form.tsx`、`app/(tabs)/_layout.tsx`、`app/(tabs)/index.tsx`、`app/(tabs)/assets.tsx`、`app/settings.tsx`、通用确认弹窗与删除账目弹窗、交易服务/仓储/周期组件、双页路由规范化模块、版本清单与变更日志
- **生效版本**：v0.6.0（Android `versionCode: 9`）
- **前置文档**：[0014-fix-tabs-structure-and-record-keypad-order.md](0014-fix-tabs-structure-and-record-keypad-order.md)

## 背景

根据真机使用反馈，需集中解决以下四项问题与需求：

1. **记一笔备注输入被系统输入法遮挡**：
   - `app/record.tsx`（及 `RefundSheet.tsx`、`app/account-form.tsx`）中 `KeyboardAvoidingView` 的 `behavior` 在 Android 上设为 `undefined`。在 Expo SDK 58 / Android 15+ 默认开启 Edge-to-Edge 模式下，窗口不会随 `adjustResize` 自动缩高；点击备注收起自制 4×4 数字键盘后，备注输入栏落至屏幕底部并被弹出的系统输入法直接遮挡。
2. **美化删除条目确认弹窗**：
   - 此前全部删除账目入口（明细/账户详情左滑删除、详情浮窗删除、编辑页顶部删除）均使用系统原生 `Alert.alert`，与应用的深玉青/圆角卡片视觉语言不统一，也缺少待删条目的直观核对信息。
3. **周期选择弹窗精简与明细补齐「全部」模式**：
   - `PeriodPickerSheet` 下方原 3 个快捷按钮过于冗余，仅需保留单个「本月」（按月模式）或「本年」（按年模式）按钮。
   - 明细页当前仅支持「按月 / 按年」，需补齐「全部」模式与账务分析页的三维度体系保持一致。
4. **确保「明细」与「资产」左右跟手滑动切换稳定生效**：
   - 除 v0.5.1 已修复的 `TabRouter` 懒加载导致首屏缺失「资产」与 `pageCount === 1` 禁用手势外，还排查并修复了三处真机隐患：
     - `app/(tabs)/index.tsx` 与 `app/(tabs)/assets.tsx` 此前使用 React Native 原生 `ScrollView` / `RefreshControl`，未纳入 RNGH 原生手势协调器，Android 上易与外层横滑手势冲突；
     - 外层翻页 `activeOffsetX`（18px）与过窄的 `failOffsetY`（10px）不利于单手拇指自然弧线横滑；
     - 首帧 `preload` 若撞上 Expo Router 内部 `isForeignType` 延迟 `ROUTE_NAMES_CHANGED`，存在单次预加载被丢弃且不再重试的竞态风险。

## 方案

1. **Android/iOS 全端精准键盘避让**：
   - `app/record.tsx` 中 `KeyboardAvoidingView` 统一改为 `behavior="padding"` 并传入 `keyboardVerticalOffset={topInset}`（同时在 Edge-to-Edge 与传统 `adjustResize` 下保持零误差避让，不产生双倍空隙）；备注聚焦态增加柔和胶囊背景提示。
   - 同步修复 `RefundSheet.tsx` 与 `app/account-form.tsx` 的 `KeyboardAvoidingView` Android 避让配置。
2. **自定义风格确认弹窗与删除账目预览弹窗**：
   - 新增 `src/shared/ui/ConfirmDialog.tsx`：基于 `useTheme()` 语义令牌的居中浮出卡片（`radius.lg`、`elevation.floating`、轻缩放淡入动效、不可见时卸载 `Modal`、内联错误提示、底部并排取消/破坏性主按钮）。
   - 新增 `src/features/transactions/components/DeleteTransactionDialog.tsx`：内嵌待删账目预览卡（分类图标、标题、日期/账户/备注与带符号等宽金额），对已关联退款的支出附带醒目连带删除警示条。
   - 在 `useTransactionListInteractions.tsx` 与 `app/record.tsx` 统一替换原 `Alert.alert`。
3. **周期单按钮与明细「全部」模式**：
   - `PeriodPickerSheet.tsx` 移除原 3 项快捷按钮，底部仅保留单个「本月 / 本年」按钮。
   - `LedgerPeriodMode` 扩展为 `'month' | 'year' | 'all'`，`repository.ts` 提取 `findAllTransactions`，`service.ts` 新增 `getAllLedger(db)`；`MonthlySummaryHeader.tsx` 适配 `mode === 'all'` 静态居中展示「全部时间」并隐藏翻期箭头；`app/(tabs)/index.tsx` 顶栏切换升级为「按月 / 按年 / 全部」三段，点击分析透传 `scope: 'all'`。
4. **双页左右滑动切屏全面协同与加固**：
   - 抽离 `src/features/navigation/tab-routes.ts` 封装双页占位描述符补齐与固定顺序规范化纯逻辑，并新增 `tab-routes.test.ts` 单元测试。
   - `app/(tabs)/index.tsx` 与 `app/(tabs)/assets.tsx` 的 `ScrollView` 与 `RefreshControl` 切换为 `react-native-gesture-handler` 组件，使外层翻页、中层纵滑/下拉刷新、内层单行左滑处于同一套 RNGH 协调器下。
   - `app/(tabs)/_layout.tsx` 调整翻页阈值为 `activeOffsetX: [-14, 14]`、`failOffsetY: [-22, 22]`、翻页投影门槛 `22%` 屏宽，补充 `onFinalize` 中断回正兜底与 `preload` 80ms/260ms 竞态重试；`TransactionRow.tsx` 保持 `activeOffsetX: [-10, 9999]`（先于外层 14px 激活）并将 `failOffsetY` 放宽至 `[-20, 20]`。

## 实施（改动文件清单）

- 新增：`src/shared/ui/ConfirmDialog.tsx`、`src/features/transactions/components/DeleteTransactionDialog.tsx`、`src/features/navigation/tab-routes.ts`、`src/features/navigation/tab-routes.test.ts`。
- 修改：`app/record.tsx`、`app/account-form.tsx`、`src/features/transactions/components/RecordKeypad.tsx`、`src/features/transactions/components/RefundSheet.tsx`、`src/features/transactions/components/useTransactionListInteractions.tsx`。
- 修改：`src/features/transactions/types.ts`、`src/features/transactions/repository.ts`、`src/features/transactions/service.ts`、`src/features/transactions/service.test.ts`、`src/features/transactions/components/MonthlySummaryHeader.tsx`、`src/features/transactions/components/PeriodPickerSheet.tsx`。
- 修改：`app/(tabs)/_layout.tsx`、`app/(tabs)/index.tsx`、`app/(tabs)/assets.tsx`、`src/features/transactions/components/TransactionRow.tsx`。
- 版本与文档：`package.json`、`app.json`、`app/settings.tsx`、`CHANGELOG.md`、`docs/architecture/overview.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows（PowerShell），Bun + TypeScript 6 + ESLint 9 + Vitest 5
- **验证命令**：`bun run verify`（依次执行 `check:version`、`tsc --noEmit`、`eslint .`、`vitest run`）
- **实际输出**：
  - `node scripts/check-version.mjs`：`版本校验通过：v0.6.0`
  - `tsc --noEmit`：0 错误退出
  - `eslint .`：0 错误、0 警告退出
  - `vitest run`：`Test Files 15 passed (15)`，`Tests 56 passed (56)`（251ms）
- **验证结论**：通过。
- **已知限制**：本次已完成静态检查与全部单元测试，尚未重新构建 `v0.6.0` Android Release APK 并在真机实测输入法弹起高度与左右滑动手感。

## 后续验证建议

- 执行 `bun x expo prebuild --platform android --no-install && bun run build:apk` 打包 `v0.6.0` Release APK 并安装真机验收：
  1. 记一笔点击备注输入时，备注栏稳定悬浮在系统输入法正上方且不被遮挡，收起输入法后自动切回 4×4 数字键盘；
  2. 左滑删除、详情浮窗删除、编辑页删除均弹出美化确认弹窗并正确展示待删条目信息及关联退款提示；
  3. 明细页顶栏可切换「按月 / 按年 / 全部」，按月/按年点击标题弹出的周期菜单下方仅显示单个「本月 / 本年」按钮；
  4. 首屏底栏完整对称展示「明细 / + 记一笔 / 资产」，在明细与资产之间左右跟手滑切顺畅且不与明细单行左滑、纵向滚动及下拉刷新冲突。
