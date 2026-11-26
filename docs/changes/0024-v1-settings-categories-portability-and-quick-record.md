# 0024 - v1.0.0 设置体系重构、分类管理升级、完整 JSON 校验导入导出、快捷记账半屏窗与手势震动体验

- **状态**：已执行
- **影响范围**：`src/db/`、`src/shared/`、`src/features/settings/`、`src/features/export/`、`src/features/categories/`、`src/features/quick-record/`、`src/features/transactions/`、`app/`、版本与文档
- **生效版本**：v1.0.0（Android `versionCode: 18`）
- **前置文档**：[0023-unified-header-and-swipe-drawer.md](0023-unified-header-and-swipe-drawer.md)

## 1. 背景

在完成主界面全局共享顶栏与可拖拽半屏容器后，围绕日常高频记账效率、数据安全可迁移性与分类深度管理提出综合性 1.0 升级目标：

1. **设置抽屉去冗余与分层收口**：移除抽屉头部版本号、三栏统计、「配置 / 数据导出 / 系统」分组标题、「存储」与独立「版本」行；外观切换置顶并持久化，底部居中展示版本号；拆出「关于」与「高级设置」两页；仅保留 JSON 备份（移除 CSV）且支持完整校验导入恢复；全新安装与「清空账本」统一收敛为唯一默认「钱包（¥0.00）」，清空前增加「是否已导出备份」警示、直达导出入口与随机 4 位数字验证码人工校验。
2. **分类管理全面升级**：支持独立分类 JSON 导入导出（手动编辑后支持增量合并与覆盖重建）、居中浮窗新增/编辑、内置双图库 146 项 9 主题图标、取消独立「已停用」分区（停用沉底变灰，一级连带二级不可用）、一级行右侧仅 `+` 且左滑呼出菜单、二级行直接操作、删除含账务分类支持原子迁移旧账务、长按触发同级动画拖拽排序（一级排序先自动折叠展开的二级）。
3. **记一笔动效与底栏上滑「快捷记账半屏窗」**：点击 `+` 从下向上滑入完整记一笔并支持跟手下滑退出；在底栏直接向上滑动无停顿 1:1 拉出下半屏快捷记账页，点击图标卡片无需输入直接一键入账（3.5 秒可撤销），顶部横条支持二次向上滑动无缝展开完整记一笔或向下直接收起。
4. **明细手势与全应用震动反馈**：明细顶栏「按月 / 按年 / 全部」升级为 iOS 风格长按震动跟手滑动分段控件；明细总览卡顶部日期行支持左右滑动切换上下周期；全应用核心操作接入分层马达震动反馈。

## 2. 方案

### 2.1 数据库 Schema v4、默认单一钱包与基础设施

- **Schema v4（`src/db/schema.ts`）**：新增 `app_settings`（持久化外观主题偏好）与 `quick_templates`（快捷记账一键模板）；已安装老用户覆盖升级完整保留原有账户与明细。
- **默认种子与清空（`src/db/seed.ts`）**：`DEFAULT_ACCOUNTS` 收敛为唯一账户 `acc_wallet`（`钱包`，现金资产，`¥0.00`）；`resetDatabase` 原子清空 `transactions` 与 `quick_templates`，重置为唯一钱包与系统默认分类。
- **统一震动封装（`src/shared/haptics/haptics.ts`）**：提供 `hapticSelection`、`hapticLight`、`hapticMedium`、`hapticSuccess`、`hapticWarning` 分层反馈并静默容错无震动设备。
- **双图库图标与确定性指纹**：`src/shared/ui/AppIcon.tsx` 扩展支持 `mci:` 前缀渲染 `MaterialCommunityIcons` 与默认 `Ionicons`（零新增原生依赖），`src/shared/ui/icon-catalog.ts` 收录 9 大生活主题 146 项精选图标并配自动化字形表校验单测；`src/shared/integrity/checksum.ts` 实现纯 JS BigInt 64 位 FNV-1a 校验指纹。

### 2.2 设置重构、全量 JSON 校验导入导出与清空安全门禁

- **设置抽屉（`SettingsPanel.tsx`）**：仅保留顶部 `ZeroTally` + `×`，主体按顺序为置顶外观三段切换（即时落盘 SQLite）、分类管理、关于、高级设置，最底部居中展示 `ZeroTally v1.0.0`。
- **关于页与高级设置页**：新建 `app/about.tsx` 与 `app/advanced-settings.tsx`；全量导出升级为 `EXPORT_SCHEMA_VERSION = 3` 标准 JSON（含外观、账户、分类、快捷模板、明细与 FNV-1a 指纹），移除 CSV；使用 `expo-file-system` 原生 `File.pickFileAsync` 选择本地 JSON，通过 `validateLedgerImportJson` 校验结构/外键/指纹后预览并在单一事务内原子恢复。
- **清空账本安全弹窗（`ClearLedgerDialog.tsx`）**：增加「是否已经导出 JSON 备份？」警示卡与「先去导出备份」直达按钮，以及随机 4 位数字验证码（支持刷新换码，输入匹配解锁确认，错码震动提示）。

### 2.3 分类管理全面重构

- **服务与可迁移性**：`src/features/categories/service.ts` 新增 `archiveCategory`、`deleteCategoryWithMigration`（单事务迁移 `transactions` 与 `quick_templates` 后删除）、`getCategoryTreeTransactionCount`、`reorderCategories`；新建 `src/features/categories/portability.ts` 实现两级树形 JSON 独立导出、手动编辑结构/重名/两级深度校验、增量 `merge` 与覆盖 `replace`（含历史账目旧分类自动停用保护）。
- **交互与组件**：新建居中编辑浮窗 `CategoryEditorDialog.tsx`、删除迁移浮窗 `CategoryDeleteDialog.tsx`、行组件 `CategoryManageRows.tsx`；重构 `app/categories.tsx` 实现单一列表停用沉底变灰、一级行右 `+` 与左滑菜单、二级行直接操作、长按 260ms 激活同级动画拖拽排序（一级排序先自动合并展开的二级，与一级/二级完全隔离不交叉）。

### 2.4 记一笔下滑退出、快捷记账半屏窗与明细手势增强

- **记一笔页（`app/record.tsx` + `app/_layout.tsx`）**：采用 `transparentModal` + `slide_from_bottom` 承接自下向上滑入与向下滑出；顶栏与主体列表顶部（`scrollOffsetY <= 2` 且经 `useSimultaneousGestures` 与原生滚动协同）均支持 1:1 跟手下滑退出。
- **快捷记账半屏窗（`src/features/quick-record/` + `app/(tabs)/_layout.tsx`）**：在主 Tab 底栏整条挂载纵向上滑手势（`activeOffsetY: -8`），无停顿 1:1 拉出顶层叠加下半屏窗 `QuickRecordSheet.tsx`；点击图标按钮直接原子入账并浮出 3.5 秒可撤销成功条，优先展示自定义模板（长按或 `+` 弹窗编辑），无自定义时自动汇总近 30 天高频消费/收入推荐；顶部抓手横条向下滑收起，二次向上滑跨越阈值触发震动刻度并无缝展开完整记一笔。
- **明细手势增强**：新建 `src/shared/ui/SlidingSegmentedControl.tsx` 替换顶栏「按月 / 按年 / 全部」支持点击弹簧切换与长按 140ms 震动抬起跟手滑切；`MonthlySummaryHeader.tsx` 顶部日期行挂载独立横向手势（`activeOffsetX: [-8, 8]` 优先隔离外层翻页/抽屉）支持左右滑动切换上/下一月或上/下一年。

## 3. 实施（改动文件清单）

### 新增文件
- [src/shared/haptics/haptics.ts](../../src/shared/haptics/haptics.ts)
- [src/shared/integrity/checksum.ts](../../src/shared/integrity/checksum.ts)
- [src/shared/ui/icon-catalog.ts](../../src/shared/ui/icon-catalog.ts)、[src/shared/ui/icon-catalog.test.ts](../../src/shared/ui/icon-catalog.test.ts)
- [src/shared/ui/SlidingSegmentedControl.tsx](../../src/shared/ui/SlidingSegmentedControl.tsx)
- [src/features/settings/repository.ts](../../src/features/settings/repository.ts)
- [src/features/settings/components/ClearLedgerDialog.tsx](../../src/features/settings/components/ClearLedgerDialog.tsx)
- [src/features/categories/portability.ts](../../src/features/categories/portability.ts)
- [src/features/categories/components/CategoryEditorDialog.tsx](../../src/features/categories/components/CategoryEditorDialog.tsx)
- [src/features/categories/components/CategoryDeleteDialog.tsx](../../src/features/categories/components/CategoryDeleteDialog.tsx)
- [src/features/categories/components/CategoryManageRows.tsx](../../src/features/categories/components/CategoryManageRows.tsx)
- [src/features/quick-record/types.ts](../../src/features/quick-record/types.ts)、[repository.ts](../../src/features/quick-record/repository.ts)、[service.ts](../../src/features/quick-record/service.ts)、[service.test.ts](../../src/features/quick-record/service.test.ts)
- [src/features/quick-record/components/QuickRecordSheet.tsx](../../src/features/quick-record/components/QuickRecordSheet.tsx)、[QuickTemplateEditorDialog.tsx](../../src/features/quick-record/components/QuickTemplateEditorDialog.tsx)
- [app/about.tsx](../../app/about.tsx)、[app/advanced-settings.tsx](../../app/advanced-settings.tsx)

### 修改文件
- 数据库与基础 UI：[src/db/schema.ts](../../src/db/schema.ts)、[src/db/seed.ts](../../src/db/seed.ts)、[src/db/schema.test.ts](../../src/db/schema.test.ts)、[src/shared/ui/AppIcon.tsx](../../src/shared/ui/AppIcon.tsx)、[src/shared/ui/BottomSheet.tsx](../../src/shared/ui/BottomSheet.tsx)
- 设置、导出与分类：[src/features/settings/components/SettingsPanel.tsx](../../src/features/settings/components/SettingsPanel.tsx)、[src/features/export/types.ts](../../src/features/export/types.ts)、[formatter.ts](../../src/features/export/formatter.ts)、[service.ts](../../src/features/export/service.ts)、[native-io.ts](../../src/features/export/native-io.ts)、[src/features/categories/repository.ts](../../src/features/categories/repository.ts)、[service.ts](../../src/features/categories/service.ts)、[CategoryHierarchyPicker.tsx](../../src/features/categories/components/CategoryHierarchyPicker.tsx)
- 路由与主界面交互：[app/_layout.tsx](../../app/_layout.tsx)、[app/(tabs)/_layout.tsx](../../app/(tabs)/_layout.tsx)、[app/record.tsx](../../app/record.tsx)、[app/categories.tsx](../../app/categories.tsx)、[src/features/transactions/components/MonthlySummaryHeader.tsx](../../src/features/transactions/components/MonthlySummaryHeader.tsx)、[RecordKeypad.tsx](../../src/features/transactions/components/RecordKeypad.tsx)、[TransferRoutePanel.tsx](../../src/features/transactions/components/TransferRoutePanel.tsx)
- 测试、版本与文档：[src/features/accounts/service.test.ts](../../src/features/accounts/service.test.ts)、[src/features/transactions/service.test.ts](../../src/features/transactions/service.test.ts)、[src/features/analytics/service.test.ts](../../src/features/analytics/service.test.ts)、[src/features/categories/service.test.ts](../../src/features/categories/service.test.ts)、[src/features/export/formatter.test.ts](../../src/features/export/formatter.test.ts)、[src/features/export/service.test.ts](../../src/features/export/service.test.ts)、[package.json](../../package.json)、[app.json](../../app.json)、[CHANGELOG.md](../../CHANGELOG.md)、[README.md](../../README.md)、[docs/architecture/overview.md](../../docs/architecture/overview.md)

## 4. 执行验证记录

- **执行环境**：Windows 11，Bun 1.4.5，Node.js 26，Android SDK Build-Tools 37.0.0，Android Studio JBR 21
- **质量门禁命令**：`bun run verify`
- **质量门禁输出**：
  - `node scripts/check-version.mjs`：`版本校验通过：v1.0.0`
  - `tsc --noEmit`：0 错误
  - `eslint .`：0 错误 0 警告
  - `vitest run`：**18 passed (18)，66 passed (66)**（323ms）
- **APK 构建命令**：`bun x expo prebuild --platform android --no-install && bun run build:apk`
- **APK 校验结果**：
  - 产物路径：`android/app/build/outputs/apk/release/app-release.apk`（59,976,538 字节 / 57.20 MB）
  - `aapt2 dump badging`：`package='com.keepaccounts.app'`、`versionCode='18'`、`versionName='1.0.0'`、`application-label='ZeroTally'`、`minSdkVersion='24'`、`targetSdkVersion='36'`、`native-code='arm64-v8a' 'x86_64'`
  - `apksigner verify --verbose`：`Verifies`（APK Signature Scheme v2 = true，signers = 1）
  - SHA-256：`A07238C56FD76609211F6CCEFB2E44F4D4548247681F51563574ADDADDEED1B6`
- **验证结论**：通过。
- **已知限制**：Node 自动化测试已覆盖 Schema 迁移、单钱包重置、全量/分类 JSON 校验导入导出、分类迁移与重排、快捷模板与推荐聚合及图标字形表真实存在性；多向手势协同与物理马达震动质感仍需在 Android 真机安装 APK 体验确认。

## 5. 后续验证建议

1. **设置与数据迁移**：验证侧边抽屉精简排版、外观切换重启持久化、高级设置完整导出 JSON → 修改或清空账本（体验备份警示、「先去导出备份」直达及 4 位验证码拦截）→ 重新导入无损恢复。
2. **分类管理**：测试居中弹窗新增与 9 主题图标选择、一级左滑菜单与右 `+`、长按自动折叠并同级拖拽排序、删除含账务分类迁移旧账务、导出分类 JSON 手改后增量与覆盖导入。
3. **手势与快捷记账**：测试点击底栏 `+` 自下向上滑入与记一笔跟手下滑退出；测试在底栏无停顿上滑拉出「快捷记账半屏窗」、一键入账与 3.5 秒撤销、顶部横条二次上滑无缝进入完整记一笔；测试明细顶栏「按月 / 按年 / 全部」长按震动滑动切换及总览卡日期行左右滑动切期。
