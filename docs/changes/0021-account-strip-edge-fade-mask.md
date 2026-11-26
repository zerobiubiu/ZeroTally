# 0021 记账页横向账户条边缘柔和渐变遮罩优化

- **状态**：已执行
- **影响范围**：`src/features/transactions/components/RecordKeypad.tsx`、`src/features/settings/components/SettingsPanel.tsx`、版本清单与变更日志
- **生效版本**：v0.8.1（Android `versionCode: 15`）
- **前置文档**：[0014-fix-tabs-structure-and-record-keypad-order.md](0014-fix-tabs-structure-and-record-keypad-order.md)、[0020-category-account-memory.md](0020-category-account-memory.md)

## 背景

此前记一笔键盘上方融合条（`selectorStrip`）中，左侧横向直选账户条与右侧固定日期按钮之间放置了一根硬竖线（`stripDivider`），当账户卡片超出可视宽度时会在右缘被直接生硬裁切（滑动后左缘同样存在硬裁切）。现替换为基于 React Native 0.88 原生线性渐变的左右动态遮罩，使账户条边缘与日期按钮之间形成柔和自然的视觉过渡。

## 方案

1. **移除生硬分隔竖线**：移除 `selectorStrip` 内的 `stripDivider` 竖线，改用自然留白衔接日期卡片，收支与转账两态保持统一克制的去线风格。
2. **原生线性渐变左右动态遮罩（零新增依赖）**：
   - 利用 React Native 0.88.1 原生支持的 `ViewStyle.backgroundImage`（结构化 `linear-gradient`）与 `hexToRgba` 辅助函数，直接依据当前主题的 `theme.colors.surfaceRaised`（浅色 `#ffffff` / 深色 `#222435`）生成 4 档缓动透明色标（`0% → 0`、`36% → 0.34`、`74% → 0.84`、`100% → 1`），规避 CSS `transparent` 在浅色底上插值发灰的问题。
   - 右侧叠加 `38dp` 宽（`pointerEvents="none"`）的淡出遮罩，左侧叠加 `24dp` 宽的淡入遮罩，均随 `ScrollView` 实时滚动偏移与容器/内容宽度按需显隐：位于最左端时不遮挡首张卡片，滑到最右端时右遮罩自动退场，确保末张卡片完整清晰。
3. **自动滚动避让遮罩余量**：将 `ensureSelectedAccountVisible` 的左右安全可视余量调至 `28dp` / `42dp`，并同步静默滚动时的偏移状态，确保按分类记忆自动带出的账户卡片始终完全避开渐变区、清晰高亮展示。

## 实施（改动文件清单）

- 修改：`src/features/transactions/components/RecordKeypad.tsx`、`src/features/settings/components/SettingsPanel.tsx`。
- 版本与文档：`package.json`、`app.json`、`CHANGELOG.md`、`docs/changes/0021-account-strip-edge-fade-mask.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows（PowerShell），Bun + TypeScript 6 + ESLint 9 + Vitest 5
- **验证命令**：`bun run verify`（依次执行 `check:version`、`tsc --noEmit`、`eslint .`、`vitest run`）
- **实际输出**：
  - `node scripts/check-version.mjs`：`版本校验通过：v0.8.1`
  - `tsc --noEmit`：0 错误退出
  - `eslint .`：0 错误、0 警告退出
  - `vitest run`：`Test Files 15 passed (15)`，`Tests 58 passed (58)`（250ms）
- **验证结论**：通过。
- **已知限制**：本次仅执行静态类型检查、Lint 与单元测试，尚未重新打包 `v0.8.1` Android Release APK 在真机验证浅/深色模式下渐变平滑度与滑动显隐过渡。

## 后续验证建议

- 构建 `v0.8.1` Android Release APK 安装至真机核验：
  1. 记一笔初始位置（5 个账户）下，右侧溢出卡片经 38dp 柔和渐变淡入白底/深色底，与「今天」日期按钮之间无生硬切割线；
  2. 向左滑动账户条后左侧出现柔和渐变遮罩，滑至最右端（信用卡）时右侧遮罩自动隐去，末张卡片完整锐利；
  3. 切换浅色与深色模式，渐变遮罩均无缝融入底色无灰边，且切换分类自动滚入的记忆账户卡片完全避开遮罩区。
