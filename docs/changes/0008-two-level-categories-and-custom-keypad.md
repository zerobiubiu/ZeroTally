# 0008 记一笔页面重构：二级分类体系与自制数字计算键盘

- **状态**：已执行
- **影响范围**：`app/`、`src/db/`、`src/features/categories/`、`src/features/transactions/`、`src/features/analytics/`、`src/features/export/`、`src/shared/date/`
- **前置文档**：[0006-ui-cutout-copy-analytics-export.md](0006-ui-cutout-copy-analytics-export.md)
- **生效版本**：v0.2.0

## 背景

原「记一笔」页面采用表单自上而下排布，金额位于顶部且依赖系统小数键盘、日期与备注均为普通输入框，且收支分类采用一级平铺，日常高频记账（如餐饮细分为早/午/晚餐、饮品、外卖等）与单手快速录额不够顺手。

本次变更结合参考交互布局与简记（ZeroTally）既有的深玉青极简视觉体系（不照搬配色与装饰），重构记账页与分类体系，实现：

1. 收支分类全面升级为「一级 + 二级」两级结构，并兼容 v0.1.0 已有账目无缝升级；
2. 记一笔页面改为「上方二级分类网格 + 下方备注/金额栏与自制 4×4 数字计算键盘」，仅备注输入框唤起系统键盘；
3. 账户与日期收敛为键盘上方快捷胶囊，通过自制底部面板选择（不引入新依赖）；
4. 统计分析按一级分类归集、分类管理页同步支持两级增删改、流水与导出保留父子分类信息。

## 方案

1. **数据库与分类领域层（Schema v2）**：
   - `src/db/schema.ts` 升级至 Schema v2，为 `categories` 表新增可空自引用外键 `parent_id` 及索引 `idx_categories_parent_id`。
   - `src/features/categories/presets.ts` 保留 v0.1.0 全部 18 个一级分类 ID（支出 11 + 收入 7），并按一级挂接 64 个预设二级分类（共 82 项），`seedDefaultData` 改为按 ID `INSERT OR IGNORE` 补齐且继承上级停用状态。
   - `src/features/categories/rules.ts` / `repository.ts` / `service.ts` 落实两级层级约束：禁止三级嵌套与跨类型挂载、同级重名拦截（跨一级允许同名）、停用/删除一级时连带处理其下属二级、二级恢复前要求上级已启用。
2. **金额键盘表达式规则（整数「分」精度）**：
   - 新增 `src/features/transactions/amount-expression.ts`，支持数字、小数点、`+`/`-` 连续运算与退格；逐操作数经 `src/shared/money/money.ts` 转为整数「分」后再加减，杜绝浮点误差。
3. **记一笔页面与自制组件**：
   - `src/features/categories/components/CategoryHierarchyPicker.tsx`：4 列等宽一级分类网格（适配 4 字中文分类名不截断），点击一级即选中一级并就地内联展开其二级抽屉，点击二级细选，再点已选二级退回一级。
   - `src/features/transactions/components/RecordKeypad.tsx`：底部停靠区，左备注（唯一触发系统键盘，聚焦时自动收起自制数字键盘；系统键盘关闭或点「完成」/金额区后无缝恢复自制键盘）+ 右大号等宽金额与运算预览；中间快捷胶囊展示账户、日期与已选分类；下方 4×4 自制键盘含 `0-9`、`.`、退格（长按清空）、`+`/`-`、`再记`（编辑态切换为 `清空`）与唯一实色主按钮 `保存`（有待算表达式时切换为 `=`）。
   - `src/features/transactions/components/AccountPickerSheet.tsx` 与 `DatePickerSheet.tsx`：纯 React Native `Modal` 自制底部选择面板（含今天/昨天/前天快捷项与周一起始月历），全程零系统键盘弹出、零新增三方依赖。
   - `app/record.tsx` 与 `app/_layout.tsx`：启用自定义顶部栏（左关闭、中支出/收入/转账语义切换、右分类管理或编辑态删除），转账模式上方展示清晰的「转出 ⇄ 转入」路由卡。
4. **统计、流水、分类管理与导出协同**：
   - `src/features/transactions/repository.ts` 联查父级分类字段；`TransactionRow.tsx` 对二级分类展示为「一级 · 二级」。
   - `src/features/analytics/rules.ts` 按一级分类聚合排行，二级金额与笔数并入所属一级。
   - `app/categories.tsx` 升级为可展开的一级/二级分组清单，支持指定一级下新增二级、编辑、连带停用/删除与恢复。
   - `src/features/export/formatter.ts` 升级 `EXPORT_SCHEMA_VERSION = 2`，JSON 增加 `parentId` / `parentName` / `parentCategoryName`，CSV 新增「子分类」列。
5. **版本递增**：应用行为新增兼容功能，按项目版本规则由 `0.1.0` 递增至 `0.2.0`（Android `versionCode` 由 `1` 递增至 `2`），同步更新 `CHANGELOG.md`。

## 实施（改动文件清单）

- **数据层与迁移**：`src/db/schema.ts`、`src/db/seed.ts`、`src/db/schema.test.ts`
- **分类职责**：`src/features/categories/types.ts`、`src/features/categories/presets.ts`、`src/features/categories/rules.ts`、`src/features/categories/rules.test.ts`、`src/features/categories/repository.ts`、`src/features/categories/service.ts`、`src/features/categories/service.test.ts`、`src/features/categories/components/CategoryHierarchyPicker.tsx`
- **交易与自制键盘/面板**：`src/features/transactions/types.ts`、`src/features/transactions/repository.ts`、`src/features/transactions/rules.test.ts`、`src/features/transactions/amount-expression.ts`、`src/features/transactions/amount-expression.test.ts`、`src/features/transactions/components/TransactionRow.tsx`、`src/features/transactions/components/RecordKeypad.tsx`、`src/features/transactions/components/AccountPickerSheet.tsx`、`src/features/transactions/components/DatePickerSheet.tsx`
- **分析、导出与日期工具**：`src/features/analytics/rules.ts`、`src/features/analytics/rules.test.ts`、`src/features/analytics/service.test.ts`、`src/features/export/types.ts`、`src/features/export/formatter.ts`、`src/features/export/formatter.test.ts`、`src/features/export/service.test.ts`、`src/shared/date/date.ts`、`src/shared/date/date.test.ts`
- **路由页面与版本配置**：`app/_layout.tsx`、`app/record.tsx`、`app/categories.tsx`、`app/settings.tsx`、`package.json`、`app.json`、`CHANGELOG.md`、`docs/architecture/overview.md`、`docs/changes/0008-two-level-categories-and-custom-keypad.md`、`docs/changes/README.md`、`docs/README.md`

## 执行验证记录

- **执行环境**：Windows / PowerShell，Bun + TypeScript 6 + ESLint 9 + Vitest 5.1.1（`node:sqlite` 真实 SQLite 内存库）
- **验证命令**：
  1. Ionicons 字形表校验（覆盖 69 个预设分类图标与 15 个新增界面图标）
  2. `bun run verify`（依次执行 `check:version`、`tsc --noEmit`、`eslint .`、`vitest run`）
- **实际输出**：
  - 图标校验：`checked 69` 与 `ALL 15 UI ICONS VALID`（无缺失字形）
  - 版本校验：`版本校验通过：v0.2.0`
  - 类型检查：`tsc --noEmit` 通过（0 错误）
  - 代码规范：`eslint .` 通过（0 错误、0 警告）
  - 单元测试：`Test Files 14 passed (14)`，`Tests 47 passed (47)`（耗时 207ms）
- **验证结论**：全部静态门禁与 47 项自动化测试通过。
- **已知限制**：本次在无真机/模拟器渲染环境下完成验证，未执行 Android/iOS 真机截图与软键盘切换实测，视觉微调与键盘高度衔接需在实机安装或 Expo 开发构建中复核。

## 后续验证建议

1. 在 Android 真机或模拟器运行 `bun run android`（或 `bun run build:apk` 打包安装），实测：
   - 点一级分类即选中并内联展开二级抽屉、点二级细选、再点退回一级；
   - 自制键盘输入小数与 `12.5+8.5` 运算、`=` 求值、长按退格清空、`再记` 连续入账；
   - 点击备注唤起系统键盘时自制键盘自动收起，点击「完成」或系统返回键后自制键盘正常恢复；
   - 账户胶囊与日期胶囊弹出的底部面板在浅色/深色模式及异形屏/手势条下无遮挡；
   - 从 v0.1.0 升级安装后旧账目分类保持完整，且统计页二级分类金额正确并入所属一级。
