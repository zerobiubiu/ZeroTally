# 架构决策记录索引

本目录存放已拍板的关键技术与结构决策（不可变历史文档，定稿后不重写，后续变更通过新编号文档替代）。

## 文档清单

| 文档 | 类型 | 状态 | 生效版本 | 概览 |
| --- | --- | --- | --- | --- |
| [0001-tech-stack-and-architecture.md](0001-tech-stack-and-architecture.md) | 架构决策 | 已执行 | v0.1.0 | Expo 架构、SQLite 适配器、金额分存储与负债净值符号约定（包管理器部分已由 0002 替代） |
| [0002-switch-package-manager-to-bun.md](0002-switch-package-manager-to-bun.md) | 架构决策 | 已执行 | v0.1.0 | 将包管理器更换为 Bun 并通过 `bunfig.toml` 启用 hoisted 布局 |
