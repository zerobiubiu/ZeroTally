# 0051：可选每日记账本地提醒与 Android 桌面小组件（Widget）

- **状态**：已执行
- **影响范围**：`package.json`、`bun.lock`、`app.json`、`CHANGELOG.md`、`src/features/reminders/`、`app/reminders.tsx`、`plugins/with-android-quick-widget.js`、`app/_layout.tsx`、`src/features/settings/components/SettingsPanel.tsx`、`docs/architecture/overview.md`
- **生效版本**：v1.10.1（Android `versionCode: 45`）
- **前置文档**：[0050-optional-reimbursement-tracking.md](0050-optional-reimbursement-tracking.md)

## 背景

在不干扰主记账流程、不引入远端推送服务或重型桌面小组件三方库的前提下，补充按需开启的本地每日记账提醒与原生 Android 4×2 桌面概览小组件，进一步降低日常打开记账的阻力。

## 方案

1. **可选每日记账本地提醒（`src/features/reminders/` + `app/reminders.tsx`）**：
   - 基于用户批准安装的 `expo-notifications` 实现 100% 本地定时调度（`SchedulableTriggerInputTypes.DAILY`），开关默认关闭且不在首次启动索取通知权限。
   - 幂等取消旧计划后重建，支持 ±15 分钟步进、常用时段快选与自定义提醒文案；点击通知通过 `app/_layout.tsx` 监听器直达 `/record`。
2. **原生零三方依赖 Android 桌面小组件（`plugins/with-android-quick-widget.js`）**：
   - 在 `expo prebuild` 阶段生成 `ZeroTallyWidgetProvider.kt`、`widget_zerotally_summary.xml`、`zerotally_widget_info.xml` 与圆角 Drawable，并在 `AndroidManifest.xml` 注册 `APPWIDGET_UPDATE` 广播接收器。
   - 小组件只读查询本地 `SQLite/keep_accounts.db` 展示当月净支出与收入（自动检查 `privacy_security_config_v1` 中的 `hideAmountsByDefault` 脱敏开关），提供「+ 记一笔」（`keep-accounts://record`）与「刷新」快捷操作。

## 实施（改动文件清单）

- **依赖、版本与配置**：`package.json`（`1.10.1` + `expo-notifications`）、`bun.lock`、`app.json`（`1.10.1` / `versionCode: 45` + 插件声明）、`CHANGELOG.md`。
- **提醒模块与测试**：新增 `src/features/reminders/{types.ts,rules.ts,rules.test.ts,repository.ts,native-reminder.ts}`。
- **Android 原生小组件插件**：新增 `plugins/with-android-quick-widget.js`。
- **页面与入口**：新增 `app/reminders.tsx`，更新 `app/_layout.tsx`、`SettingsPanel.tsx`。
- **文档与索引**：`docs/architecture/overview.md`、`docs/changes/0051-android-widget-and-daily-reminder.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows 11（PowerShell）、Bun `1.4.5`、Node.js（`node:sqlite`）。
- **验证命令与实际输出**：`bun run verify`（版本校验 `v1.10.1`、TypeScript 0 错误、ESLint 0 警告、Vitest 36 个测试文件共 139 条单测全部通过）。
- **验证结论**：每日记账提醒纯规则、跨午夜步进循环、本地通知适配与零三方依赖 Android Widget Config Plugin 均通过校验。
- **已知限制**：原生 Kotlin 小组件编译及 APK 校验随终版 `v2.0.0` 一并构建验证。

## 后续验证建议

1. 在设置 →「提醒与小组件」开启每日提醒，确认权限引导与通知直达记一笔；长按 Android 桌面添加「ZeroTally 记账小组件」，验证当月收支读取、隐私脱敏与「+ 记一笔」直达链路。
