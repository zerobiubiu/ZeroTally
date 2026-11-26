# 0016 将应用名称与现状文档统一更名为 ZeroTally

- **状态**：已执行
- **影响范围**：`app.json`、`app/(tabs)/index.tsx`、`package.json`、`app/settings.tsx`、`CHANGELOG.md`、`README.md`、`AGENTS.md`、`docs/README.md`、`src/theme/DESIGN.md`、`src/theme/design-tokens.json`
- **生效版本**：v0.6.1（Android `versionCode: 10`）
- **前置文档**：[0015-keyboard-avoidance-delete-dialog-all-ledger-and-swipe-tabs.md](0015-keyboard-avoidance-delete-dialog-all-ledger-and-swipe-tabs.md)

## 背景

应用此前在桌面启动器、明细首页顶栏及部分现状文档中使用中文名「简记」，现按要求弃用该中文名，统一更名为仓库名 `ZeroTally`。

## 方案

1. **应用配置与界面展示更名**：
   - `app.json` 中 `expo.name` 改为 `"ZeroTally"`，同步 Android 启动器图标下方的 `application-label`；保留既有 `android.package`（`com.keepaccounts.app`）以确保旧版覆盖升级时本地 SQLite 账本数据完整保留。
   - `app/(tabs)/index.tsx` 顶栏标题由「简记」改为 `ZeroTally`，字号由 `xxl`（24px）微调为 `xl`（20px、`letterSpacing: -0.3`）并增加右侧安全间距 `marginRight: 8`，防止 360dp 窄屏下 9 字符英文品牌名与笔数、三段模式切换胶囊互相挤压。
2. **全仓现状文档与元数据同步**：
   - 更新 `README.md`、`AGENTS.md`、`CHANGELOG.md`、`docs/README.md`、`src/theme/DESIGN.md`、`src/theme/design-tokens.json` 中的应用名称为 `ZeroTally`；既有历史不可变变更文档（`docs/changes/0001`–`0015`）按文档规范保持原貌不重写。
3. **版本递增**：
   - 按语义化版本规范，应用展示名变化递增补丁版本至 `0.6.1`（Android `versionCode: 10`）。

## 实施（改动文件清单）

- `app.json`：`expo.name` 改为 `"ZeroTally"`，版本递增至 `0.6.1`（`versionCode: 10`）。
- `app/(tabs)/index.tsx`：顶栏标题替换为 `ZeroTally` 并优化英文标题字号与窄屏防挤压布局。
- `package.json`、`app/settings.tsx`、`CHANGELOG.md`：版本号同步至 `0.6.1` 并记录变更。
- `README.md`、`AGENTS.md`、`docs/README.md`、`src/theme/DESIGN.md`、`src/theme/design-tokens.json`：移除「简记」中文名，统一为 `ZeroTally`。

## 执行验证记录

- **执行环境**：Windows（PowerShell），Bun + TypeScript 6 + ESLint 9 + Vitest 5
- **验证命令**：`bun run verify` 与全仓现状文件关键词扫描
- **实际输出**：
  - `node scripts/check-version.mjs`：`版本校验通过：v0.6.1`
  - `tsc --noEmit`：0 错误退出
  - `eslint .`：0 错误、0 警告退出
  - `vitest run`：`Test Files 15 passed (15)`，`Tests 56 passed (56)`（231ms）
  - 全仓现状源码、配置与文档扫描：除 `CHANGELOG.md` 变更历史说明与 `docs/changes/` 不可变归档外，无其他「简记」残留。
- **验证结论**：通过。
- **已知限制**：
  - 尚未重新执行 `expo prebuild` 与打包 `v0.6.1` APK（现有 `android/` 产物仍为 `v0.6.0`）；
  - `docs/assets/` 下 v0.1.0 静态展示图（`banner-light.png`、`banner-dark.png`、`preview-screens.png`）像素内仍保留旧版标签字样，需按需重绘更新。

## 后续验证建议

- 重新执行 `bun x expo prebuild --platform android --no-install && bun run build:apk` 生成 `v0.6.1` APK，并通过 `aapt2 dump badging` 确认 `application-label:'ZeroTally'`、`versionName='0.6.1'`、`versionCode='10'`。
