# 0049：首次启动极轻量手势提示、手势与快捷技巧页及 P1 阶段 APK 校验

- **状态**：已执行
- **影响范围**：`package.json`、`app.json`、`CHANGELOG.md`、`src/features/onboarding/`、`app/gestures-guide.tsx`、`app/(tabs)/_layout.tsx`、`app/_layout.tsx`、`src/features/settings/components/SettingsPanel.tsx`、`docs/architecture/overview.md`
- **生效版本**：v1.9.4（Android `versionCode: 43`）
- **前置文档**：[0048-analytics-drilldown-and-comparison.md](0048-analytics-drilldown-and-comparison.md)

## 背景

ZeroTally 的多项高效交互（点击标题/右滑抽屉、底栏上滑快捷面板、长按 `+` 扇形极速记账、长按快捷卡滑调金额/账户）属于高效率但可发现性偏弱的隐性手势，需要在零侵入日常使用体验的前提下提供一次性轻量提示与随时可查的手势速查页，并完成整个 P1 阶段（v1.9.0 ~ v1.9.4）的 Android Release APK 打包与校验。

## 方案

1. **单一数据源手势目录与持久化状态（`src/features/onboarding/`）**：
   - `rules.ts` 统一维护 8 条手势技巧清单与 4 条首启精选手势，提供 `shouldShowFirstLaunchGuide` 纯函数。
   - `repository.ts` 基于既有 `app_settings` 存储 `onboarding_tips_seen_v1 = '1'`，不改动数据库 Schema。
2. **首次启动极轻量弹层（`FirstLaunchGuideSheet.tsx`）**：
   - 挂载于 `app/(tabs)/_layout.tsx`，仅当未读时展示一次，点「开始记账」、遮罩或返回键立即落盘永不复现，并提供直达完整技巧页入口。
3. **设置侧栏「手势与快捷技巧」页（`app/gestures-guide.tsx`）**：
   - 挂入 `SettingsPanel.tsx` 与 `app/_layout.tsx`，三分组无描边卡片简洁呈现全部顺手手势。

## 实施（改动文件清单）

- **版本与日志**：`package.json`（`1.9.4`）、`app.json`（`1.9.4` / `versionCode: 43`）、`CHANGELOG.md`。
- **引导模块与测试**：新增 `src/features/onboarding/{rules.ts,rules.test.ts,repository.ts,components/FirstLaunchGuideSheet.tsx}`。
- **路由与入口**：新增 `app/gestures-guide.tsx`，更新 `app/(tabs)/_layout.tsx`、`app/_layout.tsx`、`SettingsPanel.tsx`。
- **文档与索引**：`docs/architecture/overview.md`、`docs/changes/0049-onboarding-and-gestures-guide.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows 11（PowerShell）、Bun `1.4.5`、Android Studio JBR 21、Android SDK Build-Tools `37.0.0`。
- **静态与单测**：`bun run verify`（版本校验 `v1.9.4`、TypeScript 0 错误、ESLint 0 警告、Vitest 33 个测试文件共 132 条单测全部通过）。
- **P1 阶段 APK 构建与校验**：
  - 构建命令：`bun x expo prebuild --platform android --no-install && bun run build:apk -- --allow-debug-signing`（`BUILD SUCCESSFUL in 2m 41s`）。
  - 产物路径：`android/app/build/outputs/apk/release/app-release.apk`（`57.08 MB` / `59,857,400` 字节）。
  - `aapt2 dump badging`：`package='com.keepaccounts.app'`、`versionCode='43'`、`versionName='1.9.4'`、`targetSdkVersion='36'`、`application-label='ZeroTally'`。
  - `apksigner verify --verbose`：`Verifies`（APK Signature Scheme v2 = `true`，本地测试调试签名，正式分发须改用外部 Keystore）。
  - `SHA-256`：`28A95BD3E5A7A7E8833A5899F931E534F50484B03AF812D78B52BD77B514AE7B`。
- **验证结论**：P1 全阶段功能（`v1.9.0` ~ `v1.9.4`）代码校验与 Android Release APK 构建校验全部通过。

## 后续验证建议

1. 首次冷启动安装新包确认轻量提示卡仅弹出一次，关闭后重启不再出现；从设置侧栏进入「手势与快捷技巧」核对全部条目可读性与深浅色适配。
