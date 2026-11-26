# 0019 优化转账界面交互与布局设计

- **状态**：已执行
- **影响范围**：`src/features/transactions/components/TransferRoutePanel.tsx`、`src/features/transactions/components/RecordKeypad.tsx`、`app/record.tsx`、`src/features/settings/components/SettingsPanel.tsx`、版本清单与文档
- **生效版本**：v0.7.1（Android `versionCode: 13`）
- **前置文档**：[0013-direct-account-strip-calendar-drilldown-and-multi-period.md](0013-direct-account-strip-calendar-drilldown-and-multi-period.md)、[0014-fix-tabs-structure-and-record-keypad-order.md](0014-fix-tabs-structure-and-record-keypad-order.md)

## 背景

此前记一笔页面的「转账」模式上半区仅放置了一张垂直排列的「转出 / 转入」卡片，导致以下体验与视觉问题：

1. **视觉空洞**：顶部卡片下方至数字键盘之间存在大片空白死区，屏幕中段信息密度严重失衡；
2. **交互链路冗长**：切换转出或转入账户必须点击卡片弹出二级 `AccountPickerSheet` 弹窗，比支出/收入模式的直选效率低；
3. **缺少资金变动反馈**：输入转账金额时看不到转出后余额、是否透支或信用卡/负债账户还款后的剩余待还欠款；
4. **底部融合条不对称**：转账模式隐藏了横向账户条后，键盘上方的 `selectorStrip` 左侧完全留白，仅右侧孤零零保留「今天」日期按钮。

## 方案

1. **顶部并排聚焦双卡 + 居中悬浮互换（`src/features/transactions/components/TransferRoutePanel.tsx`）**：
   - 将转出与转入改为左右并排的聚焦双卡（`flex: 1`，间距 `18dp`），居中悬浮 `32×32`（`hitSlop={8}`，48dp 触控热区）圆形晴蓝 `swap-horizontal` 互换按钮，既建立直观流向视觉连接，又与卡片内容区保持安全呼吸间隙不遮挡文字与图标。
   - 语义配色分层：聚焦「转出账户」采用主色 `action` 2px 边框 + `actionSubtle` 浅底；聚焦「转入账户」采用晴蓝 `transfer` 2px 边框 + `transferSubtle` 浅底；切换聚焦边框时动态补偿 1px 内边距避免跳动；目标账户为负债类型时自动标识为「转入 · 还款」。
2. **转后余额与欠款实时预览**：
   - `app/record.tsx` 将实时求值后的有效金额 `evaluatedAmountCents` 传入 `TransferRoutePanel`；金额大于 0 时，双卡内复用 `describeAccountBalance` 实时展示「→ 余额 / 待还 ¥xx.xx」预览，转出透支或负债态自动标红（`expense`）提示风险。
3. **中部 2 列内联直选账户网格（告别二级弹窗）**：
   - 紧接路由卡下方直接铺开 2 列账户网格，奇数账户自动补透明占位对齐，并随顶部聚焦槽位自动切换「选择转出账户 / 选择转入账户」语义色与「转出 / 转入」胶囊角标。
   - 点选任意账户一步切换当前聚焦槽位；点选已处于对端槽位的账户自动触发 `onSwap()` 互换，彻底移除转账场景对 `AccountPickerSheet` 的弹窗依赖。
4. **键盘上方转账路径融合条（`src/features/transactions/components/RecordKeypad.tsx`）**：
   - 为 `RecordKeypad` 新增 `transferRouteSummary` 属性；转账模式下在 `selectorStrip` 左侧渲染与支出/收入横向账户条等高（`46dp`）的紧凑路径速览按钮（`转出名 → 转入名  ⇄`）+ 竖线分隔 + 右侧固定日期按钮，消灭底部左侧空白并支持在手贴键盘区时一键互换。

## 实施（改动文件清单）

- 新增：`src/features/transactions/components/TransferRoutePanel.tsx`。
- 修改：`src/features/transactions/components/RecordKeypad.tsx`、`app/record.tsx`、`src/features/settings/components/SettingsPanel.tsx`。
- 版本与文档：`package.json`、`app.json`、`CHANGELOG.md`、`docs/changes/0019-redesign-transfer-route-panel.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows（PowerShell），Bun + TypeScript 6 + ESLint 9 + Vitest 5
- **验证命令**：`bun run verify`（依次执行 `check:version`、`tsc --noEmit`、`eslint .`、`vitest run`）
- **实际输出**：
  - `node scripts/check-version.mjs`：`版本校验通过：v0.7.1`
  - `tsc --noEmit`：0 错误退出
  - `eslint .`：0 错误、0 警告退出
  - `vitest run`：`Test Files 15 passed (15)`，`Tests 56 passed (56)`（228ms）
- **验证结论**：通过。
- **已知限制**：本次仅完成静态检查与单元测试，尚未打包 `v0.7.1` Android Release APK 并在真机实测不同账户数量（2 个、3 个、6 个以上）及深色模式下的转账页面视觉效果。

## 后续验证建议

- 构建 `v0.7.1` Android Release APK 并在真机重点核验：
  1. 转账页在 2 个与多于 4 个账户时，上方双卡 + 中部 2 列内联网格排版均衡，居中互换按钮不遮挡长账户名与图标；
  2. 点击「转出 / 转入」双卡切换聚焦槽位，点击网格账户一步生效，点击对端账户自动互换；
  3. 输入普通金额、算术表达式与超额透支金额时，双卡转后余额 / 待还欠款预览与红字预警实时同步；
  4. 键盘上方转账路径融合条高度与支出/收入模式完全齐平，点击路径条可一键互换，浅色与深色模式对比度均清晰。
