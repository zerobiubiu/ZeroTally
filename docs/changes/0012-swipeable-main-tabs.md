# 0012 主界面支持左右滑动切换明细与资产

- **状态**：已执行
- **影响范围**：`app/(tabs)/_layout.tsx`、`app/(tabs)/index.tsx`
- **前置文档**：[0005-refine-bottom-nav-and-settings-entry.md](0005-refine-bottom-nav-and-settings-entry.md)、[0010-ios-style-swipe-action-animation.md](0010-ios-style-swipe-action-animation.md)
- **生效版本**：v0.4.0

## 背景

应用底栏包含「明细」与「资产」两个主页面（居中为凸起「+ 记一笔」按钮），此前仅支持点击底栏切换。本次变更为双主界面增加左右跟手滑动切页能力，并与明细单行左滑菜单、纵向滚动和平滑底栏切换保持协同无冲突。

## 方案

1. **自定义可滑动 Tab 导航器**（[app/(tabs)/_layout.tsx](../../app/(tabs)/_layout.tsx)）：
   - 使用 Expo Router SDK 58 原生 `createStandardRouterNavigator(SwipeTabsContent, TabRouter, { activityDefaultThreshold: 2 })` 搭配 `activityEnabled={false}`，保留全部文件路由与底栏设计，同时保证「明细」与「资产」双页常驻可见、滑动过程不白屏；
   - 两页横向排布在 `Animated.View` 轨道中，结合 `react-native-gesture-handler` v3 `usePanGesture`（`useNativeDriver: true`）实现 1:1 跟手拖动、边缘 `0.2` 阻尼抗拉、超 28% 屏宽或轻扫速度触发切页并带速度弹性回弹；
   - 点击底栏「明细 / 资产」同样触发横向弹性滑动，屏幕宽度变化时同步校准位移。
2. **手势冲突隔离**：
   - 首屏（明细）仅响应左滑切资产、末屏（资产）仅响应右滑切明细；
   - 切页水平激活阈值设为 `18px`（高于 `TransactionRow` 单行左滑的 `10px`），纵向容差 `failOffsetY: [-12, 12]`；
   - 由此确保在明细单条记录上左滑优先拉出「退款 / 修改 / 删除」菜单，而在顶栏、月度总览卡、日期分组头、空白处、底栏左滑以及在资产页任意位置右滑均可顺滑切换页面。
3. **失焦自动收起行内菜单**（[app/(tabs)/index.tsx](../../app/(tabs)/index.tsx)）：接入 `useIsFocused()`，切至资产页或进入子页时自动收起已展开的单行操作菜单。
4. **版本递增**：新增兼容交互功能，按项目版本规则递增至 `v0.4.0`（Android `versionCode: 6`）。

## 实施（改动文件清单）

- [app/(tabs)/_layout.tsx](../../app/(tabs)/_layout.tsx)、[app/(tabs)/index.tsx](../../app/(tabs)/index.tsx)
- [package.json](../../package.json)、[app.json](../../app.json)、[app/settings.tsx](../../app/settings.tsx)、[CHANGELOG.md](../../CHANGELOG.md)
- [docs/changes/0012-swipeable-main-tabs.md](0012-swipeable-main-tabs.md)、[docs/changes/README.md](README.md)、[docs/README.md](../README.md)

## 执行验证记录

- **执行环境**：Windows / PowerShell，Bun + TypeScript 6 + ESLint 9 + Vitest 5.1.1
- **验证命令**：`bun run verify`
- **实际输出**：
  - `check:version`：`版本校验通过：v0.4.0`
  - `tsc --noEmit`：0 错误
  - `eslint .`：0 错误、0 警告
  - `vitest run`：`Test Files 14 passed (14)`，`Tests 50 passed (50)`（230ms）
- **验证结论**：静态门禁、规范检查与全量自动化测试全部通过。
- **已知限制**：尚未重打 `v0.4.0` APK 并在真机实测明细单行左滑与整页左滑的嵌套手势手感。

## 后续验证建议

1. 打包安装 `v0.4.0` APK 后，实测：
   - 明细页顶部总览卡/日期栏/底栏左滑平滑切入资产页，资产页任意位置右滑平滑切回明细页；
   - 明细页在单条记录上左滑仍正常带出 iOS 风格「退款 / 修改 / 删除」按钮，不误触发切页；
   - 上下滚动与下拉刷新在两页均流畅无卡顿。
