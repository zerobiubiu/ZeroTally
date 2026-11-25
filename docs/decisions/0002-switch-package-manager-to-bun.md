# 0002 将包管理器由 pnpm 更换为 Bun

- **状态**：已执行
- **影响范围**：包管理与锁文件（`bunfig.toml`、`bun.lock`）、脚本入口（`package.json`、`scripts/build-android-apk.mjs`）与项目规则（`AGENTS.md`）
- **生效版本**：v0.1.0
- **前置文档**：[0001-tech-stack-and-architecture.md](0001-tech-stack-and-architecture.md)
- **替代文档**：部分替代 [0001-tech-stack-and-architecture.md](0001-tech-stack-and-architecture.md) 中的包管理器决策（仅替换包管理器，框架、SQLite 抽象与财务数据模型保持不变）

## 结论

将项目包管理器统一替换为 **Bun**（当前版本 `1.4.5`），通过 `bunfig.toml` 显式启用 `linker = "hoisted"` 维护扁平 `node_modules` 并以 `bun.lock` 作为唯一锁文件；Node 26 仍作为 Expo Metro、Gradle 脚本与 Vitest（`node:sqlite`）的底层运行时保留。

## 背景与权衡

- **动机**：应项目协作要求统一包管理器为 Bun，同时保留更快、更简洁的依赖安装与文本锁文件（`bun.lock`）。
- **关键兼容点**：
  1. React Native / Expo（Babel 解析 `babel-preset-expo` 与 Windows Android CMake 路径长度）强依赖扁平 `node_modules`，因此在 `bunfig.toml` 中显式固定 `[install] linker = "hoisted"`。
  2. 单元测试使用 `bun run test`（调用 `package.json` 内的 `vitest run`，运行在 Node 26 与内置 `node:sqlite` 上），而非直接执行 `bun test`，确保真实 SQLite 事务与约束验证零改动通过。
- **代价**：团队成员本地需安装 Bun 1.2+ 与 Node.js 22+ 两套运行时。

## 重审条件

- 若未来 Vitest 或 Expo CLI 在 Windows 原生支持纯 Bun 运行时而不再依赖 Node.js，可评估简化双运行时要求。
