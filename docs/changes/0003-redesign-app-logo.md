# 0003 重新设计品牌 Logo 与 Android 自适应图标套件

- **状态**：已执行
- **影响范围**：品牌视觉资源（`assets/brand/`、`assets/*.png`）、Expo 图标与启动页配置（`app.json`）及本地 Release APK 产物（应用业务功能不变，版本保持 `v0.1.0`）
- **生效版本**：v0.1.0
- **前置文档**：[0002-local-android-apk-build.md](0002-local-android-apk-build.md)、[DESIGN.md](../../src/theme/DESIGN.md)
- **替代文档**：无

## 背景

初版项目仅包含纯色占位图作为应用图标与启动页。现结合「简记（keep-accounts）」的深玉青极简财务视觉体系，重新设计全套品牌矢量 Logo，并同步生成符合 Android 自适应图标规范（含 Android 13+ Material You 单色主题图标）与启动页的高清图标，重新打包原生 Release APK。

## 方案

1. **视觉创意**：采用「极简几何账本 + ¥ 徽标」设计。深玉青对角渐变底（`#10998D` 至 `#004929`）配顶左柔和环境光；主体为纯白微光泽硬壳账本卡片，左侧加入浅薄荷书脊装订条、右上角嵌入薄荷青书签飘带、后方衬托微倾 7 度半透明叠页，居中放置深玉青渐变几何精绘 `¥` 徽标。
2. **纯矢量源文件与高清栅格化**：将 5 份 SVG 源图长期保存在 `assets/brand/` 便于后续演进；通过已配置的 `chrome-devtools` MCP 渲染为 1024×1024 RGBA 透明通道 PNG，并逐张肉眼视觉验收（验收阶段定位并修复了 SVG `linearGradient` 默认 `objectBoundingBox` 导致水平/垂直笔画不可见的问题，改为 `userSpaceOnUse` 合并路径并向下微调 14px 优化重心）。
3. **Android 规范适配**：
   - 自适应前景与单色图均缩放至 `0.76x` 居中，严格落在 Android Adaptive Icon 66% 圆形安全区内，兼容圆形、超椭圆与圆角矩形等各类桌面裁切。
   - 在 `app.json` 中同时配置 `foregroundImage`、`backgroundImage`、`monochromeImage` 与 `backgroundColor: "#017853"`，启动页背景色同步为设计系统浅色底 `#F6FBFD`。

## 实施（改动文件清单）

- 新增矢量源图：`assets/brand/icon.svg`、`assets/brand/adaptive-icon-foreground.svg`、`assets/brand/adaptive-icon-background.svg`、`assets/brand/monochrome-icon.svg`、`assets/brand/splash.svg`
- 替换/新增 PNG 资源：`assets/icon.png`、`assets/adaptive-icon.png`、`assets/adaptive-icon-background.png`、`assets/monochrome-icon.png`、`assets/splash.png`
- 修改配置：[app.json](../../app.json)
- 文档更新：[docs/changes/0003-redesign-app-logo.md](0003-redesign-app-logo.md)、[docs/changes/README.md](README.md)、[docs/README.md](../README.md)

## 执行验证记录

- **执行环境**：Windows 11，Node.js `v26.13.1`，pnpm `12.23.0`，`chrome-devtools` MCP，Gradle `9.4.1`，Android SDK Build Tools `37.0.0`。
- **验证步骤与实际输出**：
  1. 矢量栅格化与视觉验收：5 张 PNG 均为 `1024x1024`（RGBA `colorType=6`），通过视觉核对确认主图标、自适应前景、背景渐变、单色主题图标与启动页边缘锐利且 `¥` 笔画完整居中。
  2. `pnpm exec expo prebuild --platform android --clean --no-install && pnpm build:apk`：
     - `BUILD SUCCESSFUL in 2m 40s`（`575 actionable tasks`）
     - `构建完成：D:\keep-accounts\android\app\build\outputs\apk\release\app-release.apk (54.94 MB)`
  3. Android 资源与签名校验：
     - `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` 同时包含 `@mipmap/ic_launcher_background`、`@mipmap/ic_launcher_foreground`、`@mipmap/ic_launcher_monochrome`。
     - `mipmap-xxxhdpi` 生成完整 `ic_launcher.webp`、`ic_launcher_round.webp`、`ic_launcher_foreground.webp`、`ic_launcher_background.webp`、`ic_launcher_monochrome.webp`。
     - `aapt2 dump badging` 确认 `com.keepaccounts.app`、`versionName='0.1.0'`、`application-label:'简记'`、`native-code: 'arm64-v8a' 'x86_64'`。
     - `apksigner verify` 通过（APK Signature Scheme v2）。
  4. `pnpm verify`：版本校验、TypeScript、ESLint 与 8 个测试文件（25 条单测）全部通过。
- **验证结论**：通过。全新品牌 Logo 已完整写入矢量源图、Android 三层自适应图标与独立 Release APK。
- **已知限制**：尚未在实体安卓桌面与系统深色/Material You 壁纸取色主题下实机截屏验收桌面图标视觉效果。

## 后续验证建议

1. 将更新后的 `android/app/build/outputs/apk/release/app-release.apk` 安装到安卓手机或本机模拟器 `Medium_Phone_API_37.0`，检查桌面图标裁切、Android 13+ 主题图标取色及冷启动页过渡效果。
