# 0028 - v1.1.2 快捷卡片新增/编辑页重构为全屏记一笔同款页与下滑返回

- **状态**：已执行
- **影响范围**：`src/features/quick-record/components/QuickTemplateComposer.tsx`、`src/features/quick-record/components/QuickRecordSheet.tsx`、版本与文档
- **生效版本**：v1.1.2（Android `versionCode: 22`）
- **前置文档**：[0027-fix-longpress-gestures-floating-hud-and-settings-about.md](0027-fix-longpress-gestures-floating-hud-and-settings-about.md)

## 1. 背景

基于 `v1.1.1` 真机使用反馈，快捷记账卡片的新增与编辑视图存在以下体验短板：

1. 此前占约 3/4 屏高且顶部带有独立横条，下滑横条会直接把整个快捷记账半屏窗一起关闭，而不是退回快捷记账卡片列表。
2. 界面布局与交互手势尚未与完整「记一笔」完全一致（缺少顶栏及分类区顶部 1:1 跟手下滑退回能力，顶栏样式亦略有割裂）。

## 2. 方案

### 2.1 全屏化与 1:1 对齐「记一笔」界面

- 重构 [QuickTemplateComposer.tsx](../../src/features/quick-record/components/QuickTemplateComposer.tsx) 为独立全屏叠加层（`StyleSheet.absoluteFill`、`zIndex: 130`、`elevation: 30`），自底向上 240ms 平滑滑入。
- 界面布局与 [app/record.tsx](../../app/record.tsx) 保持 1:1 一致：
  - 顶栏采用相同 `SafeScreen` 顶部安全区、`48px` 高顶栏与 `支出 / 收入` 下划线高亮切换（移除「转账」页签），左侧关闭返回按钮，右侧在编辑态显示删除图标、新增态直达分类管理；
  - 中部直接复用 5 列 `CategoryHierarchyPicker`；
  - 底部复用 `RecordKeypad`（开启 `includeBottomInset` 完整适配底部安全区，支持横向直选账户与 4×4 计算键盘，隐藏日期选择，原备注输入位改为最多 12 字的「快捷方式卡片名称」）。

### 2.2 同款下滑收起手势（仅退回快捷记账面板，不全部消失）

- 移除原顶部独立拖动横条与 3/4 屏高度切换逻辑。
- 在 [QuickTemplateComposer.tsx](../../src/features/quick-record/components/QuickTemplateComposer.tsx) 复用与 `app/record.tsx` 一致的双热区向下滑出机制：
  - 顶栏区域（`headerDismissPan`）随时支持向下 1:1 跟手拖拽；
  - 分类列表（`bodyDismissPan` + `nativeScrollGesture` via `useSimultaneousGestures`）仅在滚动至顶部（`scrollOffsetY <= 2`）时向下拉跟手滑出，不干扰正常分类滚动；
  - 仅支持下滑收起，不支持上滑；下滑达标松手、点击左上角关闭、保存/删除及系统返回键均只关闭全屏编辑页（调用 `onBack`），下方的 [QuickRecordSheet.tsx](../../src/features/quick-record/components/QuickRecordSheet.tsx) 快捷卡片面板始终保持展开状态。

## 3. 实施（改动文件清单）

- 修改文件：
  - [src/features/quick-record/components/QuickTemplateComposer.tsx](../../src/features/quick-record/components/QuickTemplateComposer.tsx)
  - [src/features/quick-record/components/QuickRecordSheet.tsx](../../src/features/quick-record/components/QuickRecordSheet.tsx)
  - [package.json](../../package.json)、[app.json](../../app.json)、[CHANGELOG.md](../../CHANGELOG.md)、[docs/architecture/overview.md](../../docs/architecture/overview.md)

## 4. 执行验证记录

- **执行环境**：Windows 11，Bun 1.4.5，Node.js 26，Android SDK Build-Tools 37.0.0，Android Studio JBR 21
- **质量门禁命令**：`bun run verify`
- **质量门禁输出**：
  - `node scripts/check-version.mjs`：`版本校验通过：v1.1.2`
  - `tsc --noEmit`：0 错误
  - `eslint .`：0 错误 0 警告
  - `vitest run`：**21 passed (21)，74 passed (74)**（362ms）
- **APK 构建命令**：`bun x expo prebuild --platform android --no-install && bun run build:apk`
- **APK 校验结果**：
  - 产物路径：`android/app/build/outputs/apk/release/app-release.apk`（60,048,266 字节 / 57.27 MB）
  - `aapt2 dump badging`：`package='com.keepaccounts.app'`、`versionCode='22'`、`versionName='1.1.2'`、`application-label='ZeroTally'`、`minSdkVersion='24'`、`targetSdkVersion='36'`、`native-code='arm64-v8a' 'x86_64'`
  - `apksigner verify --verbose`：`Verifies`（APK Signature Scheme v2 = true，signers = 1）
  - SHA-256：`F42AACFA78903336F3DFFB4942A729EBDD165A08329A0A5C5F0035B338473D9C`
- **验证结论**：通过。
- **已知限制**：全屏自底滑入、顶栏及分类区顶部跟手下滑退回快捷面板的手感及软键盘避让需在 Android 真机安装 APK 体验确认。

## 5. 后续验证建议

1. 上滑底栏打开快捷记账面板后，分别点击右上角 `+` 新增与长按卡片不动松手进入编辑，确认页面铺满全屏且顶栏、分类网格、横向账户条与计算键盘均与完整「记一笔」一致（仅无转账与日期，备注位为快捷卡片名称）。
2. 在全屏编辑页顶栏或分类列表处于顶部时向下滑动，确认跟手露出下方快捷记账面板，松手后仅收起编辑页、快捷记账面板保持打开不消失。
3. 验证编辑页点击保存、删除、左上角关闭及系统返回键后均正确回到快捷记账面板并实时刷新卡片数据。
