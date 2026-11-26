# 0010 明细左滑复现 iOS 联动拉出与橡皮筋回弹动效

- **状态**：已执行
- **影响范围**：`src/features/transactions/components/TransactionRow.tsx`
- **前置文档**：[0009-ledger-swipe-detail-sheet-and-refund.md](0009-ledger-swipe-detail-sheet-and-refund.md)
- **生效版本**：v0.3.1

## 背景

`v0.3.0` 中的左滑菜单采用「前景记录行覆盖静止底层按钮」的两层揭露结构，左滑时按钮原地不动，与 iOS 原生列表（`UISwipeActionsConfiguration`）中操作按钮随记录行自右边缘横向带出并等比展开的手感存在差距。

## 方案

重构 [TransactionRow.tsx](../../src/features/transactions/components/TransactionRow.tsx) 的左滑容器与原生驱动动画（全链路 `useNativeDriver: true`，零新增依赖）：

1. **自右边缘横向带出（iOS 手风琴比例）**：静息态（`translateX = 0`）所有操作按钮均位于右侧可视区外；左滑过程中，第 `i` 个按钮按 `(N - i) / N` 的行程比例与记录行同步自右向左平推展开，最左侧按钮紧贴记录行右缘，各按钮匀速平分当前拉出宽度，图标与文字随位移渐显。
2. **橡皮筋阻尼超拉与无缝背景**：继续向左拉过操作区总宽时，施加 `0.28` 阻尼系数（上限 `44px`）模拟 iOS 橡皮筋拉伸；视口预留超拉宽位并辅以单按钮延伸底色，保证超拉全程按钮等比延展且无裁切或缝隙。
3. **带速度弹性回弹与全区右滑收起**：将 `GestureDetector` 提升至整行容器，支持在按钮区直接右滑收起，松手时将 `velocityX` 传入 `Animated.spring`（`stiffness: 280`、`damping: 30`、`mass: 0.9`）实现干脆的 iOS 弹性回弹。
4. **版本递增**：按兼容优化规则递增至 `v0.3.1`（Android `versionCode: 4`）。

## 实施（改动文件清单）

- [src/features/transactions/components/TransactionRow.tsx](../../src/features/transactions/components/TransactionRow.tsx)
- [package.json](../../package.json)、[app.json](../../app.json)、[app/settings.tsx](../../app/settings.tsx)、[CHANGELOG.md](../../CHANGELOG.md)
- [docs/changes/0010-ios-style-swipe-action-animation.md](0010-ios-style-swipe-action-animation.md)、[docs/changes/README.md](README.md)、[docs/README.md](../README.md)

## 执行验证记录

- **执行环境**：Windows / PowerShell，Bun + TypeScript 6 + ESLint 9 + Vitest 5.1.1
- **验证命令**：`bun run verify`
- **实际输出**：
  - `check:version`：`版本校验通过：v0.3.1`
  - `tsc --noEmit`：0 错误
  - `eslint .`：0 错误、0 警告
  - `vitest run`：`Test Files 14 passed (14)`，`Tests 50 passed (50)`（205ms）
- **验证结论**：静态检查、规范校验与全量单元测试全部通过。
- **已知限制**：尚未重打 `v0.3.1` APK 并在真机实测手势阻尼与动画帧率。

## 后续验证建议

1. 如需真机验收，可执行 `bun x expo prebuild --platform android --no-install && bun run build:apk` 打包 `v0.3.1` APK 安装，重点检查缓慢拖出、快速轻扫、超拉橡皮筋回弹以及从按钮区右滑关闭的流畅度。
