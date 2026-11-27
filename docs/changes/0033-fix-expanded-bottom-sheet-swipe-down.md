# 0033 - v1.2.1 修复底部手势卡片上滑展开后下滑收起失效的问题

- **状态**：已执行
- **影响范围**：`src/shared/ui/BottomSheet.tsx`、`src/shared/ui/bottom-sheet-rules.ts`、`src/shared/ui/bottom-sheet-rules.test.ts`、版本与文档
- **生效版本**：v1.2.1（Android `versionCode: 27`）
- **前置文档**：[0032-refund-input-and-unified-bottom-sheet.md](0032-refund-input-and-unified-bottom-sheet.md)

## 1. 背景

在 `v1.2.0` 真机实测中，两段可展开底部手势卡片（如退款卡片、账目详情）上滑展开至全屏后，在卡片内容区向下滑动无法回落半屏或收起；排查源码后同时确认单段滚动卡片（如账户选择）内容区下滑收起也命中同一底层缺陷。

### 根因定位

1. **RNGH v3 `PanGestureHandler` 激活重置陷阱**：Android 原生 `PanGestureHandler.activate()` 在派发 `STATE_ACTIVE`（即 JS 回调 `onActivate`）前先执行 `resetProgress()`，将起点同步至当前手指坐标，因此 `onActivate(event)` 收到的 `event.translationY` **恒等于 `0`**。`v1.2.0` 在 `BottomSheet.tsx` 展开态与单段滚动态的 `onActivate` 中写了 `if (event.translationY <= 0 || scrollOffsetYRef.current > 2)`，导致 `0 <= 0` 恒为真，将所有主体区下滑手势全部拦死。
2. **展开态手势方向未单向化与越界拉伸干扰**：展开态 `bodyPanGesture` 仍保持双向 `activeOffsetY: [-12, 12]`，未在原生层屏蔽上滑；内置 `ScrollView` 未关闭顶部越界拉伸（Android 12+ `overScrollMode` stretch），顶部下拉易产生重影和干扰。
3. **进场副作用依赖窗口高度**：进场/退场 `useEffect` 依赖 `expandedHeight / collapsedOffset`，窗口高度微变或软键盘触发尺寸抖动时可能误重置 `expandedRef` 并重播进场动画。

## 2. 方案

1. **抽离滚动区协同手势状态决策纯规则**（[bottom-sheet-rules.ts](../../src/shared/ui/bottom-sheet-rules.ts)、[bottom-sheet-rules.test.ts](../../src/shared/ui/bottom-sheet-rules.test.ts)）：
   - 新增 `resolveBodyPanActivationMode` 与 `resolveBodyPanUpdateDecision`：两段半屏态无冲突时直接进入 `dragging`（双向跟手）；两段展开态与单段滚动态在列表位于顶部（`scrollOffsetY <= 2`）时进入 `pending-down`，由后续 `onUpdate` 首帧位移确认方向（`translationY > 0` 正式接管并收键盘，`translationY < 0` 或列表已滚离顶部立刻释放给 `ScrollView`），并在极快下甩零帧 `onUpdate` 时于 `onDeactivate` 兜底结算。
   - 新增 Vitest 回归测试锁死激活瞬间 `translationY === 0` 及展开态下滑/上滑/非顶部/单段滚动全分支行为。
2. **基座手势单向化与稳定性加固**（[BottomSheet.tsx](../../src/shared/ui/BottomSheet.tsx)）：
   - `bodyPanGesture` 按当前状态动态配置：两段半屏态双向 `activeOffsetY: [-12, 12]`；两段展开态与单段滚动态采用单向 `activeOffsetY: 12` + `failOffsetY: -12`（向上滑原生直接 fail 让给 `ScrollView`）；单段弹窗的 `headerPanGesture` 同步补充 `failOffsetY: -10`。
   - 内置 `ScrollView` 增加 `bounces={false}` 与 `overScrollMode="never"`，消除顶部下拉时的原生拉伸干扰。
   - 进场/退场 `useEffect` 通过 `expandedHeightRef` / `collapsedOffsetRef` 读取最新几何值，不再因窗口高度变化重播进场动画或重置展开态；关闭动画完成后统一复位 `expanded` 与手势状态。

## 3. 实施（改动文件清单）

- 修改文件：
  - [src/shared/ui/bottom-sheet-rules.ts](../../src/shared/ui/bottom-sheet-rules.ts)、[src/shared/ui/bottom-sheet-rules.test.ts](../../src/shared/ui/bottom-sheet-rules.test.ts)
  - [src/shared/ui/BottomSheet.tsx](../../src/shared/ui/BottomSheet.tsx)
  - [package.json](../../package.json)、[app.json](../../app.json)、[CHANGELOG.md](../../CHANGELOG.md)、[docs/architecture/overview.md](../../docs/architecture/overview.md)

## 4. 执行验证记录

- **执行环境**：Windows 11，Bun 1.4.5，Node.js 26，Android SDK Build-Tools 37.0.0，Android Studio JBR 21
- **质量门禁命令**：`bun run verify`
- **质量门禁输出**：
  - `node scripts/check-version.mjs`：`版本校验通过：v1.2.1`
  - `tsc --noEmit`：0 错误
  - `eslint .`：0 错误 0 警告
  - `vitest run`：**21 passed (21)，78 passed (78)**（385ms，新增滚动区协同手势状态决策回归测试全部通过）
- **APK 构建命令**：`bun x expo prebuild --platform android --no-install && bun run build:apk`
- **APK 校验结果**：
  - 产物路径：`android/app/build/outputs/apk/release/app-release.apk`（60,053,662 字节 / 57.27 MB）
  - `aapt2 dump badging`：`package='com.keepaccounts.app'`、`versionCode='27'`、`versionName='1.2.1'`、`application-label='ZeroTally'`、`targetSdkVersion='36'`、`native-code='arm64-v8a' 'x86_64'`
  - `apksigner verify --verbose`：`Verifies`（APK Signature Scheme v2 = true，signers = 1）
  - SHA-256：`5E0A8F5C30D027D4C20475022A136D813A5828D09F77B8D952174376AB31E58E`
- **验证结论**：通过。
- **已知限制**：全屏展开后内容区下滑回半屏/直接关闭、长内容滚动回顶后再下滑以及账户选择列表下滑手感需在 Android 真机安装 APK 实测确认。

## 5. 后续验证建议

1. 打开「记录退款」或「账目详情」卡片：上滑展开至全屏后，直接在卡片主体区域向下滑动，确认可流畅跟手收起回半屏或大力下滑一步关闭。
2. 展开后先向上滚动浏览底部内容，再向下滚动回到列表顶部，再次下滑确认可无缝触发卡片收起且全程无顶部原生拉伸重影。
3. 打开「选择账户」等单段滚动卡片，在列表区向下滑确认可直接关闭，向上拉确认仍保持纹丝不动。
