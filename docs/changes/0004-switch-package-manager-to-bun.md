# 0004 将包管理器由 pnpm 迁移至 Bun

- **状态**：已执行
- **影响范围**：依赖管理与锁文件（`bunfig.toml`、`bun.lock`）、脚本入口（`package.json`、`scripts/build-android-apk.mjs`）、项目规则与文档（应用业务行为不变，版本保持 `v0.1.0`）
- **生效版本**：v0.1.0
- **前置文档**：[0002-switch-package-manager-to-bun.md](../decisions/0002-switch-package-manager-to-bun.md)
- **替代文档**：无

## 背景

将项目包管理器统一替换为 Bun，淘汰 `pnpm-workspace.yaml` 与 `pnpm-lock.yaml`，同时保持 React Native / Expo 与 Windows Android 原生构建所需的扁平 `node_modules` 依赖结构。

## 方案

1. 新增 `bunfig.toml`，在 `[install]` 中显式声明 `linker = "hoisted"`，确保 Metro、Babel（`babel-preset-expo`）与 Android CMake 路径扁平可用。
2. 删除 `pnpm-workspace.yaml`、`pnpm-lock.yaml` 与旧 `node_modules`，执行 `bun install` 生成 `bun.lock`。
3. 更新 `package.json`（`verify` 脚本）与 `scripts/build-android-apk.mjs`（`bun x expo prebuild`），同步更新 `AGENTS.md`、`README.md` 及排查文档。
4. 保持既有已执行的历史决策与变更文档不可变，通过新建 [0002-switch-package-manager-to-bun.md](../decisions/0002-switch-package-manager-to-bun.md) 记录架构决策替代关系。

## 实施（改动文件清单）

- 新增：[bunfig.toml](../../bunfig.toml)、`bun.lock`
- 删除：`pnpm-workspace.yaml`、`pnpm-lock.yaml`
- 修改：[package.json](../../package.json)、[scripts/build-android-apk.mjs](../../scripts/build-android-apk.mjs)、[AGENTS.md](../../AGENTS.md)、[README.md](../../README.md)
- 文档更新：[docs/decisions/0002-switch-package-manager-to-bun.md](../decisions/0002-switch-package-manager-to-bun.md)、[docs/decisions/README.md](../decisions/README.md)、[docs/troubleshooting/0001-windows-android-apk-build.md](../troubleshooting/0001-windows-android-apk-build.md)、[docs/troubleshooting/README.md](../troubleshooting/README.md)、[docs/changes/0004-switch-package-manager-to-bun.md](0004-switch-package-manager-to-bun.md)、[docs/changes/README.md](README.md)、[docs/README.md](../README.md)

## 执行验证记录

- **执行环境**：Windows 11，Bun `1.4.5`，Node.js `v26.13.1`，Expo SDK `58.0.26`，TypeScript `6.0.3`，Vitest `5.1.1`。
- **验证命令与实际输出**：
  1. `bun install`：`732 packages installed [13.07s]`；确认 `bun.lock` 已生成、`node_modules/babel-preset-expo` 位于顶层、`node_modules/react-native-screens` 为真实扁平目录（非符号链接）。
  2. `bun run verify`（串联 `check:version`、`typecheck`、`lint`、`test`）：
     - `版本校验通过：v0.1.0`
     - `tsc --noEmit`：0 错误
     - `eslint .`：0 错误、0 警告
     - `vitest run`：8 个测试文件、25 条测试用例全部通过（182ms）
  3. `bun x expo config --type public --json`：`Expo config OK: 简记 0.1.0 com.keepaccounts.app ["expo-router","expo-sqlite","./plugins/with-windows-cmake-path-fix"]`
  4. `bun x expo export --platform android --output-dir .expo/verify-bun-bundle`：Metro 成功打包 1216 个模块（8391ms），输出 2.8MB Hermes 字节码与 27 项资源，验证后已清理临时目录。
  5. `bun x expo-modules-autolinking react-native-config --json --platform android`：全部 7 个原生依赖模块自动链接解析通过。
- **验证结论**：通过。依赖安装、静态检查、真实 SQLite 单元测试、Android Metro/Hermes 打包与原生自动链接在 Bun 环境下均验证无误。
- **已知限制**：本次迁移后未重复执行耗时约 2 分钟的完整 Gradle Release APK 重编（已通过 `expo-modules-autolinking`、扁平 `node_modules` 校验与 `expo export --platform android` 覆盖关键路径）。

## 后续验证建议

1. 后续需要新 APK 时直接运行 `bun run build:apk` 即可（若切换后首次编译遇到旧缓存，可先执行 `bun x expo prebuild --platform android --clean --no-install`）。
