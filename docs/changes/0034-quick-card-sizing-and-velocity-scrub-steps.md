# 0034 - v1.3.0 统一快捷卡片与添加快捷尺寸并升级长按调金额五档速度自适应步进

- **状态**：已执行
- **影响范围**：`src/features/quick-record/scrub-rules.ts`、`src/features/quick-record/scrub-rules.test.ts`、`src/features/quick-record/components/QuickRecordSheet.tsx`、`src/features/quick-record/components/QuickRecordTile.tsx`、`src/features/quick-record/components/QuickScrubOverlay.tsx`、版本与文档
- **生效版本**：v1.3.0（Android `versionCode: 28`）
- **前置文档**：[0033-fix-expanded-bottom-sheet-swipe-down.md](0033-fix-expanded-bottom-sheet-swipe-down.md)

## 1. 背景

基于 `v1.2.1` 真机快捷记账面板体验反馈，完成两项布局与微调交互升级：

1. **快捷卡片与「添加快捷」卡片尺寸不一致**：当同一行同时出现快捷卡片与「添加快捷」虚线卡（或空白占位）时，由于 `QuickRecordTile` 根节点直接返回 RNGH v3 `<GestureDetector>`（内置 `display: 'contents'`），而「添加快捷」为普通 `<Pressable style={{ flex: 1 }}>`，导致 Yoga 未将两格按 50% / 50% 均分，快捷卡缩窄、「添加快捷」变宽且列中缝错乱。
2. **长按上下滑调金额步进不够灵活**：原步进仅按起手金额固定为整数元档位（起步 1 元且下限锁死 1.00 元），无法精细调出分/角金额，也无法随滑动快慢动态切换精调与快调节奏。

## 2. 方案

### 2.1 统一等宽等高网格槽位

- 在 [QuickRecordTile.tsx](../../src/features/quick-record/components/QuickRecordTile.tsx) 导出单一高度常量 `QUICK_TILE_HEIGHT = 88`，并将 `tileWrap`、`quickTile`、`undoTile` 统一改为 `width: '100%', height: '100%'` 完整填满父级槽位。
- 在 [QuickRecordSheet.tsx](../../src/features/quick-record/components/QuickRecordSheet.tsx) 中，每行所有格位（快捷卡片、添加快捷卡片、空白占位）均包裹在同一纯容器 `gridCell`（`flex: 1, minWidth: 0, height: QUICK_TILE_HEIGHT`）内，`addTile` 同步改为 `width: '100%', height: '100%'`，彻底隔绝 `<GestureDetector>` 的 `display: 'contents'` 对 Flex 列宽分配的干扰；同时在长按放大微调时提升所在行与格的 `zIndex` 防止相邻卡片遮挡。

### 2.2 五档速度自适应步进调金额

- 在 [scrub-rules.ts](../../src/features/quick-record/scrub-rules.ts) 重构金额微调引擎（配套 [scrub-rules.test.ts](../../src/features/quick-record/scrub-rules.test.ts)）：
  - **五档分级**：`AMOUNT_SCRUB_STEPS_CENTS = [1, 5, 10, 50, 100]`（对应 **`¥0.01`、`¥0.05`、`¥0.10`、`¥0.50`、`¥1.00`**），最低金额下限由 `100` 分下调至 `1` 分（`¥0.01`）。
  - **速度映射与滞回防抖**（`resolveAmountScrubStepBySpeed`）：升档阈值 `[55, 130, 250, 450]` dp/s，降档采用 `0.85×` 滞回，避免临界速度附近档位闪烁。
  - **增量积分会话与网格对齐**（`createAmountScrubSession` / `advanceAmountScrubSession` / `stepAmountCentsOnGrid`）：基于增量像素积分 + 速度低通平滑（EMA）推进，高档位首步顺向对齐整倍落点；记录 `lastDirection` 精确检测方向反转，反手微调瞬间清空残留位移并重置速度平滑，确保快滑切慢滑绝不回跳、反手精调即刻跟手、触底/触顶不堆积虚空位移。
- 在 [QuickRecordTile.tsx](../../src/features/quick-record/components/QuickRecordTile.tsx) 与 [QuickScrubOverlay.tsx](../../src/features/quick-record/components/QuickScrubOverlay.tsx) 中将实时 `stepCents` 透传至顶层半透明悬浮 HUD，实时展示当前生效档位（`步进 ¥0.01` ~ `步进 ¥1.00`）与简短操作提示「快滑大步 · 慢滑精调 · 松手保存」。

## 3. 实施（改动文件清单）

- 修改文件：
  - [src/features/quick-record/scrub-rules.ts](../../src/features/quick-record/scrub-rules.ts)、[src/features/quick-record/scrub-rules.test.ts](../../src/features/quick-record/scrub-rules.test.ts)
  - [src/features/quick-record/components/QuickRecordSheet.tsx](../../src/features/quick-record/components/QuickRecordSheet.tsx)、[src/features/quick-record/components/QuickRecordTile.tsx](../../src/features/quick-record/components/QuickRecordTile.tsx)、[src/features/quick-record/components/QuickScrubOverlay.tsx](../../src/features/quick-record/components/QuickScrubOverlay.tsx)
  - [package.json](../../package.json)、[app.json](../../app.json)、[CHANGELOG.md](../../CHANGELOG.md)、[docs/architecture/overview.md](../../docs/architecture/overview.md)

## 4. 执行验证记录

- **执行环境**：Windows 11，Bun 1.4.5，Node.js 26，Android SDK Build-Tools 37.0.0，Android Studio JBR 21
- **质量门禁命令**：`bun run verify`
- **质量门禁输出**：
  - `node scripts/check-version.mjs`：`版本校验通过：v1.3.0`
  - `tsc --noEmit`：0 错误
  - `eslint .`：0 错误 0 警告
  - `vitest run`：**21 passed (21)，80 passed (80)**（362ms，完整覆盖五档速度映射、降档滞回、网格对齐、增量快转慢防回跳与反手精调）
- **APK 构建命令**：`bun x expo prebuild --platform android --no-install && bun run build:apk`
- **APK 校验结果**：
  - 产物路径：`android/app/build/outputs/apk/release/app-release.apk`（60,055,826 字节 / 57.27 MB）
  - `aapt2 dump badging`：`package='com.keepaccounts.app'`、`versionCode='28'`、`versionName='1.3.0'`、`application-label='ZeroTally'`、`targetSdkVersion='36'`、`native-code='arm64-v8a' 'x86_64'`
  - `apksigner verify --verbose`：`Verifies`（APK Signature Scheme v2 = true，signers = 1）
  - SHA-256：`2E3C2D008CF46F474FC11F7C3BBE13A70FD05720F6193AC3FE3DBB1B361D9C6C`
- **验证结论**：通过。
- **已知限制**：不同手机屏幕刷新率下的五档速度手感阈值及卡片等宽视觉效果需在 Android 真机安装 APK 实测确认。

## 5. 后续验证建议

1. 打开快捷记账面板（含 1 张、3 张、5 张及跨页场景），检查快捷卡片与「添加快捷」虚线卡宽度、高度与各行中缝完全垂直对齐。
2. 长按任意快捷卡片上下滑动：极慢滑动验证 `步进 ¥0.01` 逐分微调（含调至 `¥0.01`）；加快速度验证 HUD 胶囊依次切换 `¥0.05 / ¥0.10 / ¥0.50 / ¥1.00` 大步增减；快滑后放慢或反手微调验证金额不回跳且精准落点。
