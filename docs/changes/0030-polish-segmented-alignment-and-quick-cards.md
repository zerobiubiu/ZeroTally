# 0030 - v1.1.4 修复全应用分段滑块对齐偏移并重构快捷记账 2×3 宽卡布局

- **状态**：已执行
- **影响范围**：`src/shared/ui/SlidingSegmentedControl.tsx`、`src/shared/ui/sliding-segmented-rules.ts`、`src/features/quick-record/components/QuickRecordSheet.tsx`、`src/features/quick-record/components/QuickRecordTile.tsx`、版本与文档
- **生效版本**：v1.1.4（Android `versionCode: 24`）
- **前置文档**：[0029-fix-quick-composer-account-strip.md](0029-fix-quick-composer-account-strip.md)

## 1. 背景

基于 `v1.1.3` 真机视觉截图反馈，两处高频组件存在排布与对齐瑕疵：

1. **通用滑动分段控件选中框偏下**：轨道内选中胶囊在顶部留白约 3px、底部仅约 1px，在明细顶栏、设置外观、分类收支、账务分析与账户表单等全部调用处均有同样偏下观感。
2. **快捷记账卡片 3 列横向排列过于紧凑**：3 列 × 2 行窄方格内纵向塞入 4 层元素（图标 / 名称 / 金额 / 账户），上下紧贴卡片边框，长名称与大金额空间局促。

## 2. 方案

### 2.1 分段滑块像素级对称居中修复（全应用 6 处同步生效）

- 根因定位：外层轨道带 `1px` 四周描边（`borderWidth`），原滑块高度（`height - padding * 2`）与内宽（`layout.width - padding * 2`）漏扣双侧描边（`2px`），致使绝对定位滑块在 padding-box 内上留白 `3px`、下留白仅 `1px`（末格右侧亦溢出 `2px`），叠加 Android 单向下投影（`elevation: 1`）与默认文字内边距进一步放大偏下观感。
- 在 [sliding-segmented-rules.ts](../../src/shared/ui/sliding-segmented-rules.ts) 新增纯几何计算函数 `computeSegmentedTrackMetrics`（严格扣除双侧 `borderWidth + trackPadding`）并在 [sliding-segmented-rules.test.ts](../../src/shared/ui/sliding-segmented-rules.test.ts) 补齐单测。
- 在 [SlidingSegmentedControl.tsx](../../src/shared/ui/SlidingSegmentedControl.tsx) 中将滑块改为 `top: TRACK_PADDING` + `bottom: TRACK_PADDING` 同距锚定，用四周极细均匀描边替代单向下投影；选项容器改为 `height: '100%'` 并关闭 Android `includeFontPadding`，实现四边严格等距与文字居中。

### 2.2 快捷记账卡片升级为舒展 2×3 宽卡布局

- 在 [QuickRecordSheet.tsx](../../src/features/quick-record/components/QuickRecordSheet.tsx) 将网格由 3 列 × 2 行重构为 **2 列 × 3 行（保持每页 6 张容量不减）**，单卡宽度提升 50%+，跳过空白尾行避免虚空占位，半屏高度同步微调至 `420..64%` 留足呼吸感。
- 在 [QuickRecordTile.tsx](../../src/features/quick-record/components/QuickRecordTile.tsx) 重构单卡为统一 `88px` 高、四周充裕内边距的两行宽卡：
  - 常规卡片：上行「`34×34` 圆形分类图标 + 左对齐卡片名称」，下行「左对齐 16px 等宽收支金额 + 右对齐弱化动账账户」；
  - 3 秒圆环倒计时撤销卡与「+ 添加快捷」虚线卡同步升级为舒展横向排布。

## 3. 实施（改动文件清单）

- 修改文件：
  - [src/shared/ui/sliding-segmented-rules.ts](../../src/shared/ui/sliding-segmented-rules.ts)、[src/shared/ui/sliding-segmented-rules.test.ts](../../src/shared/ui/sliding-segmented-rules.test.ts)、[src/shared/ui/SlidingSegmentedControl.tsx](../../src/shared/ui/SlidingSegmentedControl.tsx)
  - [src/features/quick-record/components/QuickRecordSheet.tsx](../../src/features/quick-record/components/QuickRecordSheet.tsx)、[src/features/quick-record/components/QuickRecordTile.tsx](../../src/features/quick-record/components/QuickRecordTile.tsx)
  - [package.json](../../package.json)、[app.json](../../app.json)、[CHANGELOG.md](../../CHANGELOG.md)

## 4. 执行验证记录

- **执行环境**：Windows 11，Bun 1.4.5，Node.js 26，Android SDK Build-Tools 37.0.0，Android Studio JBR 21
- **质量门禁命令**：`bun run verify`
- **质量门禁输出**：
  - `node scripts/check-version.mjs`：`版本校验通过：v1.1.4`
  - `tsc --noEmit`：0 错误
  - `eslint .`：0 错误 0 警告
  - `vitest run`：**21 passed (21)，75 passed (75)**（364ms，含新增 `computeSegmentedTrackMetrics` 边界单测）
- **APK 构建命令**：`bun x expo prebuild --platform android --no-install && bun run build:apk`
- **APK 校验结果**：
  - 产物路径：`android/app/build/outputs/apk/release/app-release.apk`（60,049,526 字节 / 57.27 MB）
  - `aapt2 dump badging`：`package='com.keepaccounts.app'`、`versionCode='24'`、`versionName='1.1.4'`、`application-label='ZeroTally'`、`minSdkVersion='24'`、`targetSdkVersion='36'`、`native-code='arm64-v8a' 'x86_64'`
  - `apksigner verify --verbose`：`Verifies`（APK Signature Scheme v2 = true，signers = 1）
  - SHA-256：`7428501FBB291D37A7948771B96D4C56EF766DC407D795F8BC1489542A8709A2`
- **验证结论**：通过。
- **已知限制**：分段滑块四边留白对称度与 2×3 宽卡在多屏宽机型的观感需真机安装 APK 实测确认。

## 5. 后续验证建议

1. 依次查看明细顶栏「按月/按年/全部」、设置抽屉「系统/浅色/深色」、分类管理、账务分析与账户表单 6 处分段控件，确认选中胶囊上下左右四边留白严格对称、文字居中。
2. 上滑底栏拉起快捷记账半屏窗，确认 2×3 宽卡排布舒展不拥挤，检查常规态、3 秒圆环撤销态、长按微调态及「+ 添加快捷」虚线卡的留白与多页横滑体验。
