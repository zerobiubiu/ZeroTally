# 0001 技术栈选型与核心财务数据模型决策

- **状态**：已执行
- **影响范围**：全项目基础架构与本地数据层
- **生效版本**：v0.1.0
- **前置文档**：无
- **替代文档**：无

## 结论

1. 采用 **Expo SDK 58 + TypeScript + Expo Router + `expo-sqlite` + pnpm（hoisted）** 构建 Android 本地离线记账应用。
2. 抽象极简 `SqlExecutor` 接口：Android 运行时使用 `expo-sqlite`，Node 单元测试使用内置 `node:sqlite`（`DatabaseSync(':memory:')`），不引入需本地 C++ 编译的原生依赖。
3. 所有金额以整数「分」（`cents`）存储与计算，禁止浮点金额运算。
4. 所有账户的 `balance_cents` 采用统一的「账户净值」符号约定：资产账户余额通常为正，负债账户（信用卡、花呗、借款等）欠款以负数存储。

## 背景与备选方案

### 1. 框架与包管理器

- **采用方案**：Expo（TypeScript + Expo Router）+ pnpm（`.npmrc` 配置 `node-linker=hoisted`）。
- **备选方案与否决理由**：
  - React Native Community CLI（Bare RN）：需从零手工配置导航、SQLite 原生链接与 Gradle 环境，初期样板成本高且依赖本机 JDK/SDK 立即就绪。
  - AsyncStorage + JSON 文件：不支持事务与关系索引，记账更新余额时在异常中断场景下易出现账目与余额不一致。
- **代价**：引入 Expo 生态版本对齐约束，升级大版本需遵循 Expo SDK 兼容矩阵。

### 2. 本地 SQLite 测试策略

- **采用方案**：定义 `SqlExecutor` 契约，Vitest 单测直接运行在 Node 26 内置 `node:sqlite` 内存数据库上。
- **备选方案与否决理由**：
  - Mock `expo-sqlite` 函数调用：无法验证真实 SQL 语法、外键约束、CHECK 约束与事务回滚。
  - `better-sqlite3`：在 Windows 环境依赖本地 C++ 编译工具链，安装脆弱。
- **代价**：需保证编写的 SQL 同时兼容 Android SQLite 与 Node SQLite（均遵循标准 SQLite 3 语法，成本极低）。

### 3. 负债账户余额符号约定

- **采用方案**：`accounts.balance_cents` 统一表达账户对净资产的贡献值（负债欠款 500 元存为 `-50000` 分，溢缴款 100 元存为 `+10000` 分）。
- **收益**：
  - 记账余额联动规则对所有账户完全一致：支出恒为 `-amount`，收入恒为 `+amount`，转账恒为转出账户 `-amount`、转入账户 `+amount`（例如储蓄卡向信用卡转账 500 元还款，信用卡余额由 `-50000` 归零为 `0`，净资产不变）。
  - 净资产严格等于所有计入净资产账户的 `balance_cents` 之和，消除分支符号翻转错误。
- **代价**：UI 表单在创建或校准负债账户时，需将用户输入的正数「当前欠款」转换为负数存储，展示层显式区分「余额」与「待还欠款」。

## 重审条件

- 若未来引入多币种汇率换算或云端同步，需新增独立决策文档补充汇率快照表与同步冲突解决模型。
- 若需使用 Android 原生底层特性超出 Expo Config Plugin 能力，可基于 `expo prebuild` 转为自定义开发构建，无需推翻业务代码。
