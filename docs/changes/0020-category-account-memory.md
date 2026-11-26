# 0020 收支记账新增分类账户记忆与单次手动锁定策略

- **状态**：已执行
- **影响范围**：`src/features/transactions/types.ts`、`src/features/transactions/repository.ts`、`src/features/transactions/rules.ts`、`src/features/transactions/service.ts`、`src/features/transactions/components/RecordKeypad.tsx`、`app/record.tsx`、事务测试、架构文档、版本清单与变更日志
- **生效版本**：v0.8.0（Android `versionCode: 14`）
- **前置文档**：[0013-direct-account-strip-calendar-drilldown-and-multi-period.md](0013-direct-account-strip-calendar-drilldown-and-multi-period.md)、[0019-redesign-transfer-route-panel.md](0019-redesign-transfer-route-panel.md)

## 背景

在高频手工记账场景中，不同收支分类通常对应固定资金账户（如日常餐饮用微信、网购刷信用卡、工资入银行储蓄卡）。此前记一笔页面每次打开仅默认选中首位账户，切换分类也不会同步对应常用账户；同时若直接做“切分类必覆盖账户”，又会破坏用户先改账户再改分类的操作预期。因此按确认方案落地「零 Schema 历史流水实时派生 + 四层两级分类回退 + 单次手动锁定不覆盖 + 账户条自动滚入视野」策略。

## 方案

1. **零 Schema 历史流水实时派生记忆（`src/features/transactions/repository.ts`、`service.ts`）**：
   - 新增 `CategoryAccountMemory` 类型及只读查询 `findCategoryAccountMemory(db)`（通过 `getCategoryAccountMemory(db)` 对外暴露），直接从既有 `transactions` 表派生，无需新增数据库表或迁移版本。
   - 仅统计 `type IN ('expense', 'income')` 且账户未停用（`accounts.is_archived = 0`）的流水，排除 `refund`（防退款入账污染消费分类记忆）与 `transfer`；使用 `ROW_NUMBER() OVER (PARTITION BY t.category_id ORDER BY t.created_at DESC, t.rowid DESC)` 按操作先后（而非账单日期）为每个分类取最新一条活跃记录，并在外层按操作时间降序归并 `byCategoryId`、`byRootCategoryId` 与 `byType`。
   - 删账、改账、停用旧账户或重置账本后记忆自动实时同步，零脏指针。
2. **四层回退纯规则与即时同步（`src/features/transactions/rules.ts`）**：
   - 新增权威纯规则 `resolveRememberedAccountId`：按「① 精确分类记忆 → ② 所属一级大类兜底（兼容两级分类首次记账）→ ③ 同收支类型最近使用账户 → ④ 首个活跃账户」顺序解析可用活跃账户。
   - 新增 `recordCategoryAccountMemory`：点击「再记」保存成功后在内存中同步刷新新记忆，避免异步刷新窗口内切换分类读到旧值。
3. **单次记账 `accountLocked` 状态机（`app/record.tsx`）**：
   - 底栏 `+` 普通新增记一笔：`accountLocked` 初始为 `false`，首屏即带出默认分类记忆账户，切换一级或二级分类均自动跟随切换；
   - 一旦手动点选底部横向账户卡片，`accountLocked` 立即置为 `true`，本次记账后续再切换任何分类均不再自动覆盖账户；
   - 编辑旧账（`id`）、复制再记（`copyFromId`）或从特定账户详情页进入（`accountId`）：`accountLocked` 初始为 `true`，保护原有或指定账户不被切换分类意外覆写；
   - 普通新增模式下切换顶部「支出 ↔ 收入」Tab，或点击键盘「再记」保存进入下一笔时，重置 `accountLocked` 为 `false` 并立即按新类型/新记忆生效（从特定账户详情进入则维持锁定）。
   - 使用 `initializedKeyRef` 区分首次进入与 `revision` 后续刷新（如「再记」或从分类管理返回），刷新余额与记忆快照的同时不打断当前表单选择。
4. **横向账户条自动滚入视野（`src/features/transactions/components/RecordKeypad.tsx`）**：
   - 记录横向 `ScrollView` 可视宽度、内容总宽度、当前偏移与各账户卡片布局位置；当首屏默认带出或切换分类自动变更账户且目标卡片超出视野时，自动居中滚动带入视野（首屏静默对齐，后续切分类平滑动画滚入），零多余提示文案。

## 实施（改动文件清单）

- 领域类型、仓储、规则与服务：`src/features/transactions/types.ts`、`src/features/transactions/repository.ts`、`src/features/transactions/rules.ts`、`src/features/transactions/service.ts`。
- 界面与交互：`app/record.tsx`、`src/features/transactions/components/RecordKeypad.tsx`。
- 自动化测试：`src/features/transactions/rules.test.ts`、`src/features/transactions/service.test.ts`。
- 版本与文档：`package.json`、`app.json`、`src/features/settings/components/SettingsPanel.tsx`、`CHANGELOG.md`、`docs/architecture/overview.md`、`docs/changes/0020-category-account-memory.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows（PowerShell），Bun + TypeScript 6 + ESLint 9 + Vitest 5
- **验证命令**：`bun run verify`（依次执行 `check:version`、`tsc --noEmit`、`eslint .`、`vitest run`）
- **实际输出**：
  - `node scripts/check-version.mjs`：`版本校验通过：v0.8.0`
  - `tsc --noEmit`：0 错误退出
  - `eslint .`：0 错误、0 警告退出
  - `vitest run`：`Test Files 15 passed (15)`，`Tests 58 passed (58)`（239ms，含新增四层回退纯规则单测与真实 SQLite 记忆派生集成测试）
- **验证结论**：通过。
- **已知限制**：本次仅执行静态检查与自动化测试，尚未打包 `v0.8.0` Android Release APK 并在真机实测多账户横向滚动动画与连续「再记」交互手感。

## 后续验证建议

- 构建 `v0.8.0` Android Release APK 在真机验证：
  1. 分别用微信记一笔「餐饮 · 午餐」、用银行卡记一笔「工资薪金」后重新点 `+`：打开即自动带出对应记忆账户，切至新子分类「餐饮 · 早餐」自动沿用餐饮大类账户，切至「收入」自动带出银行卡；
  2. 打开记一笔后先手动点选「支付宝」，随后任意切换一级与二级分类，底部选中账户始终保持「支付宝」不跳动；
  3. 账户数量超过一屏时，切换分类命中屏外记忆账户，底部横向账户条平滑滚入视野并亮起主色边框；
  4. 点击「再记」保存后立即切换其他分类，账户重新恢复自动跟随最新记忆；编辑旧账或从账户详情页点「记一笔」改分类不改账户。
