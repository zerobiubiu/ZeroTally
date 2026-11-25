# 简记（keep-accounts）项目执行规则

本文件只记录面向 Agent 的固定执行规则；架构说明、决策记录与变更详情归入 `docs/`，见 `docs/README.md`。

## 语言与文档

- 文档与代码注释一律使用简体中文。
- 源码变更（功能、修复、优化、模块增删）在交付前同步写入 `docs/changes/` 并在 `docs/README.md` 补齐索引。
- 涉及模块职责、核心规则或目录边界调整时，同步更新 `docs/architecture/overview.md`。

## Git 规则

- 默认主分支为 `main`。
- 修改文件前先查看 `git status` 与当前分支状态，尊重工作区已有未提交改动，不擅自丢弃、覆盖或 stash。
- 未经用户明确要求，不擅自执行提交、推送、切分支、合并、变基或打标签；对外推送或改写历史前必须确认。
- 一个逻辑变更对应一个提交，提交信息使用简体中文，说清做了什么与为什么，提交前须通过 `bun run verify`。
- 严禁提交密钥、凭据、本地环境文件、依赖目录、`android/` 与 `ios/` 原生构建产物、`.markindex/`。

## 项目版本规则

- 单一版本号事实来源为 `package.json` 的 `version`，同步到 `app.json` 的 `expo.version`（Android 发布时按需递增 `expo.android.versionCode`）。
- 遵循语义化版本（`MAJOR.MINOR.PATCH`）：初始版本为 `0.1.0`。仅在应用行为发生变更时递增版本；纯文档、注释或规则配置修改不递增版本。
- 每次递增版本必须同步更新 `CHANGELOG.md`，并通过 `bun run check:version` 校验门禁。

## 架构与代码边界规则

- 金额一律以整数「分」（`cents`）存储与计算，元与分的解析及格式化统一走 `src/shared/money/money.ts`，禁止业务层直接用浮点数做金额加减。
- 所有 SQLite 查询与写入必须使用参数化绑定（`?`），禁止拼接用户输入 SQL。
- 记账、改账、删账与账户余额联动必须在同一 SQLite 事务内原子完成，由 `src/features/transactions/service.ts` 统一编排。
- `app/` 下路由文件只负责页面装配与路由参数读取，不直接执行 SQL 或编写业务规则。
- 跨职责模块只能依赖目标模块的公开类型或服务接口，禁止形成循环依赖。

## 依赖与验证规则

- 包管理器固定为 `bun`（已通过 `bunfig.toml` 开启 `linker = "hoisted"` 适配 React Native / Expo 与 Android CMake 路径长度限制）。
- 在本机安装新全局工具、JDK 或 Android SDK 组件前，必须先向用户确认。
- 代码改动完成后默认执行验证：`bun run verify`（包含版本校验、TypeScript 类型检查、ESLint 检查与 Vitest 单元测试）。
