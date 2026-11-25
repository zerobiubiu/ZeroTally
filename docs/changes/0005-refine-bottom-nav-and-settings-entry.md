# 0005 优化底部导航结构与设置入口层级

- **状态**：已执行
- **影响范围**：底部导航布局（`app/(tabs)/_layout.tsx`）、首页与资产页顶栏（`app/(tabs)/index.tsx`、`app/(tabs)/assets.tsx`）、设置页路由迁移（`app/settings.tsx`、`app/_layout.tsx`）及架构与设计文档
- **生效版本**：v0.1.0
- **前置文档**：[0001-initial-mvp.md](0001-initial-mvp.md)、[overview.md](../architecture/overview.md)
- **替代文档**：无

## 背景

个人记账软件的核心高频动作是快速「记一笔」。原底栏将低频的「设置」与高频的「明细」「资产」并列为 3 栏，且主按钮悬浮在底栏上方占用额外垂直空间。现按核心使用频率重新调整信息层级，把「+ 记一笔」提升为底栏正中最突出的主视觉入口。

## 方案

1. **半高双栏 + 居中凸起「+」底栏**：
   - 将底栏精简为左右对称的 **明细** 与 **资产**（实体底栏体高度压缩为 54dp + 底部安全区），弱化非核心占位。
   - 正中放置 54dp 实心深玉青圆形 **「+」记一笔**主按钮，外圈叠加 4px 与页面背景色一致的环状描边（浅色 `#F6FBFD` / 深色 `#11121F`）形成自然嵌合凹槽感，并向上凸出底栏上沿 26dp；底部对齐「记一笔」小号标签，使单手拇指热区与视觉优先级均为全屏最高。
   - 外层容器采用 `height = barTotalHeight + FAB_PROTRUSION` 与 `pointerEvents="box-none"`，确保 Android 平台凸出底栏上沿的按钮上半部分完整可点击，不发生父容器触控裁切。
2. **设置入口上移至顶栏右上角**：
   - 移除 `app/(tabs)/settings.tsx`，迁移为根 Stack 独立二级页 `app/settings.tsx`（避免安卓侧滑返回手势与左侧抽屉冲突，单点直达）。
   - 在明细页（`app/(tabs)/index.tsx`）与资产页（`app/(tabs)/assets.tsx`）右上角统一放置圆形设置图标按钮（40dp 视觉尺寸 + 4dp `hitSlop`，满足 Android 48dp 触控热区标准）。

## 实施（改动文件清单）

- 新增：[app/settings.tsx](../../app/settings.tsx)
- 删除：`app/(tabs)/settings.tsx`
- 修改：[app/(tabs)/_layout.tsx](../../app/(tabs)/_layout.tsx)、[app/_layout.tsx](../../app/_layout.tsx)、[app/(tabs)/index.tsx](../../app/(tabs)/index.tsx)、[app/(tabs)/assets.tsx](../../app/(tabs)/assets.tsx)
- 文档更新：[docs/architecture/overview.md](../architecture/overview.md)、[src/theme/DESIGN.md](../../src/theme/DESIGN.md)、[docs/changes/0005-refine-bottom-nav-and-settings-entry.md](0005-refine-bottom-nav-and-settings-entry.md)、[docs/changes/README.md](README.md)、[docs/README.md](../README.md)

## 执行验证记录

- **执行环境**：Windows 11，Bun `1.4.5`，Node.js `v26.13.1`，Expo SDK `58.0.26`，TypeScript `6.0.3`，Vitest `5.1.1`。
- **验证命令与实际输出**：
  1. `bun run verify`：
     - `版本校验通过：v0.1.0`
     - `tsc --noEmit`：0 错误
     - `eslint .`：0 错误、0 警告
     - `vitest run`：8 个测试文件、25 条测试用例全部通过（144ms）
  2. `bun x expo export --platform android --output-dir .expo/verify-nav`：
     - Metro 成功打包 1216 个模块（9455ms），输出 2.8MB Hermes 字节码与 27 项资源，验证结束后已删除临时目录。
- **验证结论**：通过。路由结构、类型、代码规范、核心业务测试与 Android Metro/Hermes 打包均无异常。
- **已知限制**：本次仅完成代码级几何尺寸核算与 Android JS 打包验证，尚未重编原生 APK 或在模拟器/真机上截屏实测凸起按钮在深浅色模式及系统手势导航条上的最终像素呈现。

## 后续验证建议

1. 如需将新版底栏与设置入口打入独立安装包，运行 `bun run build:apk` 重新生成最新 `app-release.apk` 后安装验证。
2. 实机重点检查：居中凸起「+」按钮上半凸出区域的点击响应、浅色与深色模式下外环描边与页面背景衔接效果、列表滚到底部时不被凸起按钮遮挡。
