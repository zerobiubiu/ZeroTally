# 0022 全应用底部半屏弹窗统一重构为真实可拖拽 BottomSheet（支持下滑关闭与详情两段全屏展开）

- **状态**：已执行
- **影响范围**：`src/shared/ui/BottomSheet.tsx`、`src/shared/ui/bottom-sheet-rules.ts`、`src/shared/ui/bottom-sheet-rules.test.ts`、`src/shared/ui/ActionSheet.tsx`、`src/features/transactions/components/TransactionDetailSheet.tsx`、`RefundSheet.tsx`、`DatePickerSheet.tsx`、`PeriodPickerSheet.tsx`、`AccountPickerSheet.tsx`、版本清单、架构文档与变更日志
- **生效版本**：v0.9.0（Android `versionCode: 16`）
- **前置文档**：[0017-full-ui-consistency-audit-and-app-name-cleanup.md](0017-full-ui-consistency-audit-and-app-name-cleanup.md)、[0021-account-strip-edge-fade-mask.md](0021-account-strip-edge-fade-mask.md)

## 背景

全仓此前共有 6 个底部弹出半屏窗口（`ActionSheet`、`TransactionDetailSheet`、`RefundSheet`、`DatePickerSheet`、`PeriodPickerSheet`、`AccountPickerSheet`），顶部中间均绘制了指示横条（`handle`），但实际上均不响应向下拖动收起，且无法拖动调整为全屏展开态，形成了误导用户的“假拖拽暗示（false affordance）”。本次将全仓底部半屏弹窗统一收口至新增的通用可拖拽容器 `BottomSheet`，使顶部抓手条与物理手势完全名副其实。

## 方案

1. **通用可拖拽底部半屏基座（`src/shared/ui/BottomSheet.tsx` + `bottom-sheet-rules.ts`）**：
   - 全链路采用 `Animated`（`useNativeDriver: true`）GPU 合成动画与 `GestureHandlerRootView` + RNGH `usePanGesture`，支持平滑上滑进场、遮罩随下拉位移线性同步淡出、上拉渐进橡皮筋阻尼（配底部同色垫底防上拉露缝）及关闭后彻底卸载 `<Modal>`。
   - 抽离纯函数模块 `bottom-sheet-rules.ts`（`clampBottomSheetDragOffset` 与 `resolveBottomSheetSnapTarget`）并通过 Vitest 单元测试验证单段关闭、两段吸附与快甩速度阈值。
   - 通过 React 19 `ref`（`useImperativeHandle` 暴露 `BottomSheetHandle.dismiss / toggleExpanded`）控制平滑退场后再执行后续动作，零 `react-hooks/refs` 隐患。
2. **全仓 6 个底部半屏弹窗统一接入**：
   - **非竖向滚动弹窗**（`ActionSheet`、`DatePickerSheet`、`PeriodPickerSheet`）：整个面板均支持向下滑动收起；外层下滑手势与日历/年份左右翻页手势通过 `failOffsetX: [-14, 14]` / `failOffsetY: [-18, 18]` 物理正交，互不干扰。
   - **账目详情半屏窗（`TransactionDetailSheet`）**：启用两段式吸附（`expandable`，默认 `56%` 半屏 ⇄ `~88%` 近全屏展开 ⇄ 下滑关闭）；将头部标题栏与金额主视觉置于顶部宽大拖拽热区，支持上拉或轻点顶部横条切换半屏与全屏；底部「修改 / 退款 / 复制 / 删除」固定操作栏通过 `translateY` GPU 反向插值在半屏与全屏切换期间始终贴紧屏底，向下滑关时严丝合缝同步滑出；半屏态自动为内部 `ScrollView` 追加底部滚动留白确保内容完整可读。
   - **含竖向滚动/表单弹窗**（`RefundSheet`、`AccountPickerSheet`）：顶部抓手与标题栏随时可跟手下拉关闭；`RefundSheet` 开启 `avoidKeyboard` 并在开始下拉时自动收起软键盘，同时将内部 `DatePickerSheet` 移至平级兄弟节点避免 Android 嵌套 `Modal`。

## 实施（改动文件清单）

- 新增：`src/shared/ui/BottomSheet.tsx`、`src/shared/ui/bottom-sheet-rules.ts`、`src/shared/ui/bottom-sheet-rules.test.ts`。
- 修改：`src/shared/ui/ActionSheet.tsx`、`src/features/transactions/components/TransactionDetailSheet.tsx`、`src/features/transactions/components/RefundSheet.tsx`、`src/features/transactions/components/DatePickerSheet.tsx`、`src/features/transactions/components/PeriodPickerSheet.tsx`、`src/features/transactions/components/AccountPickerSheet.tsx`。
- 版本与文档：`package.json`、`app.json`、`src/features/settings/components/SettingsPanel.tsx`、`CHANGELOG.md`、`docs/architecture/overview.md`、`docs/changes/0022-draggable-bottom-sheet.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows（PowerShell），Bun + TypeScript 6 + ESLint 9 + Vitest 5 + Gradle 9.4.1 / Android Build Tools 37.0.0
- **静态与单测命令**：`bun run verify` + 全仓 `<Modal` / `handleWrap` 正则核查
  - `node scripts/check-version.mjs`：`版本校验通过：v0.9.0`
  - `tsc --noEmit`：0 错误退出
  - `eslint .`：0 错误、0 警告退出
  - `vitest run`：`Test Files 16 passed (16)`，`Tests 61 passed (61)`（278ms，含新增 3 项 `bottom-sheet-rules` 单测）
  - 静态假抓手审计：全仓仅 `BottomSheet.tsx` 一处 `handleWrap`，`<Modal` 仅余 `BottomSheet.tsx` 与 `ConfirmDialog.tsx` 两处统一原语
- **Release APK 构建与校验**：`bun x expo prebuild --platform android --no-install && bun run build:apk`
  - 产物：`android/app/build/outputs/apk/release/app-release.apk`（`56.31 MB`，`59,049,182` 字节）
  - `aapt2 dump badging`：`package='com.keepaccounts.app'`、`versionCode='16'`、`versionName='0.9.0'`、`application-label='ZeroTally'`、`native-code='arm64-v8a' 'x86_64'`
  - `apksigner verify --verbose`：`Verifies`（APK Signature Scheme v2 = `true`，1 signer）
  - SHA-256：`8A81B8553ED39B19DA86691FE7CE83385BC0C76FCD469C56ABBDDF85DEC1C559`
- **验证结论**：通过。
- **已知限制**：尚未在真机安装实测快速连续手势切换与不同屏高设备上的视觉手感。

## 后续验证建议

- 安装 `v0.9.0` APK 到真机核验：
  1. 在明细页点击一条账目展开详情半屏窗：向上拖顶部抓手/金额区（或轻点顶部横条）平滑展开至近全屏且底部「修改/退款/复制/删除」始终贴底不跳动，向下拖回半屏或大力下滑一步关闭；
  2. 打开日历（`DatePickerSheet`）与周期选择（`PeriodPickerSheet`）：左右滑动顺畅翻月/翻年，向下滑动顺畅跟手关闭，两种方向互不打架；
  3. 打开退款弹窗（`RefundSheet`）与设置抽屉导出菜单（`ActionSheet`）：均可跟手下拉关闭，退款弹窗拉动时自动收起软键盘。
