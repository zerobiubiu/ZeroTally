# 0025 - v1.0.1 全仓统一滑动分段控件、分类管理圆润卡片重构与快捷记账分页手势精修

- **状态**：已执行
- **影响范围**：`src/shared/ui/`、`src/features/settings/`、`src/features/categories/`、`src/features/quick-record/`、`app/`、版本与文档
- **生效版本**：v1.0.1（Android `versionCode: 19`）
- **前置文档**：[0024-v1-settings-categories-portability-and-quick-record.md](0024-v1-settings-categories-portability-and-quick-record.md)

## 1. 背景

基于 `v1.0.0` 真机与设计审视反馈，本次聚焦于交互一致性与视觉风格收口：

1. **全应用分段切换交互统一**：此前仅明细顶栏支持长按震动滑动切档，设置外观、分类收支、账务分析、快捷记账类型与账户性质仍为静态按钮，交互割裂。
2. **设置侧栏与图标细节打磨**：设置侧栏中「关于」应置于列表最下方紧邻版本号；分类管理右上角导入导出图标调整为 Tabler `database` 风格线性三层圆柱数据库图标。
3. **分类管理条目回归圆润卡片气质**：原连体大容器开启 `overflow: 'visible'` 后被首尾直角行遮盖四边圆角，视觉生硬偏离 ZeroTally 柔和浮卡风格。
4. **清空账本双阶段防误触强化**：移除验证码刷新按钮（每次弹出自动生成随机 4 位数字），并在验证码校验通过点击「确认清空」后再拉起底部最终确认菜单。
5. **快捷记账半屏窗全区手势与横向分页**：解除必须按住顶部横条才能上下滑动的限制，面板任意位置均可上下滑动收起或二次展开完整记一笔，快捷选项改用左右滑动分页。

## 2. 方案

### 2.1 全仓统一 iOS 风格分段滑块组件（`SlidingSegmentedControl`）

- 抽离纯几何与档位解析规则至 [sliding-segmented-rules.ts](../../src/shared/ui/sliding-segmented-rules.ts) 并配套 Vitest 单测 [sliding-segmented-rules.test.ts](../../src/shared/ui/sliding-segmented-rules.test.ts)。
- 扩展 [SlidingSegmentedControl.tsx](../../src/shared/ui/SlidingSegmentedControl.tsx)：支持通栏均分（`fullWidth`）、胶囊/圆角矩形（`shape`）、内凹/浮起轨道层级（`trackTone`）、字号层级（`textSize`）及单格自定义语义配色（`activeBackgroundColor` / `activeTextColor`）。
- 全仓 **7 处**分段互斥切换全部收口调用同一组件：
  1. 明细顶栏「按月 / 按年 / 全部」（[app/(tabs)/_layout.tsx](../../app/(tabs)/_layout.tsx)）
  2. 设置抽屉与设置页「外观：系统 / 浅色 / 深色」（[SettingsPanel.tsx](../../src/features/settings/components/SettingsPanel.tsx)）
  3. 分类管理「支出分类 / 收入分类」（[app/categories.tsx](../../app/categories.tsx)）
  4. 账务分析顶部「按月 / 按年 / 全部」（[app/analytics.tsx](../../app/analytics.tsx)）
  5. 账务分析中部「支出构成 / 收入构成」（[app/analytics.tsx](../../app/analytics.tsx)）
  6. 快捷记账浮窗「支出 / 收入」（[QuickTemplateEditorDialog.tsx](../../src/features/quick-record/components/QuickTemplateEditorDialog.tsx)，并在 `<Modal>` 内包裹 `GestureHandlerRootView` 确保 Android 弹窗手势有效）
  7. 账户表单「资产 / 负债」（[app/account-form.tsx](../../app/account-form.tsx)）

### 2.2 设置侧栏排序与 `database` 图标替换

- [SettingsPanel.tsx](../../src/features/settings/components/SettingsPanel.tsx)：菜单顺序调整为 **外观 → 分类管理 → 高级设置 → 关于 → 底部居中版本号**。
- [AppIcon.tsx](../../src/shared/ui/AppIcon.tsx) & [app/categories.tsx](../../app/categories.tsx)：零新增依赖启用已内置的 `@expo/vector-icons/Feather`（`feather:` 前缀），将分类管理右上角导入导出图标替换为 `feather:database`。

### 2.3 分类管理条目圆润卡片化重构

- [CategoryManageRows.tsx](../../src/features/categories/components/CategoryManageRows.tsx) & [app/categories.tsx](../../app/categories.tsx)：
  - 每个一级分类渲染为独立大圆角浮卡（`borderRadius: theme.radius.lg` + `elevation.card` + `ROOT_CARD_GAP = 10`），单行左滑视口内部 `overflow: 'hidden'` 使左滑操作色块自然贴合卡片圆弧；
  - 一级图标徽章统一为 `40×40` 正圆浅底、子分类计数改为柔和圆角胶囊、右侧「+」改为无硬边浅玉青正圆按钮；
  - 展开的二级分类作为内嵌圆角柔和子面板（`borderRadius: theme.radius.md`，遵循嵌套圆角层级）收纳于一级卡片内，二级右侧「编辑 / 停用(启用) / 删除」升级为柔和语义圆角微胶囊；
  - 一级长按拖拽排序步距精确调整为 `ROOT_DRAG_STRIDE = ROOT_ROW_HEIGHT + ROOT_CARD_GAP`（74px），拖动时整张圆角卡片浮起让位。

### 2.4 清空账本双阶段确认流程

- [ClearLedgerDialog.tsx](../../src/features/settings/components/ClearLedgerDialog.tsx)：移除刷新按钮，验证码居中展示且每次点击清空打开时自动生成新 4 位随机数。
- [app/advanced-settings.tsx](../../app/advanced-settings.tsx)：验证码校验通过点「确认清空」后先关闭验证码窗并弹出底部最终确认菜单（`ActionSheet`），提供「先去导出 JSON 备份」「确认永久清空账本」与「取消」选项。

### 2.5 快捷记账半屏窗全区上下滑动与 3×2 横向分页

- [QuickRecordSheet.tsx](../../src/features/quick-record/components/QuickRecordSheet.tsx)：
  - 将 `sheetPanGesture`（`activeOffsetY: [-10, 10]`, `failOffsetX: [-14, 14]`）上提至整张半屏窗主容器，面板内任意区域均可直接上下跟手滑动收起或二次展开完整记一笔；
  - 快捷选项区重构为 **3 列 × 2 行（每页 6 格）** 横向分页轨道，由独立 `horizontalPagerGesture`（`activeOffsetX: [-10, 10]`, `failOffsetY: [-14, 14]`）与外层竖向手势物理正交驱动，支持边缘阻尼、切页震动及底部可点击圆点分页指示器。

## 3. 实施（改动文件清单）

- 新增文件：[src/shared/ui/sliding-segmented-rules.ts](../../src/shared/ui/sliding-segmented-rules.ts)、[src/shared/ui/sliding-segmented-rules.test.ts](../../src/shared/ui/sliding-segmented-rules.test.ts)
- 修改文件：
  - [src/shared/ui/SlidingSegmentedControl.tsx](../../src/shared/ui/SlidingSegmentedControl.tsx)、[src/shared/ui/AppIcon.tsx](../../src/shared/ui/AppIcon.tsx)
  - [src/features/settings/components/SettingsPanel.tsx](../../src/features/settings/components/SettingsPanel.tsx)、[ClearLedgerDialog.tsx](../../src/features/settings/components/ClearLedgerDialog.tsx)
  - [src/features/categories/components/CategoryManageRows.tsx](../../src/features/categories/components/CategoryManageRows.tsx)
  - [src/features/quick-record/components/QuickRecordSheet.tsx](../../src/features/quick-record/components/QuickRecordSheet.tsx)、[QuickTemplateEditorDialog.tsx](../../src/features/quick-record/components/QuickTemplateEditorDialog.tsx)
  - [app/(tabs)/_layout.tsx](../../app/(tabs)/_layout.tsx)、[app/categories.tsx](../../app/categories.tsx)、[app/analytics.tsx](../../app/analytics.tsx)、[app/account-form.tsx](../../app/account-form.tsx)、[app/advanced-settings.tsx](../../app/advanced-settings.tsx)
  - [package.json](../../package.json)、[app.json](../../app.json)、[CHANGELOG.md](../../CHANGELOG.md)、[docs/architecture/overview.md](../../docs/architecture/overview.md)

## 4. 执行验证记录

- **执行环境**：Windows 11，Bun 1.4.5，Node.js 26，Android SDK Build-Tools 37.0.0，Android Studio JBR 21
- **质量门禁命令**：`bun run verify`
- **质量门禁输出**：
  - `node scripts/check-version.mjs`：`版本校验通过：v1.0.1`
  - `tsc --noEmit`：0 错误
  - `eslint .`：0 错误 0 警告
  - `vitest run`：**19 passed (19)，68 passed (68)**（333ms）
- **APK 构建命令**：`bun x expo prebuild --platform android --no-install && bun run build:apk`
- **APK 校验结果**：
  - 产物路径：`android/app/build/outputs/apk/release/app-release.apk`（60,009,030 字节 / 57.23 MB）
  - `aapt2 dump badging`：`package='com.keepaccounts.app'`、`versionCode='19'`、`versionName='1.0.1'`、`application-label='ZeroTally'`、`minSdkVersion='24'`、`targetSdkVersion='36'`、`native-code='arm64-v8a' 'x86_64'`
  - `apksigner verify --verbose`：`Verifies`（APK Signature Scheme v2 = true，signers = 1）
  - SHA-256：`5F54CDBA9AA2A1340BCA109DC277881451EECC660A7AAC82C4C9BD61F6FE9709`
- **验证结论**：通过。
- **已知限制**：长按震动滑切手感、独立圆角卡片长按拖拽及快捷记账半屏窗正交上下/左右滑动需在 Android 真机安装 APK 体验确认。

## 5. 后续验证建议

1. 依次验证设置外观、分类收支、账务分析双分段、快捷记账浮窗及账户性质 7 处分段控件的轻点与长按 140ms 震动滑动切换体验。
2. 检查设置侧栏中「关于」是否位于底部版本号正上方，分类管理右上角 `database` 图标及卡片化圆润视觉效果。
3. 验证高级设置「清空账本」：确认无刷新按钮、关闭重开生成新验证码、输完验证码后弹出底部最终确认菜单。
4. 在底栏上滑拉出快捷记账半屏窗，测试在图标卡片区任意位置上下滑动收起/展开完整记一笔，以及快捷项超过 5 个时左右滑动分页与圆点切换。
