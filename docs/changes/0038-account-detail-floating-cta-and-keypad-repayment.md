# 0038：账户详情悬浮记一笔与吸顶收起卡片，及内置计算键盘负债还款页

- **状态**：已执行
- **影响范围**：`package.json`、`app.json`、`CHANGELOG.md`、`app/_layout.tsx`、`app/account-detail.tsx`、`app/repayment.tsx`、`src/features/accounts/detail-scroll-rules.ts`、`src/features/accounts/detail-scroll-rules.test.ts`、`src/features/transactions/components/RecordKeypad.tsx`、`src/features/transactions/components/useTransactionListInteractions.tsx`、`src/features/transactions/components/RepaymentSheet.tsx`（已移除）、`docs/architecture/overview.md`
- **生效版本**：v1.7.0（Android `versionCode: 32`）
- **前置文档**：[0037-liability-repayment.md](0037-liability-repayment.md)、[0035-account-model-overhaul-archive-settle-delete.md](0035-account-model-overhaul-archive-settle-delete.md)

## 背景

1. 账户详情页此前将「记一笔」放在顶部大卡片操作行中，且负债账户以「还款」为主按钮，资产与负债账户的首要入口不统一；当用户向上滑动浏览历史流水时，大卡片完全滚出屏幕，底部既无常驻触发能力，也缺少滚动时的紧凑余额概览。
2. 负债还款此前使用底部弹窗（`RepaymentSheet`）配合系统数字键盘输入金额，与「记一笔」页面的内置计算键盘体验割裂，且在窄屏下容易受软键盘高度挤压。

## 方案

1. **账户详情滚动纯规则抽离与单测（`src/features/accounts/detail-scroll-rules.ts`）**：
   - `resolveFloatingActionVisibility`：靠近顶部（`<=12px`）锁定显示底部悬浮「记一笔」，累计上滑 `>=14px`（滤除单帧微抖）隐藏，向下滑动 `>=4px` 立即响应重新显现，方向反转时清零累计位移。
   - `computeDetailCollapseRange(heroCardHeight)`：依据实测顶部大卡片高度计算 `[startY, endY]` 滚动收起区间，确保大卡片动作行开始离屏后才浮现吸顶小卡片，避免画面中同时出现重复按钮。
2. **账户详情页交互升级（`app/account-detail.tsx`）**：
   - 改用 `Animated.ScrollView`（`useNativeDriver: true`）配合 `scrollY.addListener` 监听滚动状态，既保证 60fps 原生驱动插值又避免滚动期高频重渲染。
   - **底部悬浮首要「记一笔」**：所有未归档且交易可选账户（资产与负债统一）在底部居中悬浮实色主按钮「+ 记一笔」，上滑浏览历史时平滑下沉隐藏并置 `pointerEvents="none"`，下滑立即弹性显现；顶部大卡片内仅保留单行次级动作（负债：`还款 / 平账 / 编辑`；资产：`平账 / 编辑`；归档：`编辑`）。
   - **吸顶紧凑小卡片**：向上滑动至大卡片离屏区间时，顶部平滑过渡浮现固定紧凑小卡片（图标 + 余额/待还 + 快捷 `还款`/`平账` 胶囊），点按余额区平滑滚回顶部展开大卡片；大卡片本身留在 `ScrollView` 自然滚动不改动内容高度，杜绝布局回弹抖动。
3. **「记一笔」同款全屏内部计算键盘负债还款页（`app/repayment.tsx` + `RecordKeypad.tsx`）**：
   - 扩展 `RecordKeypad` 支持 `txType: 'repayment'`，新增可选 `amountPlaceholder` 与 `emptyAmountHint`（留空展示浅色默认待还全额与「留空默认全额还清 / 留空保持原金额」提示，按任意数字从新数字起输免手删），并令底部路径融合条的 `onSwap` 变为可选。
   - 新增独立 `transparentModal` 全屏路由页 `app/repayment.tsx`（在 `app/_layout.tsx` 注册），参考 `app/record.tsx` 提供顶栏与主体顶部跟手下拉退出、上方 `SlidingSegmentedControl`（「资产转入」/「无账户支出」）、并排还款路径与余额/欠款实时预览卡及 2 列资产账户直选网格，底部完整复用自制 4×4 计算键盘（仅备注聚焦时唤起文字键盘），同时支持新建（`liabilityAccountId`）与编辑/顶栏删除（`id`）。
   - 更新 `app/account-detail.tsx` 与 `useTransactionListInteractions.tsx` 均跳转 `/repayment`，并移除不再使用的 `RepaymentSheet.tsx`。

## 实施（改动文件清单）

- **版本与架构文档**：`package.json`（`1.7.0`）、`app.json`（`1.7.0` / `versionCode: 32`）、`CHANGELOG.md`、`docs/architecture/overview.md`。
- **账户详情滚动规则与测试**：
  - 新增 `src/features/accounts/detail-scroll-rules.ts`、`src/features/accounts/detail-scroll-rules.test.ts`。
- **账户详情与负债还款页面及键盘组件**：
  - 新增 `app/repayment.tsx`。
  - 修改 `app/_layout.tsx`、`app/account-detail.tsx`、`src/features/transactions/components/RecordKeypad.tsx`、`src/features/transactions/components/useTransactionListInteractions.tsx`。
  - 删除 `src/features/transactions/components/RepaymentSheet.tsx`。
- **变更与索引文档**：`docs/changes/0038-account-detail-floating-cta-and-keypad-repayment.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows 11（PowerShell）、Bun `1.4.5`、Node.js（`node:sqlite`）、Android SDK Build-Tools `37.0.0`、Android Studio JBR。
- **验证命令与实际输出**：
  1. `bun run verify`：
     - `node scripts/check-version.mjs`：`版本校验通过：v1.7.0`
     - `tsc --noEmit`：0 错误退出
     - `eslint .`：0 错误 0 警告退出
     - `vitest run`：`Test Files 24 passed (24)`，`Tests 103 passed (103)`（新增 `detail-scroll-rules.test.ts` 2 项测试覆盖上滑隐藏、微抖过滤、下滑即显与大卡片收起区间）
  2. `bun x expo prebuild --platform android --no-install && bun run build:apk`：
     - `BUILD SUCCESSFUL in 2m 42s`
     - 产物：`D:\keep-accounts\android\app\build\outputs\apk\release\app-release.apk`（`60,460,625` 字节 / `57.66 MB`）
  3. `aapt2 dump badging` + `apksigner verify` + SHA-256：
     - `package: name='com.keepaccounts.app' versionCode='32' versionName='1.7.0'`，`application-label:'ZeroTally'`，`native-code: 'arm64-v8a' 'x86_64'`
     - `apksigner verify --verbose`：`Verifies`（APK Signature Scheme v2: `true`，`Number of signers: 1`）
     - SHA-256：`B7BCD642477F8893C7B95862E685875357EC2AD5A990889B425DD9C83954EC4F`
- **验证结论**：版本一致性、TypeScript 严格检查、ESLint（含 React 19 hooks 规则）、24 个测试文件共 103 项单测及 `v1.7.0` Android Release APK 构建与签名校验全部通过。
- **已知限制**：本地无连接真机，滚动 60fps 吸顶手感与全屏下拉退回动画未做真机实操目视检验；方向判定、防抖阈值与收起区间计算已由纯规则单元测试验证。

## 后续验证建议

1. 真机安装 `v1.7.0` APK，进入有较多流水的储蓄卡与信用卡详情页，测试：
   - 初始底部悬浮「+ 记一笔」显眼且一键直达预选当前账户的记一笔页；
   - 向上滑动浏览历史时底部「记一笔」平滑隐藏、顶部大卡片无缝过渡为吸顶紧凑小卡片；
   - 稍微向下滑动时底部「记一笔」立即弹出，点按吸顶小卡片余额区可平滑回顶展开大卡片。
2. 从负债账户详情大卡或吸顶小卡点击「还款」，以及从明细点击已有还款记录进入「编辑还款」，验证内置 4×4 计算键盘输入、加减运算、留空一键全额还清、切「资产转入 / 无账户支出」与顶栏下拉退出。
