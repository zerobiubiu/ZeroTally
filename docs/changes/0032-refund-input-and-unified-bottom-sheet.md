# 0032 - v1.2.0 升级退款输入体验与规则并统一全应用可手势拖拽底部弹窗基座

- **状态**：已执行
- **影响范围**：`src/shared/money/`、`src/shared/ui/BottomSheet.tsx`、`src/shared/ui/bottom-sheet-rules.ts`、`src/shared/ui/ActionSheet.tsx`、`src/features/transactions/`、版本与文档
- **生效版本**：v1.2.0（Android `versionCode: 26`）
- **前置文档**：[0031-ledger-daily-totals-and-all-mode-year.md](0031-ledger-daily-totals-and-all-mode-year.md)

## 1. 背景

基于 `v1.1.5` 真机体验与退款流程反馈，本版本聚焦解决两项交互与工程一致性问题：

1. **退款金额输入繁琐且上限过严**：
   - 原退款页在打开时把默认全额直接填进输入框，想退部分金额必须先手动删除原数字；输入非法小数或前导零时也缺少即时两位小数截断与失焦规整（`.5 → 0.5`、`0001 → 1`、`0.123 → 0.12`）。
   - 领域层强制限制退款不得超过原支出剩余金额，在含运费补贴、差价补偿等多退场景下无法记账。
2. **底部卡片手势与结构碎片化**：
   - 退款卡片不支持上滑展开与下滑收起；账目详情依赖 `dragHandleOnly`，主体滚动区存在拖拽死区。
   - 不支持展开的底部选择弹窗（账户、日期、周期、操作菜单）仍允许向上橡皮筋拉动，且 6 个底部弹窗各自重复手写标题栏、关闭按钮与安全区容器，维护成本高且手感不统一。

## 2. 方案

### 2.1 退款金额占位提示、输入规整与放开上限

- **权威正数金额规整规则**（[money.ts](../../src/shared/money/money.ts)、[money.test.ts](../../src/shared/money/money.test.ts)）：
  - 新增 `truncateExcessDecimalsInput(raw)`：输入期即时删除超过两位小数的尾随数字，不做四舍五入（如 `0.123 → 0.12`）。
  - 新增 `normalizePositiveAmountInput(raw)`：输入结束/提交前校验并规整，留空返回 `{ status: 'empty' }`，自动将 `.5` 补为 `0.5`、将 `0001` 规范为 `1`、截断超出小数并校验严格 `> 0`，非正数或非法字符返回 `{ status: 'invalid' }`。
- **放开退款金额上限**（[service.ts](../../src/features/transactions/service.ts)、[types.ts](../../src/features/transactions/types.ts)、[service.test.ts](../../src/features/transactions/service.test.ts)）：
  - 移除 `createRefundTransaction`、`updateRefundTransaction` 中的剩余可退/可退上限拦截，以及 `updateTransaction` 中支出金额不得小于已退总额的拦截（保留已有退款时禁止变更原支出类型的防孤立约束），只要金额 `> 0` 即可退款并精确联动账户余额与删除回滚。
  - 同步更新 [TransactionRow.tsx](../../src/features/transactions/components/TransactionRow.tsx) 与 [TransactionDetailSheet.tsx](../../src/features/transactions/components/TransactionDetailSheet.tsx)：所有支出均可继续发起退款，超额退款清晰展示「已退 ¥X.XX」及「多退 ¥Y.YY」，等额全退仍保留「已全额退款」提示。
- **占位提示默认金额与一键清空**（[RefundSheet.tsx](../../src/features/transactions/components/RefundSheet.tsx)）：
  - 新建退款默认以浅色占位提示展示剩余全额（编辑退款以占位提示展示原退款金额），输入框初始留空；直接提交即沿用默认金额，需要部分退款或超额退款时直接点击输入即可，输入后显示一键清空按钮随时恢复默认。

### 2.2 全应用统一底部手势卡片基座 `BottomSheet` 升级与 6 处收口

- **防上拉越界纯规则**（[bottom-sheet-rules.ts](../../src/shared/ui/bottom-sheet-rules.ts)、[bottom-sheet-rules.test.ts](../../src/shared/ui/bottom-sheet-rules.test.ts)）：
  - 强化 `clampBottomSheetDragOffset`：当 `maxOverdragUp <= 0` 时，向上拖拽偏移严格钳制为 `0`，确保单段不可展开卡片无上拉位移。
- **统一基座能力封装**（[BottomSheet.tsx](../../src/shared/ui/BottomSheet.tsx)）：
  - 内置标准标题栏（`title`、`subtitle`、`showCloseButton`），消除业务侧重复模板。
  - 内置滚动手势协同（`scrollable`、`contentContainerStyle`、`keyboardShouldPersistTaps`、`scrollMaxHeight`），利用 RNGH `useSimultaneousGestures(bodyPanGesture, nativeScrollGesture)` 实现列表滚至顶部时无缝衔接全区下滑收起或回半屏。
  - 支持 `avoidKeyboard && expandable` 时软键盘弹出自动展开至全屏，底部 `footer` 主操作栏始终贴底防遮挡。
  - `expandable={false}` 时严格配置 `activeOffsetY: 10` 与 `maxOverdragUp: 0`，仅响应下滑收起，屏蔽上滑展开与上拉越界。
- **全仓 6 个底部弹窗全面收口**：
  - **两段展开卡片**：[RefundSheet.tsx](../../src/features/transactions/components/RefundSheet.tsx)（`expandable`、`collapsedRatio={0.68}`、`scrollable`、`avoidKeyboard`、贴底主按钮 `footer`）与 [TransactionDetailSheet.tsx](../../src/features/transactions/components/TransactionDetailSheet.tsx)（切换内置 `scrollable`，移除 `dragHandleOnly` 拖拽死区）。
  - **单段不可展开卡片（仅下滑收起，禁上滑）**：[AccountPickerSheet.tsx](../../src/features/transactions/components/AccountPickerSheet.tsx)（内置 `title` + `scrollable` + `scrollMaxHeight={360}`）、[DatePickerSheet.tsx](../../src/features/transactions/components/DatePickerSheet.tsx)、[PeriodPickerSheet.tsx](../../src/features/transactions/components/PeriodPickerSheet.tsx) 与 [ActionSheet.tsx](../../src/shared/ui/ActionSheet.tsx)（均移除手写顶栏，统一接入标准 `title / subtitle`）。

## 3. 实施（改动文件清单）

- 修改文件：
  - [src/shared/money/money.ts](../../src/shared/money/money.ts)、[src/shared/money/money.test.ts](../../src/shared/money/money.test.ts)
  - [src/shared/ui/bottom-sheet-rules.ts](../../src/shared/ui/bottom-sheet-rules.ts)、[src/shared/ui/bottom-sheet-rules.test.ts](../../src/shared/ui/bottom-sheet-rules.test.ts)、[src/shared/ui/BottomSheet.tsx](../../src/shared/ui/BottomSheet.tsx)、[src/shared/ui/ActionSheet.tsx](../../src/shared/ui/ActionSheet.tsx)
  - [src/features/transactions/service.ts](../../src/features/transactions/service.ts)、[src/features/transactions/service.test.ts](../../src/features/transactions/service.test.ts)、[src/features/transactions/types.ts](../../src/features/transactions/types.ts)
  - [src/features/transactions/components/RefundSheet.tsx](../../src/features/transactions/components/RefundSheet.tsx)、[src/features/transactions/components/TransactionDetailSheet.tsx](../../src/features/transactions/components/TransactionDetailSheet.tsx)、[src/features/transactions/components/TransactionRow.tsx](../../src/features/transactions/components/TransactionRow.tsx)
  - [src/features/transactions/components/AccountPickerSheet.tsx](../../src/features/transactions/components/AccountPickerSheet.tsx)、[src/features/transactions/components/DatePickerSheet.tsx](../../src/features/transactions/components/DatePickerSheet.tsx)、[src/features/transactions/components/PeriodPickerSheet.tsx](../../src/features/transactions/components/PeriodPickerSheet.tsx)
  - [package.json](../../package.json)、[app.json](../../app.json)、[CHANGELOG.md](../../CHANGELOG.md)、[docs/architecture/overview.md](../../docs/architecture/overview.md)

## 4. 执行验证记录

- **执行环境**：Windows 11，Bun 1.4.5，Node.js 26，Android SDK Build-Tools 37.0.0，Android Studio JBR 21
- **质量门禁命令**：`bun run verify`
- **质量门禁输出**：
  - `node scripts/check-version.mjs`：`版本校验通过：v1.2.0`
  - `tsc --noEmit`：0 错误
  - `eslint .`：0 错误 0 警告
  - `vitest run`：**21 passed (21)，77 passed (77)**（391ms，覆盖正数金额截断规整、放开超额退款及回滚、不可展开弹窗防上拉偏移钳制）
- **APK 构建命令**：`bun x expo prebuild --platform android --no-install && bun run build:apk`
- **APK 校验结果**：
  - 产物路径：`android/app/build/outputs/apk/release/app-release.apk`（60,052,186 字节 / 57.27 MB）
  - `aapt2 dump badging`：`package='com.keepaccounts.app'`、`versionCode='26'`、`versionName='1.2.0'`、`application-label='ZeroTally'`、`targetSdkVersion='36'`、`native-code='arm64-v8a' 'x86_64'`
  - `apksigner verify --verbose`：`Verifies`（APK Signature Scheme v2 = true，signers = 1）
  - SHA-256：`9B98B44E4ECC31CFE1FBFC884531849242A0BC2442992F58D9419EEC39F44A13`
- **验证结论**：通过。
- **已知限制**：`BottomSheet` 两段展开、滚动手势协同及软键盘顶起回弹手感需在 Android 真机安装 APK 实测确认。

## 5. 后续验证建议

1. 在退款弹窗中分别测试：不输入直接点击「确认退款」（默认全额退）、直接键入 `.5` / `0001` / `0.123`（验证自动规整为 `0.5` / `1` / `0.12` 且不四舍五入）、输入 `0` 或负数（拦截提示）、输入超过原支出金额（成功退款并在明细/详情页显示已退及多退标注）、编辑已有退款（默认以原退款额作占位提示）。
2. 在退款弹窗与账目详情中测试全区上滑展开至全屏、列表滚至顶部后下拉回半屏或收起，以及弹出键盘时输入框与底部主按钮不被遮挡。
3. 在账户选择、日期选择、周期选择与操作菜单弹窗中测试向下滑动顺利关闭、向上拖动卡片纹丝不动（不触发上滑展开或橡皮筋拉起）。
