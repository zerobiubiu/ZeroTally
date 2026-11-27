# 0031 - v1.1.5 精简明细单日收支统计口径并支持「全部」模式显示年份

- **状态**：已执行
- **影响范围**：`src/features/transactions/rules.ts`、`src/features/transactions/types.ts`、`src/shared/date/date.ts`、`app/(tabs)/index.tsx`、版本与文档
- **生效版本**：v1.1.5（Android `versionCode: 25`）
- **前置文档**：[0030-polish-segmented-alignment-and-quick-cards.md](0030-polish-segmented-alignment-and-quick-cards.md)

## 1. 背景

基于 `v1.1.4` 真机明细页使用反馈，优化两处日期与收支展示细节：

1. **单日收支信息精简**：明细按日分组标题栏原先在当日退款超过支出时会展示「退 ¥X.XX」，日常查看不够直观；单日小计仅需展示「支」与「收」，当日退款归入当日「收」小计，月度/年度/全部总览卡及其他账务口径保持不变。
2. **「全部」模式区分跨年日期**：「按月」「按年」模式顶部总览卡已明确标示年份，但「全部」模式汇总跨年历史明细，若日分组仅显示「11月20日 周四」会造成不同年份账目混淆，需要附带完整年份。

## 2. 方案

### 2.1 单日收支统计归并退款至当日收入

- 在 [rules.ts](../../src/features/transactions/rules.ts) 的 `groupTransactionsByDay` 中调整 `refund` 累加逻辑：不再扣减 `section.expenseCents`，改为累加至 `section.incomeCents`（并保留 `section.refundCents` 字段兼容）；`computeMonthlySummary` 与账务分析逻辑完全不变。
- 在 [app/(tabs)/index.tsx](../../app/(tabs)/index.tsx) 移除单日标题栏 `section.expenseCents < 0` 时渲染「退」的分支，仅按 `> 0` 展示「支」与「收」。
- 在 [rules.test.ts](../../src/features/transactions/rules.test.ts) 新增回归测试，同时验证单日退款归入收入（含纯退款日）以及月度净支出抵扣口径不变。

### 2.2 「全部」模式日分组标题显示年份

- 在 [date.ts](../../src/shared/date/date.ts) 为 `formatDaySectionTitle` 扩展可选参数 `options?: { showYear?: boolean }`：`showYear` 为 `true` 时输出 `YYYY年M月D日 周X`（含「今天 / 昨天」后缀），默认保持原 `M月D日 周X` 格式不变，并在 [date.test.ts](../../src/shared/date/date.test.ts) 补齐跨年与今日用例。
- 在 [app/(tabs)/index.tsx](../../app/(tabs)/index.tsx) 传入 `{ showYear: periodMode === 'all' }`，使「按月」「按年」维持原格式，「全部」模式自动展示完整年份，并补充 `flexShrink: 1`、`numberOfLines={1}` 与 `gap: 8` 防止与右侧金额挤压。

## 3. 实施（改动文件清单）

- 修改文件：
  - [src/features/transactions/rules.ts](../../src/features/transactions/rules.ts)、[src/features/transactions/types.ts](../../src/features/transactions/types.ts)、[src/features/transactions/rules.test.ts](../../src/features/transactions/rules.test.ts)
  - [src/shared/date/date.ts](../../src/shared/date/date.ts)、[src/shared/date/date.test.ts](../../src/shared/date/date.test.ts)
  - [app/(tabs)/index.tsx](../../app/(tabs)/index.tsx)
  - [package.json](../../package.json)、[app.json](../../app.json)、[CHANGELOG.md](../../CHANGELOG.md)、[docs/architecture/overview.md](../../docs/architecture/overview.md)

## 4. 执行验证记录

- **执行环境**：Windows 11，Bun 1.4.5，Node.js 26，Android SDK Build-Tools 37.0.0，Android Studio JBR 21
- **质量门禁命令**：`bun run verify`
- **质量门禁输出**：
  - `node scripts/check-version.mjs`：`版本校验通过：v1.1.5`
  - `tsc --noEmit`：0 错误
  - `eslint .`：0 错误 0 警告
  - `vitest run`：**21 passed (21)，76 passed (76)**（389ms，含单日退款归入收入与 `showYear` 格式化单测）
- **APK 构建命令**：`bun x expo prebuild --platform android --no-install && bun run build:apk`
- **APK 校验结果**：
  - 产物路径：`android/app/build/outputs/apk/release/app-release.apk`（60,049,554 字节 / 57.27 MB）
  - `aapt2 dump badging`：`package='com.keepaccounts.app'`、`versionCode='25'`、`versionName='1.1.5'`、`application-label='ZeroTally'`、`minSdkVersion='24'`、`targetSdkVersion='36'`、`native-code='arm64-v8a' 'x86_64'`
  - `apksigner verify --verbose`：`Verifies`（APK Signature Scheme v2 = true，signers = 1）
  - SHA-256：`2B62F8B4EBCE57E7812803EF98CF8444FCAB7F4794F9A78270BCA6634889A127`
- **验证结论**：通过。
- **已知限制**：跨年明细在「全部」模式下的实际展示宽度与退款日小计视觉效果需在真机安装 APK 确认。

## 5. 后续验证建议

1. 在含退款的日期检查明细页单日标题栏：确认不再出现「退」，退款金额计入当日「收」，当日「支」为当日支出原额；同时核对顶部总览卡净支出与结余仍保持原抵扣口径不变。
2. 依次切换「按月」「按年」「全部」模式：确认前两者维持「11月20日 周四」格式，切换至「全部」时自动展示完整年份（如「2025年11月20日 周四」）。
