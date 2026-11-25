# 0007 MIT 协议开源发布至 GitHub（ZeroTally）与 Actions 自动发包配置

- **状态**：已执行
- **影响范围**：开源协议（`LICENSE`）、包元数据（`package.json`）、GitHub Actions 自动化工作流（`.github/workflows/ci.yml`、`.github/workflows/release-apk.yml`）与公开仓库发布（`zerobiubiu/ZeroTally`）
- **生效版本**：v0.1.0
- **前置文档**：[0006-ui-cutout-copy-analytics-export.md](0006-ui-cutout-copy-analytics-export.md)
- **替代文档**：无

## 背景

将当前项目以 MIT 开源协议正式发布到 GitHub 公开仓库 `https://github.com/zerobiubiu/ZeroTally`，并配置 GitHub Actions 工作流实现持续校验以及推送 `v*` 版本标签时自动编译并发布 Android Release APK 至 GitHub Release。

## 方案

1. **MIT 开源合规**：新增标准 MIT [LICENSE](../../LICENSE)（版权归属 `2026 zerobiubiu`），在 `package.json` 补充 `license: "MIT"` 与 `repository` 字段，在 `README.md` 署名为「ZeroTally（简记）」并说明开源协议与自动发包流程。
2. **GitHub Actions 安全工作流**：
   - `.github/workflows/ci.yml`：最小权限 `contents: read`，对 `main` 推送与 PR 自动运行 `bun install --frozen-lockfile` 与 `bun run verify`。
   - `.github/workflows/release-apk.yml`：监听 `v*` 标签推送与手动 `workflow_dispatch`，权限收口为 `contents: write`；第三方 Action（`oven-sh/setup-bun`）锁定至完整 40 位 Commit SHA（`0c5077e51419868618aeaa5fe8019c62421857d6`）；所有动态变量经 `env:` 传递避免 Shell 注入；支持按需读取 Keystore Secrets 正式签名，未配置时回退默认测试签名，并通过内置 `gh release` 自动附带 APK 与 `.sha256` 校验文件创建 GitHub Release。
3. **首次提交与发布**：通过 `bun run verify` 门禁后在 `main` 创建初始提交，创建公开仓库 `zerobiubiu/ZeroTally`，推送 `main` 与附注标签 `v0.1.0` 自动触发首次 APK 发布流程。

## 实施（改动文件清单）

- 新增：[LICENSE](../../LICENSE)、[.github/workflows/ci.yml](../../.github/workflows/ci.yml)、[.github/workflows/release-apk.yml](../../.github/workflows/release-apk.yml)
- 修改：[package.json](../../package.json)、[README.md](../../README.md)、[CHANGELOG.md](../../CHANGELOG.md)
- 文档更新：[docs/changes/0007-open-source-zerotally-and-github-actions.md](0007-open-source-zerotally-and-github-actions.md)、[docs/changes/README.md](README.md)、[docs/README.md](../README.md)

## 执行验证记录

- **执行环境**：Windows 11，Bun `1.4.5`，Node.js `v26.13.1`，Git，GitHub CLI `gh`（登录账号 `zerobiubiu`）。
- **验证步骤与实际输出**：
  1. 敏感信息扫描：待提交工作区不含本机路径凭据、密钥、构建产物或依赖目录。
  2. `bun run verify`：版本校验（`v0.1.0`）、TypeScript、ESLint 与 12 个测试文件（33 条用例）全部通过。
  3. 仓库创建与推送：`gh repo create ZeroTally --public` 创建 `https://github.com/zerobiubiu/ZeroTally`，推送 `main` 与 `v0.1.0` 标签，确认 GitHub Actions `CI` 与 `Release Android APK` 工作流成功触发（具体运行链接见交付汇报）。
- **验证结论**：通过。仓库已公开上线，自动发包流水线已由 `v0.1.0` 标签触发运行。
- **已知限制**：GitHub Actions 首次 `Release Android APK` 需在云端拉取 Android SDK / NDK 并编译 C++ 原生库，预计耗时 8 到 15 分钟；未配置发布 Keystore Secrets 前，Release 附件采用默认本地测试签名。

## 后续验证建议

1. 在 GitHub Actions 页面关注首个 `Release Android APK` 运行直至绿勾，确认 `v0.1.0` Release 页面已自动附带 `ZeroTally-v0.1.0-android.apk` 与 `.sha256` 校验文件。
2. 如需面向应用市场正式分发，可生成独立发布 Keystore 并配置仓库 Actions Secrets 后重跑工作流。
