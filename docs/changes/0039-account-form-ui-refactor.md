# 0039：新增与编辑账户页 UI 层级与紧凑交互重构

- **状态**：已执行
- **影响范围**：`package.json`、`app.json`、`CHANGELOG.md`、`src/theme/tokens.ts`、`src/theme/design-tokens.json`、`src/features/accounts/form-rules.ts`、`src/features/accounts/form-rules.test.ts`、`src/features/accounts/components/AccountIconPickerSheet.tsx`、`app/account-form.tsx`、`docs/architecture/overview.md`
- **生效版本**：v1.7.1（Android `versionCode: 33`）
- **前置文档**：[0035-account-model-overhaul-archive-settle-delete.md](0035-account-model-overhaul-archive-settle-delete.md)

## 背景

原新增/编辑账户页（`app/account-form.tsx`）存在视觉权重均等、卡片/胶囊/图标外描边堆砌、账户类型流式换行参差不齐、底部常驻 4×2 图标区与 3 行 Switch 开关占据大量纵向高度（近两屏半），以及输入占位符色阶偏深且采用假数据文案（如 16 位模拟卡号与支行名）等问题，影响录入效率与原生应用质感。

## 方案

1. **主题语义令牌补充（`src/theme/tokens.ts`、`src/theme/design-tokens.json`）**：
   - 新增 5 个语义令牌（同时覆盖浅色与深色模式，保证无描边分层与 WCAG 对比度）：
     - `surfaceGrouped`：柔和浅灰分组画布（浅色 `#f4f5f7` / 深色 `#11121f`），与纯白/深蓝灰卡片仅靠底色差建层级；
     - `divider`：卡片内左右缩进极浅分割线（浅色 `#f0f1f3` / 深色 `rgba(250, 253, 255, 0.08)`）；
     - `placeholder`：占位符浅灰（浅色 `neutral[400]` `#919eac` / 深色 `neutral[500]` `#707a8f`），与已输入文本（`#222435` / `#fafdff`）清晰拉开对比度；
     - `actionSurface`：无描边选中态与图标徽章的柔和品牌主色浅底（浅色 `rgba(1, 120, 83, 0.10)` / 深色 `rgba(40, 203, 192, 0.16)`）；
     - `chipInactive`：无描边未选中胶囊/图标块的柔和灰底（浅色 `#eaedf1` / 深色 `#35394c`）。
2. **账户表单纯输入规则与单测（`src/features/accounts/form-rules.ts`、`form-rules.test.ts`）**：
   - 抽离 `formatCardNumberInput`：纯数字卡号输入或粘贴时自动按每 4 位空格分组展示，末尾不留悬空空格避免退格卡滞，严格遵守 `MAX_CARD_NUMBER_LENGTH`（32），并兼容含脱敏符号的历史卡号。
   - 抽离 `truncateSignedDecimalsInput`：保留资产账户负初始余额的两位小数即时截断规则。
3. **就地换图标底部面板（`src/features/accounts/components/AccountIconPickerSheet.tsx`）**：
   - 复用统一可拖拽 `BottomSheet`（`expandable={false}`）承接原有 8 枚账户图标的 4×2 网格选择，点选即切换并自动收起，彻底移除主页面底部常驻图标区。
4. **新增/编辑账户页全模块重构（`app/account-form.tsx`）**：
   - **顶部导航栏**：保留返回与标题（「新增账户」/「编辑账户」），右侧新增轻量「保存」文字按钮，与底部主保存按钮共用 `handleSave`、Loading 态及防连点禁用逻辑。
   - **账户类型**：去除流式换行与多余小图标，改为单行横向纯文字胶囊栏（隐藏滚动条、右侧动态渐隐滑动线索、编辑态自动滚入视野），保持类型联动默认图标、颜色与卡面区显隐规则。
   - **核心信息卡片**（`borderRadius: 14`，无外描边）：顶部左嵌 `40×40` 可换图标徽章（右下角带下拉小角标）紧接账户名称输入；中部新建态突出「小标签 + 大号 30px 加粗等宽数字 + `¥` 前缀 + 聚焦态品牌绿高亮 + 小数数字键盘（`inputMode="decimal"` / `keyboardType="decimal-pad"`）」，编辑态紧凑只读回显当前余额；底部为固定左侧 68px 标签列宽的单行「备注」。
   - **卡面信息卡片**（`卡面信息 · 选填`，平铺不折叠）：第 1 行整行等宽自动空格卡号；第 2 行左右 2 列并排以细竖线分隔「银行」与「开户日期」（支持一键清空与日历选择）；第 3 行整行「开户行」。项目无内置 BIN 数据，不引入重型依赖。
   - **统计与记账属性**：移除三行 Switch 大卡与冗余标题，压缩为单行等宽可勾选状态胶囊（`计入总资产`、`计入净资产`、`记账时可选`），选中态以柔和主色浅底 + 主色文字 + `✓` 呈现。
   - **底部主操作栏与编辑态管理**：主按钮「保存」固定于底部安全区（附常驻可见的校验错误提示条），内容区预留底部内边距防遮挡；编辑态完整保留底部「归档 / 恢复 / 删除」管理入口与三重删除校验流程。

## 实施（改动文件清单）

- **版本与日志**：`package.json`（`1.7.1`）、`app.json`（`1.7.1` / `versionCode: 33`）、`CHANGELOG.md`。
- **主题令牌**：`src/theme/tokens.ts`、`src/theme/design-tokens.json`。
- **账户表单规则、组件与路由页面**：
  - 新增 `src/features/accounts/form-rules.ts`、`src/features/accounts/form-rules.test.ts`。
  - 新增 `src/features/accounts/components/AccountIconPickerSheet.tsx`。
  - 修改 `app/account-form.tsx`。
- **文档与索引**：`docs/architecture/overview.md`、`docs/changes/0039-account-form-ui-refactor.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows 11（PowerShell）、Bun `1.4.5`、Node.js（`node:sqlite`）、Android SDK Build-Tools `37.0.0`、Android Studio JBR。
- **验证命令与实际输出**：
  1. `bun run verify`：
     - `node scripts/check-version.mjs`：`版本校验通过：v1.7.1`
     - `tsc --noEmit`：0 错误退出
     - `eslint .`：0 错误 0 警告退出
     - `vitest run`：`Test Files 25 passed (25)`，`Tests 106 passed (106)`（新增 `form-rules.test.ts` 3 项测试覆盖 4 位空格卡号分组、脱敏兼容/长度上限及带符号两位小数截断）
  2. `bun x expo prebuild --platform android --no-install && bun run build:apk`：
     - `BUILD SUCCESSFUL in 2m 56s`
     - 产物：`D:\keep-accounts\android\app\build\outputs\apk\release\app-release.apk`（`60,469,049` 字节 / `57.67 MB`）
  3. `aapt2 dump badging` + `apksigner verify --verbose` + SHA-256：
     - `package: name='com.keepaccounts.app' versionCode='33' versionName='1.7.1'`，`application-label:'ZeroTally'`，`native-code: 'arm64-v8a' 'x86_64'`
     - `apksigner verify --verbose`：`Verifies`（APK Signature Scheme v2: `true`，`Number of signers: 1`）
     - SHA-256：`2984D2094A06D458433375C362599AE9AA9E684A61498A1FBCE7689DACD1C62A`
- **验证结论**：版本一致性、TypeScript 严格类型检查、ESLint、25 个测试文件共 106 项单测及 `v1.7.1` Android Release APK 构建与签名校验全部通过。
- **已知限制**：本地未连接 Android 真机，未进行实机目视与浅色/深色主题切换截图检查；所有输入规则与业务校验已由自动化单测及静态类型门禁验证。

## 后续验证建议

1. 真机安装 `v1.7.1` APK，在浅色与深色模式下分别进入「新增账户」与「编辑账户」核对：
   - 整页无卡片灰色外描边、账户类型单行横向滑动流畅且右侧有滑动线索；
   - 点击名称左侧 `40×40` 图标徽章可正常弹出底部图标面板并就地切换；
   - 初始余额大号等宽显示、聚焦时 `¥`/标签/细线呈品牌深绿高亮并唤起小数数字键盘；
   - 输入或粘贴 16~19 位银行卡号自动按每 4 位空格展示且退格无卡滞，银行与开户日期并排紧凑不截断；
   - 底部三个属性胶囊单点切换正常，顶栏与底部「保存」按钮校验与提交一致；
   - 编辑已有储蓄卡/信用卡时图标、当前余额、卡号、银行、开户日期、开户行、备注与三项属性回显无误，归档/恢复/删除入口正常。
