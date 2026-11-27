# 0042：全局崩溃兜底边界与关于/隐私说明自洽

- **状态**：已执行
- **影响范围**：`package.json`、`app.json`、`CHANGELOG.md`、`src/shared/ui/AppErrorBoundary.tsx`、`app/_layout.tsx`、`app/about.tsx`、`app/privacy.tsx`、`docs/architecture/overview.md`
- **生效版本**：v1.8.2（Android `versionCode: 36`）
- **前置文档**：[0041-lazy-pagination-ledger-and-account-detail.md](0041-lazy-pagination-ledger-and-account-detail.md)

## 背景

1. 根路由 `app/_layout.tsx` 此前仅兜底了 SQLite 初始化异常，缺少 React 级全局 `ErrorBoundary`，运行时渲染异常会导致应用白屏闪退。
2. `app/about.tsx` 仍保留 v1.0.0 时期的「不上传云端」文案，与 v1.5.0 上线的 WebDAV / Google Drive 云备份相冲突，且缺少独立简明隐私说明页。

## 方案

1. 新增 `src/shared/ui/AppErrorBoundary.tsx` 并在 `app/_layout.tsx` 最外层包裹应用，异常发生时提供友好恢复界面、一键重挂载与脱敏异常摘要复制（绝不泄露任何账本或凭据数据）。
2. 更新 `app/about.tsx` 特性文案为「本地优先，主权归己」，新增「隐私说明」二级入口指向 `app/privacy.tsx`，清晰披露离线 SQLite 存储、用户主动授权直连网盘、系统硬件安全存储与完整导出/清空权利。

## 实施（改动文件清单）

- **版本与日志**：`package.json`（`1.8.2`）、`app.json`（`1.8.2` / `versionCode: 36`）、`CHANGELOG.md`。
- **崩溃边界与页面**：新增 `src/shared/ui/AppErrorBoundary.tsx`、`app/privacy.tsx`；更新 `app/_layout.tsx`、`app/about.tsx`。
- **文档与索引**：`docs/architecture/overview.md`、`docs/changes/0042-error-boundary-and-privacy-consistency.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows 11（PowerShell）、Bun `1.4.5`、Node.js（`node:sqlite`）。
- **验证命令与实际输出**：`bun run verify`（版本校验 `v1.8.2`、TypeScript 零错误、ESLint 零警告、27 个测试文件共 113 项单测全部通过）。
- **验证结论**：编译、静态检查与全量回归全部通过。
- **已知限制**：按阶段计划在 `v1.8.4` 统一打包 Release APK。

## 后续验证建议

1. 真机打开「设置 → 关于 → 隐私说明」，核对浅色/深色模式下文案与排版清晰度。
