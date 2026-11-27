# 0029 - v1.1.3 修复快捷记账卡片新增/编辑时横向账户条塌陷不可选问题

- **状态**：已执行
- **影响范围**：`src/features/transactions/components/RecordKeypad.tsx`、版本与文档
- **生效版本**：v1.1.3（Android `versionCode: 23`）
- **前置文档**：[0028-fullscreen-quick-template-composer.md](0028-fullscreen-quick-template-composer.md)

## 1. 背景

在 `v1.1.2` 真机验证中，打开快捷记账卡片的新增或编辑页时，底部账户选择条消失，无法切换动账账户。

## 2. 方案

- 根因定位：在 [RecordKeypad.tsx](../../src/features/transactions/components/RecordKeypad.tsx) 中，完整「记一笔」页依赖右侧 `dateCard`（`minHeight: 46`）撑开 `selectorStrip` 行高；当快捷卡片编辑页传入 `hideDateButton: true` 移除右侧日期按钮后，左侧横向账户容器 `accountsScrollWrap` 无显式高度且其子级横向 `ScrollView` 设置了 `flex: 1`（`flexBasis: 0`），导致 Yoga 布局将其高度塌陷为 `0px`。
- 修复方式：
  - 为 `accountsScrollWrap` 明确设置 `minHeight: 46` 与 `justifyContent: 'center'`；
  - 将横向 `accountsScroll` 样式调整为 `width: '100%', flexGrow: 0`，使跨轴高度自然由内部账户卡片（`minHeight: 46`）决定；
  - 将转账模式空占位改用独立样式 `transferFallbackSpacer`（`flex: 1`），不影响原有转账与完整记一笔布局。

## 3. 实施（改动文件清单）

- 修改文件：
  - [src/features/transactions/components/RecordKeypad.tsx](../../src/features/transactions/components/RecordKeypad.tsx)
  - [package.json](../../package.json)、[app.json](../../app.json)、[CHANGELOG.md](../../CHANGELOG.md)

## 4. 执行验证记录

- **执行环境**：Windows 11，Bun 1.4.5，Node.js 26，Android SDK Build-Tools 37.0.0，Android Studio JBR 21
- **质量门禁命令**：`bun run verify`
- **质量门禁输出**：
  - `node scripts/check-version.mjs`：`版本校验通过：v1.1.3`
  - `tsc --noEmit`：0 错误
  - `eslint .`：0 错误 0 警告
  - `vitest run`：**21 passed (21)，74 passed (74)**（382ms）
- **APK 构建命令**：`bun x expo prebuild --platform android --no-install && bun run build:apk`
- **APK 校验结果**：
  - 产物路径：`android/app/build/outputs/apk/release/app-release.apk`（60,048,182 字节 / 57.27 MB）
  - `aapt2 dump badging`：`package='com.keepaccounts.app'`、`versionCode='23'`、`versionName='1.1.3'`、`application-label='ZeroTally'`、`minSdkVersion='24'`、`targetSdkVersion='36'`、`native-code='arm64-v8a' 'x86_64'`
  - `apksigner verify --verbose`：`Verifies`（APK Signature Scheme v2 = true，signers = 1）
  - SHA-256：`CDCF49D998860168C4D690EE171AD5F8C1BE79AF06EBD08138C8F2C55D8D47A6`
- **验证结论**：通过。
- **已知限制**：真机多账户横向滑动、边缘渐变遮罩及点击选中态需安装 APK 实测确认。

## 5. 后续验证建议

1. 在快捷记账面板点击 `+` 新增或长按现有快捷卡进入全屏编辑页，确认输入栏下方完整展示横向动账账户卡片，支持左右滑动与点击切换，且保存后卡片关联账户正确更新。
2. 顺带确认完整「记一笔」页的账户条与右侧日期按钮对齐关系不受影响。
