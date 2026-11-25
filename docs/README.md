# 文档中心

本目录存放「简记（keep-accounts）」的架构说明、关键决策、变更记录与问题排查文档。代码规范与 Agent 执行要求见根目录 [AGENTS.md](../AGENTS.md)。

## 目录索引

| 分类目录 | 用途 | 入口文档 |
| --- | --- | --- |
| `architecture/` | 系统架构、模块边界、核心规则与变更局部性说明（现状文档） | [architecture/README.md](architecture/README.md) |
| `decisions/` | 关键技术与结构决策记录（不可变历史文档） | [decisions/README.md](decisions/README.md) |
| `changes/` | 源码改动随行变更记录与验证报告（不可变历史文档） | [changes/README.md](changes/README.md) |
| `troubleshooting/` | 长期、可复现问题的排查与解决方案 | [troubleshooting/README.md](troubleshooting/README.md) |

## 文档清单

| 路径 | 类型 | 状态 | 概览 |
| --- | --- | --- | --- |
| [architecture/overview.md](architecture/overview.md) | 参考说明 | 参考 | 模块职责边界、用例与规则索引、依赖方向、变更场景模拟 |
| [decisions/0001-tech-stack-and-architecture.md](decisions/0001-tech-stack-and-architecture.md) | 架构决策 | 已执行 | 技术栈选型、金额分存储、负债净值符号约定与 SQLite 抽象决策（包管理器部分由 0002 替代） |
| [decisions/0002-switch-package-manager-to-bun.md](decisions/0002-switch-package-manager-to-bun.md) | 架构决策 | 已执行 | 将包管理器更换为 Bun 并显式启用 hoisted 扁平布局 |
| [changes/0001-initial-mvp.md](changes/0001-initial-mvp.md) | 变更记录 | 已执行 | v0.1.0 首版功能实现清单与验证记录 |
| [changes/0002-local-android-apk-build.md](changes/0002-local-android-apk-build.md) | 变更记录 | 已执行 | 打通 Windows 本地 Android 原生 Release APK 打包与产物校验 |
| [changes/0003-redesign-app-logo.md](changes/0003-redesign-app-logo.md) | 变更记录 | 已执行 | 重新设计品牌矢量 Logo、Android 三层自适应图标与启动页并重打 APK |
| [changes/0004-switch-package-manager-to-bun.md](changes/0004-switch-package-manager-to-bun.md) | 变更记录 | 已执行 | 将包管理器由 pnpm 迁移至 Bun 并完成全量验证 |
| [changes/0005-refine-bottom-nav-and-settings-entry.md](changes/0005-refine-bottom-nav-and-settings-entry.md) | 变更记录 | 已执行 | 重构底栏为半高双栏加居中凸起「+」记一笔主按钮，并将设置迁至顶栏右上角 |
| [changes/0006-ui-cutout-copy-analytics-export.md](changes/0006-ui-cutout-copy-analytics-export.md) | 变更记录 | 已执行 | 异形屏安全区适配、全页布局与文案精修、新增账务分析页及 JSON/CSV 结构化导出 |
| [changes/0007-open-source-zerotally-and-github-actions.md](changes/0007-open-source-zerotally-and-github-actions.md) | 变更记录 | 已执行 | 以 MIT 协议开源至 GitHub（ZeroTally）并配置 Actions 自动打包发布 APK |
| [troubleshooting/0001-windows-android-apk-build.md](troubleshooting/0001-windows-android-apk-build.md) | 部署运维 | 参考 | Windows 下扁平依赖 hoisting 与 CMake/Ninja 路径长度问题排查方案 |

## 文档规范

1. 文档一律使用简体中文，存放在 `docs/` 对应分类子目录下，不存放业务代码。
2. 现状文档（如 `architecture/overview.md`）随系统演进同步更新；不可变文档（`decisions/` 与 `changes/` 中状态为「已执行」的编号文档）定稿后不重写，后续变更另建编号文档并注明替代关系。
3. 编号文档在各自子目录内从 `0001` 局部递增，头部须包含元数据（状态、影响范围、生效版本、前置或替代文档）。
4. 每次源码变更在交付前须同步在 `changes/` 记录背景、方案、改动文件清单、执行验证记录与后续建议，并回到本文件更新索引。
