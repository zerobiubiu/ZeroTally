# 0027 - v1.1.1 修复长按手势误拦截单击、重构顶层半透明微调悬浮 HUD 与设置顶栏关于图标迁移

- **状态**：已执行
- **影响范围**：`app/(tabs)/_layout.tsx`、`app/settings.tsx`、`src/features/quick-record/`、`src/features/settings/`、`src/shared/ui/SlidingSegmentedControl.tsx`、版本与文档
- **生效版本**：v1.1.1（Android `versionCode: 21`）
- **前置文档**：[0026-quick-record-radial-scrub-undo-ring.md](0026-quick-record-radial-scrub-undo-ring.md)

## 1. 背景

基于 `v1.1.0` 真机实测与界面精简反馈，集中解决四项问题与优化：

1. **设置抽屉顶栏精简与「关于」迁移**：移除设置抽屉右上角「×」关闭按钮（已支持左滑、点遮罩与返回键关闭），并将列表中的「关于」移至顶栏右上角，仅保留纯 `i` 图标、不留文字。
2. **修复「+ 记一笔」单击误弹扇形快捷菜单**：长按 `+` 才应出现扇形快捷方式，单击 `+` 必须正常进入完整「记一笔」页面。
3. **修复快捷记账卡片单击误进编辑、3 秒原地撤销失效**：单击快捷卡应轻震动立即入账并原地变身 3 秒倒计时撤销卡（3 秒内再点长震动撤回）；长按快捷卡才应触发上下/左右微调或长按不动松手进入编辑。
4. **长按微调交互升级为最上层半透明悬浮 UI**：移除快捷记账面板内联横条（避免挤压下方卡片跳动），改为独立浮于全屏最上层的半透明悬浮卡片。

## 2. 方案

### 2.1 根因定位与全仓长按拖拽手势修复

- 溯源 `react-native-gesture-handler` Android 原生 `PanGestureHandler.kt`（`onHandle` / `shouldActivate`）：当手势同时配置 `activateAfterLongPress > 0` 与 `minDistance: 0` 时，手指刚落下进入 `STATE_BEGAN` 后，任意 1px 触控微抖都会在长按计时器到期前立刻满足 `distSq >= minDist * minDist`（`>= 0`）从而抢先调用 `activate()`，强制覆盖内部 `Pressable.onPress` 单击事件。
- 将全仓三处长按拖拽手势统一改为 `minDistance: 99999` 配合 `activateAfterLongPress`（`shouldFail()` 仍基于原生 `defaultMinDist` / `scaledTouchSlop`，保证快速划动时正常让位给父级上滑或左右分页手势）：
  - [app/(tabs)/_layout.tsx](../../app/(tabs)/_layout.tsx)：`fabRadialPanGesture`（`activateAfterLongPress: 300`, `minDistance: 99999`），彻底恢复**单击 `+` 进 `/record`、长按 `+` 展扇形、上滑底栏呼快捷记账**。
  - [QuickRecordTile.tsx](../../src/features/quick-record/components/QuickRecordTile.tsx)：`scrubPanGesture`（`activateAfterLongPress: 280`, `minDistance: 99999`），并区分 `onDeactivate`（正常松手提交）与 `onFinalize`（系统取消不误触发编辑/保存），彻底恢复**单击入账/撤销、长按微调/编辑**。
  - [SlidingSegmentedControl.tsx](../../src/shared/ui/SlidingSegmentedControl.tsx)：`slidePanGesture`（`activateAfterLongPress: 160`, `minDistance: 99999`），消除分段控件单击微抖提前激活。

### 2.2 加固快捷卡片 3 秒原地撤销稳定性

- [repository.ts](../../src/features/quick-record/repository.ts)：推荐快捷按钮 ID 由含排名下标的 `rec_${index}_...` 改为业务四元组稳定键 `rec_${row.type}_${row.category_id}_${row.amount_cents}_${row.account_id}`，并在 [service.test.ts](../../src/features/quick-record/service.test.ts) 补齐排名变动后 ID 稳定性的单元测试。
- [QuickRecordSheet.tsx](../../src/features/quick-record/components/QuickRecordSheet.tsx)：点击入账先登记 `undoTimersRef` 再调用 `notifyChange()`，3 秒撤销窗口期间暂缓重排推荐列表（防止目标撤销卡跳离指尖），待倒计时结束或撤回完成后再刷新。
- [QuickRecordTile.tsx](../../src/features/quick-record/components/QuickRecordTile.tsx)：常规态与撤销态始终复用同一 `GestureDetector` 外壳（撤销态时 `enabled: false`）避免原生手势节点销毁重建；倒计时秒数按 `txId` 绑定，重复点击始终从 `3s` 准确起步。

### 2.3 最上层半透明微调悬浮 HUD

- 新增 [QuickScrubOverlay.tsx](../../src/features/quick-record/components/QuickScrubOverlay.tsx)：独立挂载于 [QuickRecordSheet.tsx](../../src/features/quick-record/components/QuickRecordSheet.tsx) 全屏顶层容器（`zIndex: 120`, `elevation: 28`, `pointerEvents="none"`），浮于快捷记账半屏窗正上方且自适应深浅主题半透明磨砂底色与弹簧动效；刚长按激活展示方向速览、上下滑动展示 30px 大号等宽步进金额、左右滑动展示横向高亮账户选择列。
- 移除原面板内联 `scrubHud` 与 `toastBanner` 横条，轻提示胶囊亦迁至顶层悬浮，快捷网格全程零布局跳动。

### 2.4 设置顶栏精简与纯 `i` 图标关于入口

- [SettingsPanel.tsx](../../src/features/settings/components/SettingsPanel.tsx)：移除抽屉顶栏右上角「×」关闭按钮，替换为纯 `i` 图标（`information-circle-outline`）直达 `/about`，并移除列表中「关于」文字条目（列表收敛为：外观 → 分类管理 → 高级设置 → 底部居中版本号）。
- [app/settings.tsx](../../app/settings.tsx)：独立设置页顶栏右侧同步配置纯 `i` 图标直达关于页。

## 3. 实施（改动文件清单）

- 新增文件：[src/features/quick-record/components/QuickScrubOverlay.tsx](../../src/features/quick-record/components/QuickScrubOverlay.tsx)
- 修改文件：
  - [app/(tabs)/_layout.tsx](../../app/(tabs)/_layout.tsx)、[app/settings.tsx](../../app/settings.tsx)
  - [src/features/quick-record/components/QuickRecordTile.tsx](../../src/features/quick-record/components/QuickRecordTile.tsx)、[src/features/quick-record/components/QuickRecordSheet.tsx](../../src/features/quick-record/components/QuickRecordSheet.tsx)
  - [src/features/quick-record/repository.ts](../../src/features/quick-record/repository.ts)、[src/features/quick-record/service.test.ts](../../src/features/quick-record/service.test.ts)
  - [src/features/settings/components/SettingsPanel.tsx](../../src/features/settings/components/SettingsPanel.tsx)、[src/features/settings/components/SettingsDrawer.tsx](../../src/features/settings/components/SettingsDrawer.tsx)
  - [src/shared/ui/SlidingSegmentedControl.tsx](../../src/shared/ui/SlidingSegmentedControl.tsx)
  - [package.json](../../package.json)、[app.json](../../app.json)、[CHANGELOG.md](../../CHANGELOG.md)、[docs/architecture/overview.md](../../docs/architecture/overview.md)

## 4. 执行验证记录

- **执行环境**：Windows 11，Bun 1.4.5，Node.js 26，Android SDK Build-Tools 37.0.0，Android Studio JBR 21
- **质量门禁命令**：`bun run verify`
- **质量门禁输出**：
  - `node scripts/check-version.mjs`：`版本校验通过：v1.1.1`
  - `tsc --noEmit`：0 错误
  - `eslint .`：0 错误 0 警告
  - `vitest run`：**21 passed (21)，74 passed (74)**（376ms，含推荐快捷项排名变化后 ID 稳定性校验）
- **APK 构建命令**：`bun x expo prebuild --platform android --no-install && bun run build:apk`
- **APK 校验结果**：
  - 产物路径：`android/app/build/outputs/apk/release/app-release.apk`（60,043,806 字节 / 57.26 MB）
  - `aapt2 dump badging`：`package='com.keepaccounts.app'`、`versionCode='21'`、`versionName='1.1.1'`、`application-label='ZeroTally'`、`minSdkVersion='24'`、`targetSdkVersion='36'`、`native-code='arm64-v8a' 'x86_64'`
  - `apksigner verify --verbose`：`Verifies`（APK Signature Scheme v2 = true，signers = 1）
  - SHA-256：`DA64A827C5CF3D9EF10A1E8D508790E28FB86896A809F12F3BB3566D8AEB442E`
- **验证结论**：通过。
- **已知限制**：单击/长按分离手感、3 秒原地圆环撤销连贯性及半透明顶层悬浮 HUD 视觉质感需在 Android 真机安装 APK 体验确认。

## 5. 后续验证建议

1. 短按底栏居中 `+` 验证直接滑入完整「记一笔」页；长按 `+`（约 0.3s）触发震动后验证扇形快捷选项绽放与划选松手即刻记账。
2. 上滑底栏打开快捷记账面板：单击任一快捷卡验证轻震动并原地变为 3 秒圆环倒计时撤销卡，3 秒内再次单击触发长震动撤回；长按卡片触发震动后验证最上层半透明悬浮 HUD 浮出（面板卡片不跳动），上下滑调金额、左右滑切账户、长按不动松手进入内嵌编辑。
3. 打开设置侧边抽屉，确认顶栏右上角「×」已移除并替换为纯 `i` 图标（点击进入关于页），列表仅展示外观、分类管理与高级设置。
