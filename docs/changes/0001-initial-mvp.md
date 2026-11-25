# 0001 首版安卓记账应用基础功能实现（v0.1.0）

- **状态**：已执行
- **影响范围**：全项目初始化（基础设施、SQLite 数据层、账户/分类/交易核心模块、主题系统、移动端界面与测试）
- **生效版本**：v0.1.0
- **前置文档**：[0001-tech-stack-and-architecture.md](../decisions/0001-tech-stack-and-architecture.md)、[overview.md](../architecture/overview.md)
- **替代文档**：无

## 背景

在空工作区从零搭建面向 Android 的 React Native 个人记账应用「简记（keep-accounts）」，首期交付基础的支出记账、收入记账、账户间转账、多资产与负债账户管理以及收支分类管理能力，并同步固化项目级 Git 与版本规范。

## 方案

1. **技术架构**：采用 Expo SDK 58 + React Native 0.88 + TypeScript + Expo Router + `expo-sqlite` + pnpm（`node-linker=hoisted`）。
2. **数据与财务不变量**：
   - 所有金额以整数「分」存储与运算，通过 `src/shared/money/money.ts` 统一解析与格式化。
   - 账户余额采用净值语义（资产通常为正，负债欠款存为负），确保记账余额联动与净资产汇总数学自洽。
   - 通过 `SqlExecutor` 抽象隔离底层驱动，运行时使用 `expo-sqlite` 独占事务，单元测试运行于 Node 26 内置 `node:sqlite` 真实内存数据库。
3. **视觉与交互**：基于 `refactoring-ui` 算法生成品牌与语义色阶并通过 34/34 组浅色与深色 WCAG AA 对比度校验；实现底部 3 栏（明细 / 资产 / 设置）与居中「+ 记一笔」悬浮主按钮，自动跟随系统浅色与深色主题。

## 实施（改动文件清单）

### 项目配置、规范与文档

- `.npmrc`、`.gitignore`、`package.json`、`app.json`、`tsconfig.json`、`babel.config.js`、`eslint.config.js`、`vitest.config.mts`、`scripts/check-version.mjs`
- `AGENTS.md`、`CHANGELOG.md`、`README.md`
- `assets/icon.png`、`assets/adaptive-icon.png`、`assets/splash.png`
- `docs/README.md`、`docs/architecture/README.md`、`docs/architecture/overview.md`、`docs/decisions/README.md`、`docs/decisions/0001-tech-stack-and-architecture.md`、`docs/changes/README.md`、`docs/changes/0001-initial-mvp.md`、`docs/troubleshooting/README.md`

### 共享原语与设计令牌

- `src/shared/money/money.ts`、`src/shared/money/money.test.ts`
- `src/shared/date/date.ts`、`src/shared/date/date.test.ts`
- `src/shared/id/id.ts`
- `src/shared/ui/AppIcon.tsx`、`src/shared/ui/Button.tsx`、`src/shared/ui/EmptyState.tsx`
- `src/theme/design-tokens.json`、`src/theme/palette.ts`、`src/theme/tokens.ts`、`src/theme/theme-context.tsx`、`src/theme/DESIGN.md`

### SQLite 数据层

- `src/db/types.ts`、`src/db/schema.ts`、`src/db/seed.ts`、`src/db/expo-client.ts`、`src/db/node-test-client.ts`、`src/db/database-context.tsx`、`src/db/schema.test.ts`

### 业务职责模块

- **账户模块**：`src/features/accounts/types.ts`、`rules.ts`、`repository.ts`、`service.ts`、`rules.test.ts`、`service.test.ts`、`components/NetWorthCard.tsx`、`components/AccountRow.tsx`
- **分类模块**：`src/features/categories/types.ts`、`presets.ts`、`rules.ts`、`repository.ts`、`service.ts`、`service.test.ts`
- **交易模块**：`src/features/transactions/types.ts`、`rules.ts`、`repository.ts`、`service.ts`、`rules.test.ts`、`service.test.ts`、`components/MonthlySummaryHeader.tsx`、`components/TransactionRow.tsx`

### 路由与界面

- `app/_layout.tsx`、`app/(tabs)/_layout.tsx`
- `app/(tabs)/index.tsx`（明细页）、`app/(tabs)/assets.tsx`（资产页）、`app/(tabs)/settings.tsx`（设置页）
- `app/record.tsx`（记一笔与编辑账目）、`app/account-form.tsx`（新增与编辑账户）、`app/account-detail.tsx`（账户详情、调账与流水）、`app/categories.tsx`（分类管理）

## 执行验证记录

- **执行环境**：Windows 11，Node.js `v26.13.1`，pnpm `12.23.0`，Expo SDK `58.0.26`，TypeScript `6.0.3`，Vitest `5.1.1`。
- **验证命令与实际输出**：
  1. `uv run python .../refactoring-ui/scripts/check_contrast.py --matrix src/theme/design-tokens.json`：输出 `34/34 pass`（浅色与深色模式全部文本配对通过 WCAG AA 4.5:1）。
  2. `pnpm verify`（串联 `pnpm check:version && pnpm typecheck && pnpm lint && pnpm test`）：
     - `版本校验通过：v0.1.0`
     - `tsc --noEmit`：退出码 0，无报错
     - `eslint .`：退出码 0，0 错误、0 警告
     - `vitest run`：8 个测试文件全部通过，25 条测试用例全部通过（耗时 169ms，覆盖金额、日期、SQLite 约束迁移、账户、分类、交易事务与余额联动全场景）
  3. `npx expo config --type public --json`：配置解析通过（`简记 0.1.0 com.keepaccounts.app ["expo-router","expo-sqlite"]`）。
  4. `pnpm exec expo export --platform android --output-dir .expo/verify-bundle`：Metro 成功完成 Android 打包（1216 个模块，8342ms）并输出 Hermes 字节码（2.8MB）与 27 项资源，验证结束后已清理临时导出目录。
- **验证结论**：通过。版本一致性、静态类型、代码规范、核心财务逻辑（含真实 SQLite 事务与约束）以及 Android JS/Hermes 打包均已验证无误。
- **已知限制**：按当前阶段确认，未在本机安装或切换兼容 Gradle 的 JDK 17/21，也未执行 Android 原生 APK 编译与模拟器真机界面渲染测试；因此真机视觉排版、键盘避让细节与 `expo-sqlite` 安卓原生运行时绑定属于尚未真机实测的残余风险。

## 后续验证建议

1. 在手机安装 Expo Go 运行 `pnpm start` 扫码预览，或在配置 `ANDROID_HOME` 与 JDK 17/21 后执行 `pnpm prebuild:android` 并于 Android 模拟器 `Medium_Phone_API_37.0` 实测完整记账、转账与调账流程。
2. 实机重点验收：浅色/深色系统主题切换、软键盘弹出时的金额与备注输入遮挡、悬浮「+ 记一笔」按钮与底部手势导航栏间距。
