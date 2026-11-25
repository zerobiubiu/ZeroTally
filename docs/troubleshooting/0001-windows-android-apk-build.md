# 0001 Windows 本地编译 Android 原生 APK 常见问题与解决方案

- **状态**：参考
- **影响范围**：Windows 环境下 `bun install`、`bun x expo prebuild --platform android`、`bun run build:apk`
- **生效版本**：v0.1.0

## 结论

在 Windows 11（`LongPathsEnabled=0`）+ Expo SDK 58 环境下打本地原生 APK，必须同时满足两项配置，本项目均已内置自动化处理：

1. 保持扁平 `node_modules`（当前通过 `bunfig.toml` 显式配置 `[install] linker = "hoisted"`），避免隔离虚拟存储符号链接导致 Babel 解析不到 `babel-preset-expo` 或拉长 CMake 路径。
2. 通过本地 Expo Config Plugin `plugins/with-windows-cmake-path-fix.js` 缩短 CMake staging 目录与自动链接目录路径，避免触发 Win32 `mkdir` 248 字符与 Ninja 260 字符上限。

## 问题一：Metro `export:embed` 报错 `Cannot find module 'babel-preset-expo'`

- **现象**：使用隔离依赖结构（非 hoisted 扁平 `node_modules`）时，Gradle 执行 `:app:createBundleReleaseJsAndAssets` 失败，提示 `@babel/core` 无法解析 `babel-preset-expo`；同时 CMake 输出 `CMAKE_OBJECT_PATH_MAX` 路径长度警告。
- **根因**：隔离式虚拟存储目录嵌套较深且隔离传递依赖，既阻碍 Babel 向上解析 `babel-preset-expo`，又使 CMake 源码路径增加约 80 个字符。
- **解决方案**：
  1. 在根目录 `bunfig.toml` 显式配置 `[install] linker = "hoisted"`。
  2. 执行 `bun install` 重建扁平 `node_modules`（确认 `node_modules/babel-preset-expo` 存在且 `node_modules/react-native-screens` 为真实目录）。
  3. 切换包管理器或重新安装依赖后，若 `android/` 留有旧自动链接缓存，执行 `bun x expo prebuild --platform android --clean --no-install` 重建 `android/`。

## 问题二：`:app:buildCMakeRelWithDebInfo` 报错路径超出 248 / 260 字符上限

- **现象**：
  - `ninja: error: Stat(rngesturehandler_codegen_autolinked_build/.../RNGestureHandlerDetectorShadowNode.cpp.o): Filename longer than 260 characters`
  - `ninja: error: mkdir(.../react_codegen_safeareacontext.dir/.../safeareacontext): No such file or directory`
- **根因**：Windows 系统注册表 `LongPathsEnabled=0` 时，Win32 API 限制目录路径不超过 248 字符、文件路径不超过 260 字符；同时 CMake 的 Ninja 生成器不会像 Makefile 生成器那样自动哈希长对象路径，AGP 还会默认拼接较长的 `.cxx/RelWithDebInfo/<hash>/<abi>/<pkg>_autolinked_build/` 路径。
- **已否决方案**：
  - 仅传 `-DCMAKE_OBJECT_PATH_MAX=180`：Ninja 生成器只打印警告，不缩短实际 `.o` 文件名。
  - 使用 `subst X: D:\keep-accounts`：将 `package.json` 置于盘符根目录 `X:\` 会导致 `expo-modules-autolinking` 向上查找 `package.json` 失败。
- **采用方案**：通过 `plugins/with-windows-cmake-path-fix.js` 向 `android/app/build.gradle` 注入两项无侵入配置：
  1. 设置 `externalNativeBuild.cmake.buildStagingDirectory` 指向项目根目录 `.c/`（已在 `.gitignore` 忽略）。
  2. 在 `generateAutolinkingNewArchitectureFiles` 任务的 `doLast` 钩子中，将 `Android-autolinking.cmake` 的子目录别名压缩为单字符（`g`/`r`/`s`/`n`/`w`），并在 Windows 下于 `.c/1` 到 `.c/5` 创建指向对应 RN 原生包根目录的 NTFS 目录联接（`mklink /J`，无需管理员权限）。所有中间产物仍完全留在项目目录内，不影响任何 `.so` 库名或运行时行为。
