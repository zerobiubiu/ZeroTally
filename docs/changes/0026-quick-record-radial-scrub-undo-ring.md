# 0026 - v1.1.0 长按扇形极速记账、单卡滑动微调、内嵌记账 UI 编辑与 3 秒圆环倒计时撤销

- **状态**：已执行
- **影响范围**：`src/features/quick-record/`、`src/features/transactions/components/RecordKeypad.tsx`、`src/shared/haptics/`、`src/shared/ui/CountdownRing.tsx`、`app/(tabs)/_layout.tsx`、版本与文档
- **生效版本**：v1.1.0（Android `versionCode: 20`）
- **前置文档**：[0025-unified-segmented-control-and-ui-polish.md](0025-unified-segmented-control-and-ui-polish.md)

## 1. 背景

在 `v1.0.1` 基础上，围绕「快捷记账」高频交互与视觉统一进一步升级：

1. **长按「+ 记一笔」扇形极速记账**：作为「快捷记账的快捷方式、记一笔的快捷快捷方式」，长按底栏居中 `+` 按钮直接绽放扇形快捷选项，手指滑动选择松手即刻记账，纯选择不提供多余操作且无需撤回入口。
2. **快捷记账卡片原地 3 秒圆环倒计时撤销**：快捷记账无高频连续连点同一项的需求，移除半屏窗顶部文字撤销横幅，点击快捷卡片入账后轻震动并原地变身 3 秒圆环倒计时撤销卡，3 秒内再次点击该卡即撤回并触发长震动提醒。
3. **单个快捷卡片长按手势直调金额与账户**：长按卡片后上下滑动智能调整金额、左右滑动切换关联账户，无需每次进入表单编辑。
4. **快捷记账新增/编辑复用完整记一笔 UI 且精简顶栏**：移除独立居中弹窗，在快捷记账非全屏浮层内直接复用完整记一笔的二级分类选择器与计算键盘（裁剪日期与备注，原备注位改为「快捷卡片名称」），同时移除快捷记账标题栏右侧冗余的「完整记账」按钮。

## 2. 方案

### 2.1 长按底栏「+」扇形快捷选择即记账

- 新增纯几何与射线命中规则 [radial-menu-rules.ts](../../src/features/quick-record/radial-menu-rules.ts) 与单测 [radial-menu-rules.test.ts](../../src/features/quick-record/radial-menu-rules.test.ts)：1~5 项对称分布于上方扇弧，手指停留在中心死区（`<42px`）或明显下拉（`dy > 34px`）返回 `null` 安全取消。
- 新增无拦截叠加层 [QuickRadialOverlay.tsx](../../src/features/quick-record/components/QuickRadialOverlay.tsx)：以底栏居中 `+` 圆心为原点弹簧绽放最多 5 项智能快捷气泡，并在扇弧上方动态展示当前命中项的名称、收支金额与账户预览胶囊。
- 在 [app/(tabs)/_layout.tsx](../../app/(tabs)/_layout.tsx) 中按数据库 `revision` 预热缓存前 5 项快捷条目（优先自定义模板，无自定义自动采用近 30 天高频推荐），居中 `+` 按钮挂载长按 260ms 激活的 `fabRadialPanGesture`（与短按跳转 `/record` 及底栏上滑拉起快捷记账半屏窗隔离无冲突）；滑入扇区触发刻度震动，松手直接调用 `executeQuickRecord` + 轻震动入账，弹出 1.5 秒极简确认提示条且不提供撤回按钮。

### 2.2 原地 3 秒圆环倒计时撤销卡与轻/长震动分层

- 扩展 [haptics.ts](../../src/shared/haptics/haptics.ts)：新增 `hapticLongAlert()`，Android 复用 `expo-haptics` 已声明的 `VIBRATE` 权限触发 `140ms` 明显长震动（非 Android 回退系统警示组合震动），与轻震动 `hapticLight()` 形成清晰手感区分。
- 新增零 SVG 依赖原生动画组件 [CountdownRing.tsx](../../src/shared/ui/CountdownRing.tsx)：基于双半圆裁剪旋转法 + `useNativeDriver: true` 实现 360° → 0° 顺时针 60fps 平滑圆环倒计时。
- 重构 [QuickRecordTile.tsx](../../src/features/quick-record/components/QuickRecordTile.tsx) 与 [QuickRecordSheet.tsx](../../src/features/quick-record/components/QuickRecordSheet.tsx)：移除原顶部文字撤销条，为每张卡片维护独立 `undoCards` 倒计时状态；轻点快捷卡后触发 `hapticLight()` 并原地切换为带 3 秒圆环倒计时的「点击撤销」卡，3 秒内再点即调用 `deleteTransaction` 并触发 `hapticLongAlert()` 撤回，超时或关闭面板自动清理还原。

### 2.3 单张快捷卡片长按手势调金额与切账户

- 新增纯规则 [scrub-rules.ts](../../src/features/quick-record/scrub-rules.ts) 与单测 [scrub-rules.test.ts](../../src/features/quick-record/scrub-rules.test.ts)：实现轴向锁（`amount` / `account`）、分档自适应金额步长（`<= ¥20: ¥1`、`<= ¥100: ¥5`、`<= ¥500: ¥10`、`> ¥500: ¥50`）与账户索引循环钳位。
- 在 [QuickRecordTile.tsx](../../src/features/quick-record/components/QuickRecordTile.tsx) 接入长按触发拖拽微调，顶部同步浮现高清实时调节 HUD 条与每步刻度震动，松手自动落盘（推荐项自动保存为自定义快捷模板）；长按不动直接松手进入编辑态。

### 2.4 内嵌非全屏复用完整记一笔 UI 与顶栏精简

- 删除废弃独立居中弹窗 `QuickTemplateEditorDialog.tsx`，新增内嵌编辑器 [QuickTemplateComposer.tsx](../../src/features/quick-record/components/QuickTemplateComposer.tsx)：在同一非全屏浮层内平滑舒展至约 80% 屏高（上方保留暗色遮罩绝不全屏铺满），直接复用 `SlidingSegmentedControl`（支出/收入）、`CategoryHierarchyPicker`（5 列一二级分类抽屉）与扩展后的 [RecordKeypad.tsx](../../src/features/transactions/components/RecordKeypad.tsx)（隐藏日期按钮、原备注输入框改为 12 字以内「快捷卡片名称」、未手填自动跟随所选分类名、保存写入 `note: ''`）。
- 精简 [QuickRecordSheet.tsx](../../src/features/quick-record/components/QuickRecordSheet.tsx) 卡片标题栏：移除右侧冗余的「完整记账」按钮，保留右上角 `+` 新增快捷项入口（展开完整记一笔由上滑面板或轻点顶部拖动条承接）。

## 3. 实施（改动文件清单）

- 新增文件：
  - [src/features/quick-record/scrub-rules.ts](../../src/features/quick-record/scrub-rules.ts)、[src/features/quick-record/scrub-rules.test.ts](../../src/features/quick-record/scrub-rules.test.ts)
  - [src/features/quick-record/radial-menu-rules.ts](../../src/features/quick-record/radial-menu-rules.ts)、[src/features/quick-record/radial-menu-rules.test.ts](../../src/features/quick-record/radial-menu-rules.test.ts)
  - [src/shared/ui/CountdownRing.tsx](../../src/shared/ui/CountdownRing.tsx)
  - [src/features/quick-record/components/QuickRecordTile.tsx](../../src/features/quick-record/components/QuickRecordTile.tsx)
  - [src/features/quick-record/components/QuickTemplateComposer.tsx](../../src/features/quick-record/components/QuickTemplateComposer.tsx)
  - [src/features/quick-record/components/QuickRadialOverlay.tsx](../../src/features/quick-record/components/QuickRadialOverlay.tsx)
- 删除文件：`src/features/quick-record/components/QuickTemplateEditorDialog.tsx`
- 修改文件：
  - [src/shared/haptics/haptics.ts](../../src/shared/haptics/haptics.ts)
  - [src/features/transactions/components/RecordKeypad.tsx](../../src/features/transactions/components/RecordKeypad.tsx)
  - [src/features/quick-record/components/QuickRecordSheet.tsx](../../src/features/quick-record/components/QuickRecordSheet.tsx)
  - [app/(tabs)/_layout.tsx](../../app/(tabs)/_layout.tsx)
  - [package.json](../../package.json)、[app.json](../../app.json)、[CHANGELOG.md](../../CHANGELOG.md)、[docs/architecture/overview.md](../../docs/architecture/overview.md)

## 4. 执行验证记录

- **执行环境**：Windows 11，Bun 1.4.5，Node.js 26，Android SDK Build-Tools 37.0.0，Android Studio JBR 21
- **质量门禁命令**：`bun run verify`
- **质量门禁输出**：
  - `node scripts/check-version.mjs`：`版本校验通过：v1.1.0`
  - `tsc --noEmit`：0 错误
  - `eslint .`：0 错误 0 警告
  - `vitest run`：**21 passed (21)，74 passed (74)**（382ms，含新增 `scrub-rules.test.ts` 3 个用例与 `radial-menu-rules.test.ts` 3 个用例）
- **APK 构建命令**：`bun x expo prebuild --platform android --no-install && bun run build:apk`
- **APK 校验结果**：
  - 产物路径：`android/app/build/outputs/apk/release/app-release.apk`（60,039,970 字节 / 57.26 MB）
  - `aapt2 dump badging`：`package='com.keepaccounts.app'`、`versionCode='20'`、`versionName='1.1.0'`、`application-label='ZeroTally'`、`minSdkVersion='24'`、`targetSdkVersion='36'`、`native-code='arm64-v8a' 'x86_64'`
  - `apksigner verify --verbose`：`Verifies`（APK Signature Scheme v2 = true，signers = 1）
  - SHA-256：`D49837435B9B03728309FEADE26C231976FCDAE413F6E0E38F48309F547C9A27`
- **验证结论**：通过。
- **已知限制**：长按 `+` 扇形手势灵敏度、单卡长按上下/左右微调手感、3 秒倒计时圆环动效及 Android 140ms 长震动体感需在真机安装 APK 体验确认。

## 5. 后续验证建议

1. 长按底栏居中 `+` 按钮，验证扇形快捷选项从左至右智能绽放、手指划选时的震动反馈与松手直接入账（确认无撤回入口，滑回原点松手安全取消）；同时验证短按 `+` 与底栏上滑拉起快捷记账半屏窗不受影响。
2. 在快捷记账半屏窗点击任一快捷卡片，验证轻震动反馈、卡片原地变身为 3 秒顺时针旋转圆环撤销卡，以及 3 秒内再点撤回时的长震动提醒与 3 秒后自动恢复。
3. 长按任一快捷卡片，验证上下滑动实时步进调金额、左右滑动切账户并持久化落盘，以及长按不动松手或点右上角 `+` 后在非全屏浮层内直接以记一笔同款分类网格与计算键盘编辑卡片名称、金额与账户。
4. 确认快捷记账卡片标题栏右侧仅显示 `+` 新增按钮，已移除「完整记账」按钮，且上滑面板仍可展开完整记一笔。
