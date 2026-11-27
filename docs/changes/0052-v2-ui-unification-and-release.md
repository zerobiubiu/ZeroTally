# 0052：v2.0.0 全仓 UI 视觉统一、原子化组件抽离与终版发布校验

- **状态**：已执行
- **影响范围**：`package.json`、`app.json`、`CHANGELOG.md`、`src/shared/ui/{SurfaceCard,SectionHeader,InsetDivider,SettingRow,OptionChip,InlineNotice}.tsx`、`src/features/settings/components/SettingsPanel.tsx`、`app/{about,privacy,advanced-settings,security,budgets,reminders,gestures-guide,reimbursements}.tsx`、`docs/architecture/overview.md`
- **生效版本**：v2.0.0（Android `versionCode: 46`）
- **前置文档**：[0051-android-widget-and-daily-reminder.md](0051-android-widget-and-daily-reminder.md)

## 背景

在完成 P0、P1 与 P2 全部能力迭代后，各设置与二级功能页面存在大量重复的卡片容器、分组标题、缩进分割线、开关行、导航行、选项胶囊与轻提示横幅样式样板。需要在不改变交互重心与用户既有行为习惯的前提下，将通用 UI 元素原子化抽离复用并完成 `v2.0.0` 终版 Android Release APK 构建与签名/元数据校验。

## 方案

1. **原子化共享 UI 基元（`src/shared/ui/`，零业务依赖）**：
   - `SurfaceCard.tsx`：统一无外描边 14px 圆角纯白浮卡容器。
   - `SectionHeader.tsx`：统一 12px 弱化分组标题（含右侧轻量扩展位）。
   - `InsetDivider.tsx`：统一缩进极浅分割线（默认左右缩进 16px，不顶格切割卡片）。
   - `SettingRow.tsx`：提供 `SettingSwitchRow` 与 `SettingLinkRow` 两种语义明确、低耦合的设置行原子。
   - `OptionChip.tsx`：统一无描边 9px 圆角选中态胶囊（主色浅底 + 主色半粗字）。
   - `InlineNotice.tsx`：统一 `info / success / warning / danger` 轻提示反馈条。
2. **全仓设置与次级页收口复用**：
   - 将 `SettingsPanel.tsx` 与 `about`、`privacy`、`advanced-settings`、`security`、`budgets`、`reminders`、`gestures-guide`、`reimbursements` 等页面全部重构为组合上述原子组件，保持既有页面焦点、导航路径与功能行为 100% 兼容。
3. **v2.0.0 终版原生集成校验**：
   - 通过 `expo prebuild --platform android --no-install` 验证 `with-windows-cmake-path-fix`、`with-release-signing-and-shrink`、`with-android-quick-widget`（含原生 Kotlin 桌面小组件）与 `expo-notifications`、`expo-local-authentication`、`expo-screen-capture` 全套原生插件协同编译打包。

## 实施（改动文件清单）

- **版本与日志**：`package.json`（`2.0.0`）、`app.json`（`2.0.0` / `versionCode: 46`）、`CHANGELOG.md`。
- **共享原子 UI 组件**：新增 `src/shared/ui/{SurfaceCard.tsx,SectionHeader.tsx,InsetDivider.tsx,SettingRow.tsx,OptionChip.tsx,InlineNotice.tsx}`。
- **页面与组件收口**：更新 `SettingsPanel.tsx`、`app/about.tsx`、`app/privacy.tsx`、`app/advanced-settings.tsx`、`app/security.tsx`、`app/budgets.tsx`、`app/reminders.tsx`、`app/gestures-guide.tsx`、`app/reimbursements.tsx`。
- **文档与索引**：`docs/architecture/overview.md`、`docs/changes/0052-v2-ui-unification-and-release.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows 11（PowerShell）、Bun `1.4.5`、Android Studio JBR 21、Android SDK Build-Tools `37.0.0`。
- **静态与单测**：`bun run verify`（版本校验 `v2.0.0`、TypeScript 0 错误、ESLint 0 警告、Vitest 36 个测试文件共 139 条单测全部通过）。
- **v2.0.0 终版 APK 构建与校验**：
  - 构建命令：`bun x expo prebuild --platform android --no-install && bun run build:apk -- --allow-debug-signing`（`BUILD SUCCESSFUL in 3m 9s`，含 `ZeroTallyWidgetProvider.kt` 原生桌面小组件编译与 R8 混淆瘦身）。
  - 产物路径：`android/app/build/outputs/apk/release/app-release.apk`（`57.72 MB` / `60,519,983` 字节）。
  - `aapt2 dump badging`：`package='com.keepaccounts.app'`、`versionCode='46'`、`versionName='2.0.0'`、`targetSdkVersion='36'`、`application-label='ZeroTally'`。
  - `aapt2 dump xmltree AndroidManifest.xml`：确认注册 `com.keepaccounts.app.ZeroTallyWidgetProvider`。
  - `apksigner verify --verbose`：`Verifies`（APK Signature Scheme v2 = `true`，本地测试调试签名，正式对外分发须改用外部 Keystore）。
  - `SHA-256`：`9E18D4A282A4A6F83D77E59241A7F0A67866348062C0C910278EE8D3C5DDD4C2`。
- **验证结论**：ZeroTally `v2.0.0` 全部 P0/P1/P2 功能、原子 UI 重构、单元测试及 Android Release APK 构建校验均一次通过。

## 后续验证建议

1. 正式对外分发前，请先运行 `bun run keystore:init` 在仓库外生成并妥善备份专属 Release Keystore，随后直接执行 `bun run build:apk` 生成正式签名包（不加 `--allow-debug-signing`）。
2. 真机安装校验：依次体验搜索筛选、90% 触底懒加载、隐私锁与隐藏金额、可选预算/报销/每日提醒、周期账单与房贷提前还款、快捷批量记账、财务分析环比同比下钻、手势技巧与 Android 桌面 4×2 小组件。
