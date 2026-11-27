# 文档中心

本目录存放「ZeroTally（keep-accounts）」的架构说明、关键决策、变更记录与问题排查文档。代码规范与 Agent 执行要求见根目录 [AGENTS.md](../AGENTS.md)。

## 目录索引

| 分类目录 | 用途 | 入口文档 |
| --- | --- | --- |
| `architecture/` | 系统架构、模块边界、核心规则与变更局部性说明（现状文档） | [architecture/README.md](architecture/README.md) |
| `decisions/` | 关键技术与结构决策记录（不可变历史文档） | [decisions/README.md](decisions/README.md) |
| `changes/` | 源码改动随行变更记录与验证报告（不可变历史文档） | [changes/README.md](changes/README.md) |
| `troubleshooting/` | 长期、可复现问题的排查与解决方案 | [troubleshooting/README.md](troubleshooting/README.md) |
| `assets/` | README 品牌封面图与界面预览图等文档视觉资源 | [../README.md](../README.md) |

## 文档清单

| 路径 | 类型 | 状态 | 概览 |
| --- | --- | --- | --- |
| [architecture/overview.md](architecture/overview.md) | 参考说明 | 参考 | 模块职责边界、用例与规则索引、依赖方向、变更场景模拟 |
| [decisions/0001-tech-stack-and-architecture.md](decisions/0001-tech-stack-and-architecture.md) | 架构决策 | 已执行 | 技术栈选型、金额分存储、负债净值符号约定与 SQLite 抽象决策（包管理器部分由 0002 替代） |
| [decisions/0002-switch-package-manager-to-bun.md](decisions/0002-switch-package-manager-to-bun.md) | 架构决策 | 已执行 | 将包管理器更换为 Bun 并显式启用 hoisted 扁平布局 |
| [changes/0001-initial-mvp.md](changes/0001-initial-mvp.md) | 变更记录 | 已执行 | v0.1.0 首版功能实现清单与验证记录 |
| [changes/0002-local-android-apk-build.md](changes/0002-local-android-apk-build.md) | 变更记录 | 已执行 | 打通 Windows 本地 Android 原生 Release APK 打包与产物校验 |
| [changes/0003-redesign-app-logo.md](changes/0003-redesign-app-logo.md) | 变更记录 | 已执行 | 重新设计品牌矢量 Logo、Android 三层自适应图标与启动页并重打 APK |
| [changes/0004-switch-package-manager-to-bun.md](changes/0004-switch-package-manager-to-bun.md) | 变更记录 | 已执行 | 将包管理器由 pnpm 迁移至 Bun 并完成全量验证 |
| [changes/0005-refine-bottom-nav-and-settings-entry.md](changes/0005-refine-bottom-nav-and-settings-entry.md) | 变更记录 | 已执行 | 重构底栏为半高双栏加居中凸起「+」记一笔主按钮，并将设置迁至顶栏右上角 |
| [changes/0006-ui-cutout-copy-analytics-export.md](changes/0006-ui-cutout-copy-analytics-export.md) | 变更记录 | 已执行 | 异形屏安全区适配、全页布局与文案精修、新增账务分析页及 JSON/CSV 结构化导出 |
| [changes/0007-open-source-zerotally-and-github-actions.md](changes/0007-open-source-zerotally-and-github-actions.md) | 变更记录 | 已执行 | 以 MIT 协议开源至 GitHub（ZeroTally）并配置 Actions 自动打包发布 APK |
| [changes/0008-two-level-categories-and-custom-keypad.md](changes/0008-two-level-categories-and-custom-keypad.md) | 变更记录 | 已执行 | 记一笔重构为上方二级分类与下方自制数字计算键盘，全链路适配两级分类（v0.2.0） |
| [changes/0009-ledger-swipe-detail-sheet-and-refund.md](changes/0009-ledger-swipe-detail-sheet-and-refund.md) | 变更记录 | 已执行 | 明细与账户流水支持左滑二级菜单、下半屏详情浮窗与关联抵扣式退款（v0.3.0） |
| [changes/0010-ios-style-swipe-action-animation.md](changes/0010-ios-style-swipe-action-animation.md) | 变更记录 | 已执行 | 明细左滑重构为 iOS 风格按钮自右缘联动带出与阻尼橡皮筋回弹动效（v0.3.1） |
| [changes/0011-compact-record-category-grid.md](changes/0011-compact-record-category-grid.md) | 变更记录 | 已执行 | 记一笔分类网格调小图标尺寸并调整为每行 5 列展示（v0.3.2） |
| [changes/0012-swipeable-main-tabs.md](changes/0012-swipeable-main-tabs.md) | 变更记录 | 已执行 | 主界面支持左右跟手滑动平滑切换「明细」与「资产」（v0.4.0） |
| [changes/0013-direct-account-strip-calendar-drilldown-and-multi-period.md](changes/0013-direct-account-strip-calendar-drilldown-and-multi-period.md) | 变更记录 | 已执行 | 记一笔直选账户条、三层钻取滑动日历与多周期明细/账务分析（v0.5.0） |
| [changes/0014-fix-tabs-structure-and-record-keypad-order.md](changes/0014-fix-tabs-structure-and-record-keypad-order.md) | 变更记录 | 已执行 | 修复主界面双 Tab 与底栏结构缺陷、多处 UI bug 及调换记一笔账户/日期位置（v0.5.1） |
| [changes/0015-keyboard-avoidance-delete-dialog-all-ledger-and-swipe-tabs.md](changes/0015-keyboard-avoidance-delete-dialog-all-ledger-and-swipe-tabs.md) | 变更记录 | 已执行 | 修复备注软键盘遮挡、美化删除确认弹窗、精简周期单按钮、明细全部模式与双页滑动协同（v0.6.0） |
| [changes/0016-rename-app-to-zerotally.md](changes/0016-rename-app-to-zerotally.md) | 变更记录 | 已执行 | 弃用中文名「简记」，应用与全仓现状文档统一更名为 ZeroTally（v0.6.1） |
| [changes/0017-full-ui-consistency-audit-and-app-name-cleanup.md](changes/0017-full-ui-consistency-audit-and-app-name-cleanup.md) | 变更记录 | 已执行 | 全量 UI 状态一致性审计修复（清零原生 Alert）与导出/品牌名统一为 ZeroTally（v0.6.2） |
| [changes/0018-side-drawer-hamburger-settings-menu.md](changes/0018-side-drawer-hamburger-settings-menu.md) | 变更记录 | 已执行 | 新增左上角汉堡菜单与左侧设置抽屉并取消右上角设置按钮（v0.7.0） |
| [changes/0019-redesign-transfer-route-panel.md](changes/0019-redesign-transfer-route-panel.md) | 变更记录 | 已执行 | 优化转账界面：并排双卡、转后余额/欠款预览、内联直选网格与键盘路径融合条（v0.7.1） |
| [changes/0020-category-account-memory.md](changes/0020-category-account-memory.md) | 变更记录 | 已执行 | 收支记账新增分类账户记忆、四层回退、单次手动锁定与账户条自动滚入视野（v0.8.0） |
| [changes/0021-account-strip-edge-fade-mask.md](changes/0021-account-strip-edge-fade-mask.md) | 变更记录 | 已执行 | 记账页横向账户条边缘改用动态缓动渐变遮罩柔和过渡（v0.8.1） |
| [changes/0022-draggable-bottom-sheet.md](changes/0022-draggable-bottom-sheet.md) | 变更记录 | 已执行 | 全应用底部半屏弹窗统一重构为可跟手下拉关闭与详情两段展开的 BottomSheet（v0.9.0） |
| [changes/0023-unified-header-and-swipe-drawer.md](changes/0023-unified-header-and-swipe-drawer.md) | 变更记录 | 已执行 | 主界面顶栏上提为全局固定共享极简壳层，移除汉堡图标并支持点击标题与明细页右滑拉出设置抽屉（v0.9.1） |
| [changes/0024-v1-settings-categories-portability-and-quick-record.md](changes/0024-v1-settings-categories-portability-and-quick-record.md) | 变更记录 | 已执行 | 设置抽屉极简重构、完整与分类 JSON 校验导入导出、备份警示+验证码清空、分类拖拽迁移、快捷记账半屏窗与明细手势增强（v1.0.0） |
| [changes/0025-unified-segmented-control-and-ui-polish.md](changes/0025-unified-segmented-control-and-ui-polish.md) | 变更记录 | 已执行 | 全仓 7 处分段切换统一为滑动分段组件、设置「关于」置底与 database 图标、分类圆润卡片化、清空二次确认菜单及快捷记账全区上下滑与左右分页（v1.0.1） |
| [changes/0026-quick-record-radial-scrub-undo-ring.md](changes/0026-quick-record-radial-scrub-undo-ring.md) | 变更记录 | 已执行 | 底栏长按 `+` 扇形极速记账、快捷卡片原地 3 秒圆环倒计时撤销与轻/长震动区分、单卡长按调金额/切账户、内嵌复用记一笔 UI 编辑及顶栏精简（v1.1.0） |
| [changes/0027-fix-longpress-gestures-floating-hud-and-settings-about.md](changes/0027-fix-longpress-gestures-floating-hud-and-settings-about.md) | 变更记录 | 已执行 | 修复长按手势误拦截单击、加固快捷卡 3 秒原地撤销、微调升级为顶层半透明悬浮 HUD 及设置顶栏纯 `i` 关于图标（v1.1.1） |
| [changes/0028-fullscreen-quick-template-composer.md](changes/0028-fullscreen-quick-template-composer.md) | 变更记录 | 已执行 | 快捷卡片新增/编辑页升级为全屏「记一笔」同款页面并支持跟手下滑退回快捷面板（v1.1.2） |
| [changes/0029-fix-quick-composer-account-strip.md](changes/0029-fix-quick-composer-account-strip.md) | 变更记录 | 已执行 | 修复快捷卡片新增/编辑页隐藏日期后横向账户选择条高度塌陷无法选账户的问题（v1.1.3） |
| [changes/0030-polish-segmented-alignment-and-quick-cards.md](changes/0030-polish-segmented-alignment-and-quick-cards.md) | 变更记录 | 已执行 | 修复全应用分段滑块选中框偏下对齐问题并重构快捷记账卡片为舒展 2×3 宽卡排版（v1.1.4） |
| [changes/0031-ledger-daily-totals-and-all-mode-year.md](changes/0031-ledger-daily-totals-and-all-mode-year.md) | 变更记录 | 已执行 | 明细单日收支仅保留「支 / 收」并将退款归入收入，同时「全部」模式日分组标题附带年份（v1.1.5） |
| [changes/0032-refund-input-and-unified-bottom-sheet.md](changes/0032-refund-input-and-unified-bottom-sheet.md) | 变更记录 | 已执行 | 退款金额占位默认、两位截断规整与放开上限，并升级统一手势 BottomSheet 基座收口全仓 6 处底部弹窗（v1.2.0） |
| [changes/0033-fix-expanded-bottom-sheet-swipe-down.md](changes/0033-fix-expanded-bottom-sheet-swipe-down.md) | 变更记录 | 已执行 | 修复 RNGH v3 `onActivate` 位移归零导致底部手势卡片上滑展开后与单段滚动区下滑收起失效的问题（v1.2.1） |
| [changes/0034-quick-card-sizing-and-velocity-scrub-steps.md](changes/0034-quick-card-sizing-and-velocity-scrub-steps.md) | 变更记录 | 已执行 | 统一快捷卡片与添加快捷尺寸对齐，并将长按调金额升级为 0.01~1 元五档速度自适应步进（v1.3.0） |
| [changes/0035-account-model-overhaul-archive-settle-delete.md](changes/0035-account-model-overhaul-archive-settle-delete.md) | 变更记录 | 已执行 | 账户体系重构：类型驱动性质、三独立开关、银行卡信息、归档/平账/删除升级（v1.4.0） |
| [troubleshooting/0001-windows-android-apk-build.md](troubleshooting/0001-windows-android-apk-build.md) | 部署运维 | 参考 | Windows 下扁平依赖 hoisting 与 CMake/Ninja 路径长度问题排查方案 |

## 文档规范

1. 文档一律使用简体中文，存放在 `docs/` 对应分类子目录下，不存放业务代码。
2. 现状文档（如 `architecture/overview.md`）随系统演进同步更新；不可变文档（`decisions/` 与 `changes/` 中状态为「已执行」的编号文档）定稿后不重写，后续变更另建编号文档并注明替代关系。
3. 编号文档在各自子目录内从 `0001` 局部递增，头部须包含元数据（状态、影响范围、生效版本、前置或替代文档）。
4. 每次源码变更在交付前须同步在 `changes/` 记录背景、方案、改动文件清单、执行验证记录与后续建议，并回到本文件更新索引。
