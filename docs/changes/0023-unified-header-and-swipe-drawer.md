# 0023 重构主界面为全局共享极简顶栏（移除汉堡图标、双页点击标题及明细页右滑拉出设置抽屉）

- **状态**：已执行
- **影响范围**：`app/(tabs)/_layout.tsx`、`app/(tabs)/index.tsx`、`app/(tabs)/assets.tsx`、`src/features/navigation/drawer-context.tsx`、`src/features/settings/components/SettingsDrawer.tsx`、`src/features/transactions/components/MonthlySummaryHeader.tsx`、版本清单、README、架构文档与变更日志
- **生效版本**：v0.9.1（Android `versionCode: 17`）
- **前置文档**：[0018-side-drawer-hamburger-settings-menu.md](0018-side-drawer-hamburger-settings-menu.md)、[0022-draggable-bottom-sheet.md](0022-draggable-bottom-sheet.md)

## 背景

此前「明细」与「资产」两页各自在顶栏左上角独立绘制了一个 `40×40` 带描边圆圈的汉堡菜单按钮，存在两项视觉与交互缺陷：

1. 圆圈容器视觉权重过重，将主标题 `ZeroTally` 挤离下方深玉青总览卡左侧边线，加上紧跟其后的 `N 笔` 让顶栏显得碎裂拥挤；
2. 两个页面各自渲染相同按钮且随横向轨道滑动，左右切换时出现“一个汉堡滑出、另一个一模一样的汉堡滑入”的重复感。

本次按用户确认的 **AB 混合模式** 全面重构主界面顶部壳层与抽屉唤起体验。

## 方案

1. **上提全局固定共享顶栏（`app/(tabs)/_layout.tsx`）**：
   - 将异形屏顶部安全区（`SafeScreen`）与顶栏上提至主 Tab 容器固定壳层，与底部固定导航栏上下呼应；横向滑动轨道仅滑动下方总览卡与列表内容，彻底消除滑切时的顶栏重复。
   - **彻底移除全部汉堡菜单图标与圆圈边框**：左侧仅保留纯粹舒展的 24px 大标题，左缘与下方总览卡/净资产卡严格像素齐平；随着左右滑动进度 `translateX`，左侧标题（`ZeroTally` ⇄ `资产`）与右侧页面专属主操作（`按月 / 按年 / 全部` ⇄ `+ 新增`）均通过纯 GPU `Animated` 透明与轻微水平位移平滑交叉淡变（非当前页操作层设 `pointerEvents="none"` 防止误触）。
   - 将原先挤在顶栏标题旁的 `N 笔` 收纳至深玉青总览卡内与「支出」同行轻量展示（`支出 · N 笔`，0 笔时仅展示 `支出`）。
2. **双入口自然唤起左侧设置抽屉**：
   - **点击页面标题打开**：明细页点击 `ZeroTally`、资产页点击 `资产`（宽大 44dp+ 热区、按压态与轻触觉反馈）均可平滑滑出左侧设置抽屉；
   - **明细页跟手右滑拉出**：将 `SettingsDrawer` 的 `progress`（`Animated.Value`）提升为与主容器共享；在明细页（最左页）向右滑动时 1:1 跟手将设置抽屉从左侧拉出（背景遮罩同步线性渐暗），超过抽屉宽度 24% 或快速右甩时平滑展开到底，否则流畅弹回并卸载，形成「设置抽屉 ⇄ 明细 ⇄ 资产」连贯横向空间模型；单行账目左滑菜单仍优先隔离互不冲突。
3. **上下文共享与页面瘦身**：
   - 扩展 `src/features/navigation/drawer-context.tsx` 承载 `ledgerPeriodMode` / `setLedgerPeriodMode`，由全局顶栏与明细页同步联动；
   - `app/(tabs)/index.tsx` 与 `app/(tabs)/assets.tsx` 移除重复 `SafeScreen`、重复 `topBar` 与汉堡按钮，专注列表内容区，打开抽屉或切换周期时明细页自动收起已展开的行内左滑菜单。

## 实施（改动文件清单）

- 修改：`app/(tabs)/_layout.tsx`、`app/(tabs)/index.tsx`、`app/(tabs)/assets.tsx`、`src/features/navigation/drawer-context.tsx`、`src/features/settings/components/SettingsDrawer.tsx`、`src/features/transactions/components/MonthlySummaryHeader.tsx`、`src/features/settings/components/SettingsPanel.tsx`。
- 版本与文档：`package.json`、`app.json`、`CHANGELOG.md`、`README.md`、`docs/architecture/overview.md`、`docs/changes/0023-unified-header-and-swipe-drawer.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows（PowerShell），Bun + TypeScript 6 + ESLint 9 + Vitest 5 + Gradle 9.4.1 / Android Build Tools 37.0.0
- **静态检查、单测与残留核查**：`bun run verify` + 全仓 `menu-outline` 正则统计
  - `node scripts/check-version.mjs`：`版本校验通过：v0.9.1`
  - `tsc --noEmit`：0 错误退出
  - `eslint .`：0 错误、0 警告退出
  - `vitest run`：`Test Files 16 passed (16)`，`Tests 61 passed (61)`（284ms）
  - 汉堡图标残留统计：`0`
- **Release APK 构建与校验**：`bun x expo prebuild --platform android --no-install && bun run build:apk`
  - 产物：`android/app/build/outputs/apk/release/app-release.apk`（`56.32 MB`，`59,053,646` 字节）
  - `aapt2 dump badging`：`package='com.keepaccounts.app'`、`versionCode='17'`、`versionName='0.9.1'`、`application-label='ZeroTally'`、`native-code='arm64-v8a' 'x86_64'`
  - `apksigner verify --verbose`：`Verifies`（APK Signature Scheme v2 = `true`，1 signer）
  - SHA-256：`55EBD85479C3F6B234360CFE4083FAA1BDC8212833D98E78139C5412756EF3F0`
- **验证结论**：通过。
- **已知限制**：尚未在真机安装实测「明细页右滑拉出抽屉 → 中途反向左滑切资产页」的连续复合手势手感。

## 后续验证建议

- 安装 `v0.9.1` APK 到真机验收：
  1. 明细页与资产页均已无汉堡按钮，`ZeroTally` / `资产` 左边缘与下方卡片左缘严格对齐，左右滑动时顶栏稳固不动，标题与右侧控件丝滑交叉淡变；
  2. 明细页点击 `ZeroTally`、资产页点击 `资产` 均可顺滑打开左侧设置抽屉；
  3. 明细页任意空白或列表区域向右滑动，设置抽屉 1:1 跟手从左侧拉出，拉过阈值松手展开、轻拉松手弹回，单行左滑菜单与左滑切资产页均正常无干扰。
