# 0043：个性化隐私与安全中心（启动锁、生物识别、遮罩与金额隐藏）

- **状态**：已执行
- **影响范围**：`package.json`、`bun.lock`、`app.json`、`CHANGELOG.md`、`src/features/security/*`、`app/security.tsx`、`app/_layout.tsx`、`src/features/settings/components/SettingsPanel.tsx`、`NetWorthCard.tsx`、`AccountRow.tsx`、`MonthlySummaryHeader.tsx`、`docs/architecture/overview.md`
- **生效版本**：v1.8.3（Android `versionCode: 37`）
- **前置文档**：[0042-error-boundary-and-privacy-consistency.md](0042-error-boundary-and-privacy-consistency.md)

## 背景

ZeroTally 存储着完整的消费流水、净资产与银行卡信息，不同用户对隐私防护的诉求差异明显。需要将启动锁、生物识别、独立 PIN、防截屏与金额隐藏全部拆分为独立可选项放在设置中，默认关闭不打扰普通用户，按需自由组合。

## 方案

1. **引入 Expo 官方安全模块**：按用户确认安装 `expo-local-authentication`（指纹/面容生物识别）与 `expo-screen-capture`（防截屏与多任务快照保护），并在 `app.json` 配置生物识别权限说明。
2. **安全规则与硬件隔离（`src/features/security/`）**：
   - `rules.ts` & `rules.test.ts`：定义配置序列化、4~6 位 PIN 校验、常量时间哈希比对、后台超时重锁判定与金额脱敏纯函数。
   - `native-security.ts`：PIN 使用 16 字节随机盐 + 128 轮 SHA-256 拉伸后写入系统 `SecureStore`，绝不写入 SQLite 或备份 JSON；未设置独立 PIN 时允许生物识别回退系统设备密码防止锁死。
   - `security-context.tsx` + `AppLockOverlay.tsx`：统一接管冷启动锁定、前后台切换隐私遮罩与按超时自动上锁。
3. **个性化设置页与零入侵金额遮蔽（`app/security.tsx`）**：
   - 在设置抽屉新增「隐私与安全」入口，所有安全项独立拆分开关，默认全部关闭。
   - 仅当用户主动开启「总览卡快捷隐藏开关」时，明细与资产总览卡才会出现轻量小眼睛图标，不干扰未开启用户。

## 实施（改动文件清单）

- **依赖与版本**：`package.json`（`1.8.3` + `expo-local-authentication` / `expo-screen-capture`）、`bun.lock`、`app.json`（`1.8.3` / `versionCode: 37` + 插件配置）、`CHANGELOG.md`。
- **隐私安全模块**：新增 `src/features/security/types.ts`、`rules.ts`、`rules.test.ts`、`native-security.ts`、`security-context.tsx`、`components/AppLockOverlay.tsx`、`app/security.tsx`。
- **集成**：`app/_layout.tsx`、`SettingsPanel.tsx`、`NetWorthCard.tsx`、`AccountRow.tsx`、`MonthlySummaryHeader.tsx`。
- **文档与索引**：`docs/architecture/overview.md`、`docs/changes/0043-privacy-and-security-center.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows 11（PowerShell）、Bun `1.4.5`、Node.js（`node:sqlite`）。
- **验证命令与实际输出**：`bun run verify`（版本校验 `v1.8.3`、TypeScript 零错误、ESLint 零警告、全量 Vitest 单测通过）。
- **验证结论**：配置解析、PIN 格式与常量时间比对、后台超时判定与金额脱敏均通过单测；全仓类型与 ESLint 检查通过。
- **已知限制**：生物识别硬件弹窗与 Android `FLAG_SECURE` 需在真机安装 `v1.8.4` 阶段 APK 后实测。

## 后续验证建议

1. 真机打开「设置 → 隐私与安全」，分别测试单独开启生物识别锁、单独开启数字密码、两者并用、切后台超时重锁、防截屏及总览卡小眼睛显隐。
