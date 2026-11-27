# 0035 - v1.4.0 资产账户体系重构：类型驱动性质、三独立开关、银行卡信息、归档/平账/删除升级

- **状态**：已执行
- **类型**：变更记录
- **生效版本**：v1.4.0（Android `versionCode: 29`）
- **影响范围**：`src/db/schema.ts`（v5）、`src/features/accounts/*`、`src/features/transactions/*`、`src/features/quick-record/*`、`src/features/export/*`、`src/shared/ui/ConfirmDialog.tsx`、`app/account-form.tsx`、`app/account-detail.tsx`、`app/(tabs)/assets.tsx`、`app/record.tsx`、`app/_layout.tsx`、新增 `app/archived-accounts.tsx` 与 `src/features/accounts/components/SettleBalanceSheet.tsx` / `AccountDeleteFlow.tsx`
- **前置文档**：[0034-quick-card-sizing-and-velocity-scrub-steps.md](0034-quick-card-sizing-and-velocity-scrub-steps.md)

## 1. 背景

参照钱迹功能设计（仅借鉴功能逻辑，不复刻视觉），对资产账户体系进行端到端重构与全面审计收口：

1. **类型驱动性质 + 银行卡信息**：新增账户不再单独选择「性质（资产/负债）」，由账户类型唯一推导；银行卡类账户（储蓄卡 / 信用卡）支持录入卡号、银行、开户行、开户日期等基础信息，详情页支持逐行点击复制与一键复制全部。
2. **停用更名归档 + 三独立开关**：归档后账户移出资产一级页（仅保留底部入口跳二级页查看），不参与总资产 / 总负债 / 净资产统计，不出现在可选账户中，仅保留历史明细且禁止平账；归档可随时恢复，只需一次确认。未归档账户可独立配置「计入总资产 / 计入净资产 / 交易可选账户」。
3. **删除账户三重严格校验并连带清除**：删除会连带清除关联流水及悬空退款，第一步弹窗主推温和推荐按钮「归档账户」+「取消删除」（点击「归档账户」切换至互斥的归档二次确认窗），下方弱化「继续删除」→ 第二步 4 位随机数字验证码 → 第三步最终确认明示精确清除笔数。
4. **校准更名平账**：通过统一 `BottomSheet` 直接修改账户余额，支持勾选是否生成平账收支记录并自选归属分类。
5. **详情页与编辑页结构优化**：详情页改为「顶栏标题 + 账户信息卡片 + 下方按日直排流水」，移除独立流水分区；归档 / 恢复 / 删除统一移入「编辑」二级页。

## 2. 方案

### 2.1 领域层（Schema v5 + 权威规则 + 事务编排 + 备份 v4）

- **Schema v5 迁移**（[schema.ts](../../src/db/schema.ts)）：`accounts` 表新增 `include_in_total_assets`（老库继承 `include_in_net_worth` 保证口径不突变）、`is_selectable`（默认 `1`）、`card_number` / `bank_name` / `bank_branch` / `opened_on`（默认 `''`），并按类型归一老库历史 `kind`（`credit / loan → liability`，其余 `asset`）。
- **账户权威规则**（[rules.ts](../../src/features/accounts/rules.ts)）：
  - `kindForCategory` 唯一推导账户性质；`supportsCardInfo` + `normalizeAccountCardInfo` 统一裁剪卡信息并校验 ISO 日期、非银行卡类型自动清空；新增 `formatAccountCardCopyText` 汇总一键复制文本。
  - `computeNetWorthSummary` 三开关独立：归档账户一律排除；总资产汇总未归档且 `includeInTotalAssets` 的非负余额；净资产与总负债汇总未归档且 `includeInNetWorth` 的余额。
- **架构边界与事务编排**（[transactions/service.ts](../../src/features/transactions/service.ts)）：
  - `accounts/service.ts` 保持纯账户原语，不反向依赖 `transactions/`。
  - **平账** `settleAccountBalance`：拒绝已归档账户平账；同事务写入新余额与可选收入/支出记录（默认落 `cat_inc_other / cat_exp_other`，支持指定任意同类型活跃分类，备注 `平账(旧 ~ 新)`）。
  - **级联删除** `deleteAccountWithTransactions`：全部保护检查（至少保留 1 个可用账户及 1 个可选账户）与删除收敛在同一事务内；连带清除该账户全部流水、跨账户悬空退款与快捷模板，并回滚转账对手方及退款入账方余额；`countAccountTransactions` 同步纳入悬空退款计数，确保确认窗笔数与实际清除笔数完全一致。
- **可选账户全链路门禁**：`verifyTransactionReferences`、退款创建/编辑、快捷模板校验与展示、`record.tsx`、`RefundSheet`、`QuickRecordSheet`、`QuickTemplateComposer` 及分类账户记忆 SQL/规则同步过滤 `!isArchived && isSelectable`。
- **完整 JSON 备份 v4**（[formatter.ts](../../src/features/export/formatter.ts)、[export/service.ts](../../src/features/export/service.ts)）：导出/导入完整携带三开关与银行卡字段；兼容 v2 / v3 旧备份导入（`kindForCategory` 归一性质、`normalizeAccountCardInfo` 裁剪校验、`includeInTotalAssets` 继承 `includeInNetWorth`），校验至少包含 1 个未归档且交易可选账户，并放行超额退款记录导入。

### 2.2 UI 与交互层

- **新增 / 编辑账户页**（[app/account-form.tsx](../../app/account-form.tsx)）：删除「性质」分段；将基础信息（名称 / 初始余额留空占位 `0.00` 免手删 / 备注）、银行卡信息（含可一键清空的开户日期）、图标与三独立开关重构为规整卡片组；编辑态底部收纳「账户管理（归档 / 恢复 / 删除）」，删除后使用 `router.dismiss(2)`（兜底 `router.replace`）安全退回上级列表页。
- **删除账户三重校验流**（[AccountDeleteFlow.tsx](../../src/features/accounts/components/AccountDeleteFlow.tsx)、[ConfirmDialog.tsx](../../src/shared/ui/ConfirmDialog.tsx)）：`ConfirmDialog` 新增按钮下方 `footer` 槽；`AccountDeleteFlow` 采用严格互斥的 4 态状态机（`guide | archive-confirm | code | final`），保证全屏任意时刻至多挂载 1 个 `Modal`，第一步推荐按钮「归档账户」采用温和主色 `primary`。
- **统一平账底部弹窗**（[SettleBalanceSheet.tsx](../../src/features/accounts/components/SettleBalanceSheet.tsx)）：基于统一 `BottomSheet`（单段不可展开，仅下滑收起，支持软键盘避让），占位显示当前余额免手删，实时展示差额与对应收支类型，勾选「生成平账记录」后预览备注并支持横向胶囊切换平账分类，金额未变动时拦截提交。
- **账户详情与归档二级页**（[app/account-detail.tsx](../../app/account-detail.tsx)、[app/(tabs)/assets.tsx](../../app/(tabs)/assets.tsx)、[app/archived-accounts.tsx](../../app/archived-accounts.tsx)）：顶栏 `<Stack.Screen>` 置于顶层；信息卡支持点按复制账户名称、银行卡各字段及右上角「复制全部」；已归档账户隐藏「记一笔」与「平账」按钮；信息卡下方直接按日分组平铺流水（复用明细日标题与收/支小计）；资产一级页底部提供「已归档（N）」入口跳独立二级页。

## 3. 实施（改动文件清单）

- Schema / DB：`src/db/schema.ts`、`src/db/schema.test.ts`
- accounts：`types.ts`、`rules.ts`、`repository.ts`、`service.ts`、`rules.test.ts`、`service.test.ts`、`components/AccountRow.tsx`、新增 `components/AccountDeleteFlow.tsx`、`components/SettleBalanceSheet.tsx`
- transactions：`service.ts`、`repository.ts`、`rules.ts`、`types.ts`、`components/RefundSheet.tsx`、`service.test.ts`、`rules.test.ts`
- quick-record：`service.ts`、`repository.ts`、`components/QuickRecordSheet.tsx`、`components/QuickTemplateComposer.tsx`
- export：`types.ts`、`formatter.ts`、`service.ts`、`formatter.test.ts`、`service.test.ts`
- shared：`ui/ConfirmDialog.tsx`、`money/money.ts`
- 页面：`app/account-form.tsx`、`app/account-detail.tsx`、`app/(tabs)/assets.tsx`、`app/record.tsx`、`app/_layout.tsx`、新增 `app/archived-accounts.tsx`
- 版本与文档：`package.json`、`app.json`、`CHANGELOG.md`、`docs/architecture/overview.md`、`docs/README.md`、`docs/changes/README.md`、本文档

## 4. 执行验证记录

- **执行环境**：Windows 11，Bun 1.4.5，Node.js 26，Android SDK Build-Tools 37.0.0，Android Studio JBR 21
- **质量门禁命令**：`bun run verify`
- **质量门禁输出**：
  - `node scripts/check-version.mjs`：`版本校验通过：v1.4.0`
  - `tsc --noEmit`：0 错误
  - `eslint .`：0 错误 0 警告
  - `vitest run`：**21 passed (21)，86 passed (86)**（375ms，完整覆盖 v1/v2→v5 迁移、三开关独立汇总、银行卡信息裁剪与一键复制格式、归档统计排除与禁止平账、平账生成记录及回滚、删除级联回滚与悬空退款精确计数、不可选账户门禁与最后可选账户保护、v4 备份无损恢复及 v3 兼容与超额退款导入）
- **APK 构建命令**：`bun x expo prebuild --platform android --no-install && bun run build:apk`（仓库根目录直接构建，2m 42s 完成）
- **APK 校验结果**：
  - 产物路径：`android/app/build/outputs/apk/release/app-release.apk`（`60,089,210` 字节 / `57.31 MB`）
  - `aapt2 dump badging`：`package='com.keepaccounts.app'`、`versionCode='29'`、`versionName='1.4.0'`、`application-label='ZeroTally'`、`targetSdkVersion='36'`、`native-code='arm64-v8a' 'x86_64'`
  - `apksigner verify --verbose`：`Verifies`（APK Signature Scheme v2 = true，signers = 1）
  - SHA-256：`4C7EF7D2B1137AC0E3068D246F0DCDE71D9172DABF487DDA8F9813AAA22F75A3`
- **验证结论**：通过。
- **已知限制**：RN 0.88.1 内置 `Clipboard` 原生可用但带开发期弃用警告，后续若 RN 移除需经用户同意引入 `expo-clipboard`；账户详情流水单次上限 1000 条。

## 5. 后续验证建议

1. 真机安装 `v1.4.0` APK：覆盖升级验证老账户总资产开关继承与信用卡类型性质归一；新增储蓄卡录入卡号/银行/开户行/开户日期（含清空日期）并在详情页测试逐行复制与「复制全部」。
2. 在账户详情页点击「平账」弹出底部卡片：分别测试不生成记录仅改余额、勾选生成记录并切换分类及删除该平账记录回滚余额；归档该账户后确认一级页隐藏、可从底部「已归档」二级页进入且不再显示「平账」与「记一笔」。
3. 在编辑页走完「删除账户」流程：先点第一步温和主按钮「归档账户」验证互斥单弹窗确认，再走「继续删除 → 4 位验证码 → 最终确认」验证精确清除笔数与安全退栈。
