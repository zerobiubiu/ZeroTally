# 0037：负债账户支持还款功能（资产转入与无账户直接还款）

- **状态**：已执行
- **影响范围**：`package.json`、`app.json`、`CHANGELOG.md`、`src/db/schema.ts`、`src/shared/money/money.ts`、`src/features/transactions/*`、`src/features/export/formatter.ts`、`app/account-detail.tsx`、`app/record.tsx`、`docs/architecture/overview.md`
- **生效版本**：v1.6.0（Android `versionCode: 31`）
- **前置文档**：[0035-account-model-overhaul-archive-settle-delete.md](0035-account-model-overhaul-archive-settle-delete.md)、[0036-cloud-backup-webdav-and-google-drive.md](0036-cloud-backup-webdav-and-google-drive.md)

## 背景

此前信用卡、借款等负债账户虽然可以通过「转账」实现由资产账户向负债账户划转，但缺少专用的「还款」语义入口，也无法支持不从本地资产账户扣款的直接还款场景（如家人代还、使用未纳入记账的外部资金还款等）。用户明确要求负债账户支持还款，涵盖「从资产账户转入」与「无账户支出直接还款」两种方式，且无账户直接还款仅减少负债欠款、不计入月度/年度支出与收入。

## 方案

1. **数据库 Schema v6 与完整 JSON 备份 v5**：
   - 将 `CURRENT_SCHEMA_VERSION` 升级至 `6`，通过事务外关闭外键 / `finally` 恢复外键模式原子重建 `transactions` 表，新增一等交易类型 `'repayment'`：
     - `account_id`（`NOT NULL`）：被还款的负债账户 ID；
     - `to_account_id`（可为 `NULL`）：可选的资金来源资产账户 ID（`NULL` 表示无账户直接还款；非 `NULL` 时须与 `account_id` 不同）；
     - `category_id IS NULL` 且 `refund_of_id IS NULL`。
   - `EXPORT_SCHEMA_VERSION` 升级至 `5`（完全兼容 v1~v4 导入），同步支持本地与云端 JSON 备份对 `'repayment'` 交易的导出、结构校验与原子恢复。
2. **领域规则与事务编排（`transactions/rules.ts`、`service.ts`）**：
   - `computeBalanceDeltas`：`'repayment'` 对负债账户（`accountId`）增加 `+amountCents`（减少欠款），若存在付款资产账户（`toAccountId`）同步扣减 `-amountCents`（净资产不变）；编辑与删除复用净增量与取反回滚逻辑，删除任一端账户时亦自动联动回滚对手方余额。
   - `computeMonthlySummary` 与 `groupTransactionsByDay`：`'repayment'` 不计入支出或收入，避免与信用消费重复统计。
   - `createRepaymentTransaction` / `updateRepaymentTransaction`：校验目标必须为未归档负债账户；若选资产转入，校验来源必须为未归档且交易可选的资产账户（编辑态沿用原来源账户豁免），所有写入在同一 SQLite 事务内原子完成。
3. **负债账户详情页入口与统一手势 `RepaymentSheet`**：
   - 在 `app/account-detail.tsx` 中，针对未归档负债账户展示主按钮「还款」，搭配双行操作组（`还款 + 记一笔` / `平账 + 编辑`）保证窄屏不换行。
   - 新增基于统一可展开 `BottomSheet` 的 `RepaymentSheet.tsx`（新建与编辑双模式，平级挂载 `DatePickerSheet`）：
     - 有欠款时默认以浅色占位提示待还全额（留空直接提交即可一键全额还清，点击输入自动两位小数截断与规整，不设业务上限兼容提前多还/溢缴）；
     - 通过 `SlidingSegmentedControl` 在「资产转入」（横向资产账户选择 + 扣款后余额实时预览）与「无账户支出」（不扣其他账户、不计收支）间一键切换。
4. **全链路明细、详情浮窗与删改闭环**：
   - `TransactionRow.tsx`、`TransactionDetailSheet.tsx`、`DeleteTransactionDialog.tsx` 与 `useTransactionListInteractions.tsx` 全面适配 `'repayment'`：全局明细显示「还款 · 负债名」与来源说明，单账户详情按视角显式区分 `+¥`（负债减少）与 `-¥`（资产转出），编辑直开 `RepaymentSheet`，删除精准提示并原子回滚余额。

## 实施（改动文件清单）

- **版本与配置**：`package.json`（`1.6.0`）、`app.json`（`1.6.0` / `versionCode: 31`）、`CHANGELOG.md`。
- **数据库与金额格式化**：`src/db/schema.ts`（Schema v6）、`src/db/schema.test.ts`、`src/shared/money/money.ts`。
- **交易核心与备份校验**：
  - `src/features/transactions/types.ts`、`rules.ts`、`rules.test.ts`、`service.ts`、`service.test.ts`。
  - `src/features/export/formatter.ts`（Schema v5）、`formatter.test.ts`。
- **UI 组件与路由页**：
  - 新增 `src/features/transactions/components/RepaymentSheet.tsx`。
  - 修改 `app/account-detail.tsx`、`app/record.tsx`、`src/features/transactions/components/RecordKeypad.tsx`、`TransactionRow.tsx`、`TransactionDetailSheet.tsx`、`DeleteTransactionDialog.tsx`、`useTransactionListInteractions.tsx`。
- **架构与变更文档**：`docs/architecture/overview.md`、`docs/changes/0037-liability-repayment.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows 11（PowerShell）、Bun `1.4.5`、Node.js（`node:sqlite`）、Android SDK Build-Tools `37.0.0`、Android Studio JBR。
- **验证命令与实际输出**：
  1. `bun run verify`：
     - `node scripts/check-version.mjs`：`版本校验通过：v1.6.0`
     - `tsc --noEmit`：0 错误退出
     - `eslint .`：0 错误 0 警告退出
     - `vitest run`：`Test Files 23 passed (23)`，`Tests 101 passed (101)`（新增 Schema v6 迁移与约束校验、还款余额/统计规则、双模式创建/编辑切换/删除回滚及 JSON v5 导入导出往返测试）
  2. `bun x expo prebuild --platform android --no-install && bun run build:apk`：
     - `BUILD SUCCESSFUL in 2m 46s`
     - 产物：`D:\keep-accounts\android\app\build\outputs\apk\release\app-release.apk`（`60,445,081` 字节 / `57.64 MB`）
  3. `aapt2 dump badging` + `apksigner verify` + SHA-256：
     - `package: name='com.keepaccounts.app' versionCode='31' versionName='1.6.0'`，`application-label:'ZeroTally'`，`native-code: 'arm64-v8a' 'x86_64'`
     - `apksigner verify --verbose`：`Verifies`（APK Signature Scheme v2: `true`）
     - SHA-256：`E8919D51D3A96F2F2D5DB9EFF0BB0980C06608C1E049F2AFD4DC62C29F320494`
- **验证结论**：全量静态校验、101 项自动化单元测试与 `v1.6.0` Android Release APK 构建签名校验全部通过。
- **已知限制**：本地无连接真机，未在真机端目视操作手势弹窗；核心逻辑与事务约束已通过真实 SQLite 集成测试验证。

## 后续验证建议

1. 真机安装 `v1.6.0` APK，打开任意有欠款的信用卡/借款账户详情页，点击「还款」验证占位待还全额直接提交与部分还款输入。
2. 分别验证「资产转入」还款（检查资产页总资产/总负债变化与双边账户流水正负号）与「无账户支出」还款（检查仅负债减少、明细月度总览支出/收入均不变）。
3. 在明细页点击还款记录进入详情浮窗，测试「修改」在两种还款方式间互切以及「删除」回滚余额，并执行一次云备份与恢复核对 Schema v5 兼容性。
