# 0044：锁死正式发布签名链路、开启 R8 资源压缩瘦身与 P0 阶段 APK 校验

- **状态**：已执行
- **影响范围**：`package.json`、`app.json`、`CHANGELOG.md`、`.gitignore`、`plugins/with-release-signing-and-shrink.js`、`scripts/generate-release-keystore.mjs`、`scripts/build-android-apk.mjs`、`.github/workflows/release-apk.yml`、`docs/architecture/overview.md`
- **生效版本**：v1.8.4（Android `versionCode: 38`）
- **前置文档**：[0043-privacy-and-security-center.md](0043-privacy-and-security-center.md)

## 背景

此前本地 `build:apk` 与未配置 Secrets 的 GitHub Actions Release 流程均会静默回退至 Android `debug.keystore` 签名，存在首版外发后因签名不固定导致后续版本无法覆盖升级的致命风险；同时 `android.enableShrinkResourcesInReleaseBuilds` 未默认开启，Release APK 体积偏大。

## 方案

1. **Expo 原生构建插件（`plugins/with-release-signing-and-shrink.js`）**：
   - 自动在 `android/gradle.properties` 中启用 `android.enableMinifyInReleaseBuilds=true` 与 `android.enableShrinkResourcesInReleaseBuilds=true`。
   - 注入 Gradle `signingConfigs.release` 与 `taskGraph.whenReady` 发布门禁：默认要求提供正式 Keystore 凭据，缺失且未显式声明 `zerotallyAllowDebugSigning=true` 时直接抛出 `GradleException` 拒绝隐式回退 debug 签名。
2. **仓库外正式 Keystore 生成脚本（`scripts/generate-release-keystore.mjs` / `bun run keystore:init`）**：
   - 默认在仓库外 `~/.zerotally-keys/zerotally-release.keystore` 生成 RSA-2048（10000 天有效）PKCS12 Keystore 并写入被 `.gitignore` 忽略的 `signing.local.json`，显式拒绝将密钥写入 Git 仓库目录内，同时输出证书 SHA-256 指纹与 GitHub Actions Secrets 接入指引。
3. **本地构建与 CI 发布双层锁死**：
   - `scripts/build-android-apk.mjs` 优先读取环境变量或 `signing.local.json`；未配置时直接失败中断，仅支持本机显式 `--allow-debug-signing` 自测。
   - `.github/workflows/release-apk.yml` 在 `v*` Tag 发布时强制校验 4 项正式签名 Secrets 齐全，缺失直接失败并执行 `apksigner verify --verbose` 产物校验。

## 实施（改动文件清单）

- **版本与忽略规则**：`package.json`（`1.8.4` + `keystore:init`）、`app.json`（`1.8.4` / `versionCode: 38` + 注册插件）、`CHANGELOG.md`、`.gitignore`。
- **签名与构建工程**：新增 `plugins/with-release-signing-and-shrink.js`、`scripts/generate-release-keystore.mjs`；更新 `scripts/build-android-apk.mjs`、`.github/workflows/release-apk.yml`。
- **文档与索引**：`docs/architecture/overview.md`、`docs/changes/0044-strict-release-signing-and-r8-shrink.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows 11（PowerShell）、Bun `1.4.5`、Node.js（`node:sqlite`）、Android SDK Build-Tools `37.0.0`、Android Studio JBR。
- **验证命令与实际输出**：
  1. `bun run verify`：版本校验 `v1.8.4`、TypeScript 0 错误、ESLint 0 警告、`vitest run` 28 个测试文件共 116 项单测全部通过。
  2. 无正式 Keystore 直接执行 `bun run build:apk`：发布门禁按预期拦截退出（`GATE_REJECT_EXIT=1`），拒绝隐式回退 debug 签名。
  3. P0 阶段 APK 自测构建（`bun x expo prebuild --platform android --no-install && bun run build:apk -- --allow-debug-signing`）：
     - `BUILD SUCCESSFUL in 3m 24s`（`minifyReleaseWithR8` + `convertShrunkResourcesToBinaryRelease` + `optimizeReleaseResources` 均成功执行）
     - 产物：`D:\keep-accounts\android\app\build\outputs\apk\release\app-release.apk`（`59,742,292` 字节 / `56.97 MB`，在新增生物识别与防截屏两个原生模块后体积反较 v1.7.1 缩减 `0.70 MB`）
  4. `aapt2` + `apksigner` + SHA-256：
     - `package: name='com.keepaccounts.app' versionCode='38' versionName='1.8.4'`，`application-label:'ZeroTally'`，`native-code: 'arm64-v8a' 'x86_64'`
     - `apksigner verify --verbose`：`Verifies`（APK Signature Scheme v2: `true`，`Number of signers: 1`）
     - SHA-256：`AC6811262716B17721790B0156187ACF29CB9917448218AB4D2D29A0CD7D4AD9`
- **验证结论**：P0 全部 5 项能力（搜索多维筛选、90% 懒加载分页、全局崩溃边界与隐私自洽、个性化隐私与安全中心、正式发布签名硬门禁与 R8 瘦身）均通过自动化验证及阶段 APK 构建校验。
- **已知限制**：本次阶段 APK 使用 `--allow-debug-signing` 仅作本机工程验证，严禁外发；正式发布前请由开发者自行执行 `bun run keystore:init` 生成并离线备份唯一正式 Keystore。

## 后续验证建议

1. 准备首次公开发布前执行 `bun run keystore:init`，将生成的 Keystore 与密码离线保存多份，并在 GitHub 仓库配置 4 项 `ANDROID_KEYSTORE_*` Secrets。
2. 真机安装 P0 阶段测试 APK，逐项核对搜索、懒加载、隐私锁与生物识别交互。
