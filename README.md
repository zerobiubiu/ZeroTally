# ZeroTally（简记）

面向 Android 的本地离线个人记账应用，基于 React Native（Expo SDK 58 + TypeScript + Expo Router + `expo-sqlite`）开发，采用 MIT 协议开源。

## 核心功能

- **支出与收入记账**：快速记一笔、选择预设或自定义分类、绑定资金账户、填写日期与备注，支持编辑与删除。
- **账户间转账**：支持任意两账户间划转（含储蓄卡还信用卡），记入流水但不计入月度支出或收入统计。
- **资产与负债管理**：支持现金、储蓄卡、第三方支付、投资理财与信用卡/负债账户，实时计算总资产、总负债与净资产；记账、改账、删账自动原子联动更新对应账户余额，并支持余额校准与归档停用。
- **月度明细与账务分析**：按月切换查看账单流水、当月支出、收入与结余；点击明细顶部月度卡片直达「账务分析」页，查看近 6 个月趋势、分类占比排行、账户分布、日均支出与结余率。
- **标准结构化导出**：设置页支持一键导出标准缩进 JSON（完整账本快照）与 UTF-8 BOM CSV（兼容 Excel / WPS 表格明细），可直接保存至手机本地目录或通过系统分享发出。
- **异形屏适配与主题**：遵循刘海屏、挖孔屏与手势导航条安全区规范，内容严守系统顶部工具栏下方；底栏采用半高双栏（明细 / 资产）加居中凸起「+ 记一笔」主按钮，设置入口位于顶栏右上角；自动跟随系统浅色与深色模式，遵循 WCAG 对比度与 Android 48dp 触控热区标准。

## 环境要求

- Node.js 22+（用于 Metro / Gradle 脚本与 `node:sqlite` 测试运行时；当前验证环境为 Node 26）
- Bun 1.2+（当前验证环境为 Bun 1.4.5）
- 如需本地运行 Android 模拟器或打包 APK：Android Studio / Android SDK，并配置 `ANDROID_HOME` 与兼容 Gradle 的 JDK（Gradle 9.4.1 支持 JDK 21 与 Android Studio 自带 JBR OpenJDK 25）。

## 快速开始

```bash
# 安装依赖
bun install

# 运行完整校验（版本同步 + 类型检查 + Lint + 单元测试）
bun run verify

# 启动 Expo 开发服务（可在 Android 设备使用 Expo Go 或开发构建预览）
bun run start

# 打本地独立可安装 Android Release APK（默认 arm64-v8a + x86_64）
bun run build:apk

# 仅打主流安卓真机 arm64-v8a 架构（体积更小）
bun run build:apk --abis arm64-v8a
```

打包完成后，APK 输出至 `android/app/build/outputs/apk/release/app-release.apk`。Windows 下构建路径兼容细节见 [docs/troubleshooting/0001-windows-android-apk-build.md](docs/troubleshooting/0001-windows-android-apk-build.md)。

## 自动构建与发布（GitHub Actions）

- **CI 校验（`.github/workflows/ci.yml`）**：每次推送到 `main` 或发起 Pull Request 时自动执行 `bun run verify`。
- **APK 自动打包与 Release 发布（`.github/workflows/release-apk.yml`）**：推送 `v*` 标签（如 `v0.1.0`）或在 Actions 页面手动触发时，自动完成质量校验、`expo prebuild`、编译独立 Android Release APK 并发布至 GitHub Release（附带 `.sha256` 校验文件）。
- 如需使用正式发布签名，可在仓库 Settings -> Secrets and variables -> Actions 中配置 `ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`；未配置时默认使用本地测试签名。

## 项目文档

所有架构说明、设计决策、变更记录与排查文档集中在 [docs/README.md](docs/README.md)。

## 开源协议

本项目基于 [MIT License](LICENSE) 开源。
