# 0011 记一笔分类网格紧凑化与单行 5 列展示

- **状态**：已执行
- **影响范围**：`src/features/categories/components/CategoryHierarchyPicker.tsx`、`app/record.tsx`
- **前置文档**：[0008-two-level-categories-and-custom-keypad.md](0008-two-level-categories-and-custom-keypad.md)
- **生效版本**：v0.3.2

## 背景

原记一笔页分类网格采用每行 4 列且图标尺寸偏大，在展开二级抽屉后占用较多纵向空间，一屏可见分类数量有限。本次调整缩小一级与二级分类图标及单元格尺寸，将每行展示数量提升至 5 列，提高单屏可见密度。

## 方案

1. **列数提升与尺寸紧凑化**（[CategoryHierarchyPicker.tsx](../../src/features/categories/components/CategoryHierarchyPicker.tsx)）：
   - 一级与二级网格统一调整为 `5` 列（`GRID_COLUMNS = 5`），顶部展开指示条按列中心自动对齐（`10% / 30% / 50% / 70% / 90%`）；
   - 一级图标圈由 `44px`（图标 `22px`）缩至 `36px`（图标 `18px`），单元格最小高度由 `74px` 缩至 `60px`，右下角展开角标缩至 `14px`；
   - 二级图标圈由 `34px`（图标 `16px`）缩至 `28px`（图标 `14px`），单元格最小高度由 `62px` 缩至 `52px`；
   - 分类名称保持单行并开启 `adjustsFontSizeToFit`（`minimumFontScale={0.85}`），兼顾 4–5 字分类名不截断。
2. **容器边距配合收紧**（[app/record.tsx](../../app/record.tsx)）：分类区水平与顶部内边距由 `12px` 收紧至 `8px`，为 5 列提供充足横向空间。
3. **版本递增**：按兼容优化规则递增至 `v0.3.2`（Android `versionCode: 5`）。

## 实施（改动文件清单）

- [src/features/categories/components/CategoryHierarchyPicker.tsx](../../src/features/categories/components/CategoryHierarchyPicker.tsx)、[app/record.tsx](../../app/record.tsx)
- [package.json](../../package.json)、[app.json](../../app.json)、[app/settings.tsx](../../app/settings.tsx)、[CHANGELOG.md](../../CHANGELOG.md)
- [docs/changes/0011-compact-record-category-grid.md](0011-compact-record-category-grid.md)、[docs/changes/README.md](README.md)、[docs/README.md](../README.md)

## 执行验证记录

- **执行环境**：Windows / PowerShell，Bun + TypeScript 6 + ESLint 9 + Vitest 5.1.1
- **验证命令**：`bun run verify`
- **实际输出**：
  - `check:version`：`版本校验通过：v0.3.2`
  - `tsc --noEmit`：0 错误
  - `eslint .`：0 错误、0 警告
  - `vitest run`：`Test Files 14 passed (14)`，`Tests 50 passed (50)`（234ms）
- **验证结论**：静态检查、规范校验与全量单元测试通过。
- **已知限制**：尚未在真机/模拟器安装 `v0.3.2` 核验窄屏（360dp）下 5 列文字缩放观感。

## 后续验证建议

1. 打包安装 `v0.3.2` APK 后，在记一笔页核验支出/收入 5 列一级图标、展开二级抽屉后的对齐与一屏可见行数。
