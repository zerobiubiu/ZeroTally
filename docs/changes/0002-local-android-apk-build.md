# 0002 打通本地 Android 原生 Release APK 打包流程

- **状态**：已执行
- **影响范围**：本地 Android 原生构建工具链、pnpm hoisting 配置与 Expo Config Plugin（不改变应用业务行为，版本保持 `v0.1.0`）
- **生效版本**：v0.1.0
- **前置文档**：[0001-initial-mvp.md](0001-initial-mvp.md)、[0001-windows-android-apk-build.md](../troubleshooting/0001-windows-android-apk-build.md)
- **替代文档**：无

## 背景

在首版 `v0.1.0` 完成并验证通过的基础上，进一步打通本机离线 Android 原生 Release APK 打包能力，输出内置 JS/Hermes 字节码、可直接安装到主流 64 位安卓真机（`arm64-v8a`）与本机模拟器（`x86_64`）的独立 APK。

## 方案

1. **修正 pnpm v12 依赖扁平化配置**：用 `pnpm-workspace.yaml`（`nodeLinker: hoisted`）替换在 pnpm v12 中失效的 `.npmrc`，确保 Babel 解析 `babel-preset-expo` 与原生 CMake 路径缩短。
2. **新增 Windows CMake 路径兼容 Config Plugin**：编写 `plugins/with-windows-cmake-path-fix.js` 并在 `app.json` 注册，将 CMake staging 目录迁至项目根目录 `.c/`，同时缩短自动链接目录别名并建立短目录联接（`mklink /J`），彻底规避 Windows Win32 248 / Ninja 260 字符路径上限。
3. **提供一键打包脚本**：新增 `scripts/build-android-apk.mjs` 并暴露 `pnpm build:apk`，自动探测 `ANDROID_HOME` 与 Android Studio JBR（OpenJDK 25）、按需执行 `expo prebuild`、写入 `android/local.properties` 并调用 Gradle 编译（默认 `release`、`arm64-v8a,x86_64`，支持 `--variant` 与 `--abis` 参数）。
4. **清理过期配置**：移除 `app.json` 中 Expo SDK 58 已废弃的 `android.edgeToEdgeEnabled` 字段；在 `.gitignore` 新增 `/.c`。

## 实施（改动文件清单）

- 新增：[pnpm-workspace.yaml](../../pnpm-workspace.yaml)、[plugins/with-windows-cmake-path-fix.js](../../plugins/with-windows-cmake-path-fix.js)、[scripts/build-android-apk.mjs](../../scripts/build-android-apk.mjs)
- 删除：`.npmrc`
- 修改：[app.json](../../app.json)、[package.json](../../package.json)、[.gitignore](../../.gitignore)、[AGENTS.md](../../AGENTS.md)、[README.md](../../README.md)
- 文档：[docs/troubleshooting/0001-windows-android-apk-build.md](../troubleshooting/0001-windows-android-apk-build.md)、[docs/troubleshooting/README.md](../troubleshooting/README.md)、[docs/changes/0002-local-android-apk-build.md](0002-local-android-apk-build.md)、[docs/changes/README.md](README.md)、[docs/README.md](../README.md)
- 本地原生构建产物（已由 `.gitignore` 忽略，不入库）：`android/app/build/outputs/apk/release/app-release.apk`

## 执行验证记录

- **执行环境**：Windows 11（`LongPathsEnabled=0`），Node.js `v26.13.1`，pnpm `12.23.0`，Android Studio JBR OpenJDK `25.0.4`，Gradle `9.4.1`，Android SDK `compileSdk 37` / `targetSdk 36` / `buildTools 37.0.0` / `NDK 27.1.12297006` / `CMake 3.22.1`。
- **验证命令与实际输出**：
  1. `pnpm build:apk`：
     - `BUILD SUCCESSFUL in 1m 49s`（`575 actionable tasks: 71 executed, 504 up-to-date`）
     - `构建完成：D:\keep-accounts\android\app\build\outputs\apk\release\app-release.apk (54.60 MB)`（精确字节数 `57,255,012`）
  2. `aapt2 dump badging android/app/build/outputs/apk/release/app-release.apk`：
     - `package: name='com.keepaccounts.app' versionCode='1' versionName='0.1.0' compileSdkVersion='37'`
     - `targetSdkVersion:'36'`
     - `application-label:'简记'`
     - `native-code: 'arm64-v8a' 'x86_64'`
  3. `apksigner verify --verbose --print-certs android/app/build/outputs/apk/release/app-release.apk`：
     - `Verifies`，`Verified using v2 scheme (APK Signature Scheme v2): true`，签名者 `CN=Android Debug`（RSA 2048）
  4. `pnpm verify`：
     - `版本校验通过：v0.1.0`
     - `tsc --noEmit`：0 错误
     - `eslint .`：0 错误、0 警告
     - `vitest run`：8 个测试文件、25 条用例全部通过（165ms）
- **验证结论**：通过。独立离线 Android Release APK 编译、R8 混淆压缩、Hermes 字节码内嵌、双 ABI 打包与 v2 签名校验均已验证通过。
- **已知限制**：
  1. 当前 APK 使用 Android 默认本地调试签名（`debug.keystore`），适合个人真机/模拟器安装测试；如需上架应用商店，需生成独立发布 keystore 并配置正式签名。
  2. 尚未启动模拟器或连接实体手机执行真机安装与人工界面交互验收。

## 后续验证建议

1. 连接安卓真机（开启 USB 调试）或启动模拟器 `Medium_Phone_API_37.0` 后，执行 `adb install -r android\app\build\outputs\apk\release\app-release.apk` 验证应用启动与记账/资产/调账全流程。
2. 若只需真机最小包体，可执行 `pnpm build:apk --abis arm64-v8a` 仅打 64 位 ARM 架构以进一步缩小体积。
