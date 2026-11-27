# 变更记录索引

本目录按目录内局部编号保存每次源码改动的不可变变更记录与验证证据。

## 文档清单

| 文档 | 类型 | 状态 | 生效版本 | 概览 |
| --- | --- | --- | --- | --- |
| [0001-initial-mvp.md](0001-initial-mvp.md) | 变更记录 | 已执行 | v0.1.0 | 首版基础支出、收入、转账与资产管理实现与验证 |
| [0002-local-android-apk-build.md](0002-local-android-apk-build.md) | 变更记录 | 已执行 | v0.1.0 | 打通 Windows 本地 Android 原生 Release APK 打包流程与验证 |
| [0003-redesign-app-logo.md](0003-redesign-app-logo.md) | 变更记录 | 已执行 | v0.1.0 | 重新设计深玉青极简账本 + ¥ 矢量 Logo 与 Android 三层自适应图标并重打 APK |
| [0004-switch-package-manager-to-bun.md](0004-switch-package-manager-to-bun.md) | 变更记录 | 已执行 | v0.1.0 | 将包管理器由 pnpm 迁移至 Bun（`bunfig.toml` + `bun.lock`） |
| [0005-refine-bottom-nav-and-settings-entry.md](0005-refine-bottom-nav-and-settings-entry.md) | 变更记录 | 已执行 | v0.1.0 | 底栏改版为半高双栏（明细 / 资产）+ 居中凸起「+」记一笔，设置移至右上角 |
| [0006-ui-cutout-copy-analytics-export.md](0006-ui-cutout-copy-analytics-export.md) | 变更记录 | 已执行 | v0.1.0 | 异形屏安全区适配、全页布局与文案精修、新增账务分析页及 JSON/CSV 结构化导出 |
| [0007-open-source-zerotally-and-github-actions.md](0007-open-source-zerotally-and-github-actions.md) | 变更记录 | 已执行 | v0.1.0 | 以 MIT 协议开源发布至 GitHub（ZeroTally）并配置 Actions 自动构建发布 APK |
| [0008-two-level-categories-and-custom-keypad.md](0008-two-level-categories-and-custom-keypad.md) | 变更记录 | 已执行 | v0.2.0 | 记一笔页面重构为上方二级分类 + 下方输入栏与自制数字计算键盘，配套底部选择面板与一级汇总分析 |
| [0009-ledger-swipe-detail-sheet-and-refund.md](0009-ledger-swipe-detail-sheet-and-refund.md) | 变更记录 | 已执行 | v0.3.0 | 明细与账户流水支持左滑二级菜单、下半屏浮出详情窗及关联抵扣式退款（Schema v3） |
| [0010-ios-style-swipe-action-animation.md](0010-ios-style-swipe-action-animation.md) | 变更记录 | 已执行 | v0.3.1 | 明细左滑重构为 iOS 风格按钮随行自右缘等比平推带出与阻尼橡皮筋回弹动效 |
| [0011-compact-record-category-grid.md](0011-compact-record-category-grid.md) | 变更记录 | 已执行 | v0.3.2 | 记一笔页面一级与二级分类图标尺寸调小，单行显示由 4 列提升至 5 列 |
| [0012-swipeable-main-tabs.md](0012-swipeable-main-tabs.md) | 变更记录 | 已执行 | v0.4.0 | 主界面支持左右跟手滑动平滑切换「明细」与「资产」，并与单行左滑菜单隔离 |
| [0013-direct-account-strip-calendar-drilldown-and-multi-period.md](0013-direct-account-strip-calendar-drilldown-and-multi-period.md) | 变更记录 | 已执行 | v0.5.0 | 记一笔融合横向直选账户卡片、三层钻取滑动日历/周期弹窗、明细按月按年与分析按月按年全部 |
| [0014-fix-tabs-structure-and-record-keypad-order.md](0014-fix-tabs-structure-and-record-keypad-order.md) | 变更记录 | 已执行 | v0.5.1 | 修复主界面缺失资产 Tab 与底栏偏移、5 处常驻 Modal 及布局细节，调换记一笔账户/日期位置 |
| [0015-keyboard-avoidance-delete-dialog-all-ledger-and-swipe-tabs.md](0015-keyboard-avoidance-delete-dialog-all-ledger-and-swipe-tabs.md) | 变更记录 | 已执行 | v0.6.0 | 修复备注软键盘遮挡、美化删除账目确认弹窗、精简周期单按钮、补齐明细全部模式并打通双页滑动手势协同 |
| [0016-rename-app-to-zerotally.md](0016-rename-app-to-zerotally.md) | 变更记录 | 已执行 | v0.6.1 | 弃用中文名「简记」，应用名称与全仓现状文档统一更名为 ZeroTally |
| [0017-full-ui-consistency-audit-and-app-name-cleanup.md](0017-full-ui-consistency-audit-and-app-name-cleanup.md) | 变更记录 | 已执行 | v0.6.2 | 全量 UI 一致性审计修复（清零 12 处原生 Alert、统一表单/弹窗/按压态）与导出/版本品牌名统一为 ZeroTally |
| [0018-side-drawer-hamburger-settings-menu.md](0018-side-drawer-hamburger-settings-menu.md) | 变更记录 | 已执行 | v0.7.0 | 新增左上角汉堡菜单与可手势关闭的左侧设置抽屉，取消明细与资产页右上角设置按钮 |
| [0019-redesign-transfer-route-panel.md](0019-redesign-transfer-route-panel.md) | 变更记录 | 已执行 | v0.7.1 | 优化转账界面：并排聚焦双卡 + 悬浮互换、转后余额/欠款实时预览、2 列内联直选网格与底部路径融合条 |
| [0020-category-account-memory.md](0020-category-account-memory.md) | 变更记录 | 已执行 | v0.8.0 | 收支记账新增分类记忆上次使用账户（零 Schema 派生 + 四层回退 + 单次手动锁定 + 账户条自动滚入视野） |
| [0021-account-strip-edge-fade-mask.md](0021-account-strip-edge-fade-mask.md) | 变更记录 | 已执行 | v0.8.1 | 记账页横向账户条移除生硬分隔竖线，改用 RN 原生动态左右缓动渐变遮罩柔和过渡 |
| [0022-draggable-bottom-sheet.md](0022-draggable-bottom-sheet.md) | 变更记录 | 已执行 | v0.9.0 | 统一重构全应用 6 个底部半屏弹窗为真实可拖拽 BottomSheet（支持下滑关闭与账目详情半屏/全屏两段展开） |
| [0023-unified-header-and-swipe-drawer.md](0023-unified-header-and-swipe-drawer.md) | 变更记录 | 已执行 | v0.9.1 | 重构主界面为全局固定共享极简顶栏（移除汉堡图标、双页点击标题及明细页跟手右滑拉出设置抽屉） |
| [0024-v1-settings-categories-portability-and-quick-record.md](0024-v1-settings-categories-portability-and-quick-record.md) | 变更记录 | 已执行 | v1.0.0 | 设置重构与完整 JSON 校验导入导出、验证码清空账本、分类管理全面升级、快捷记账半屏窗、明细手势与全应用震动反馈 |
| [0025-unified-segmented-control-and-ui-polish.md](0025-unified-segmented-control-and-ui-polish.md) | 变更记录 | 已执行 | v1.0.1 | 全仓 7 处分段切换统一为滑动分段组件、设置「关于」置底与 database 图标、分类管理圆润卡片重构、清空账本二次确认与快捷记账全区上下滑/横向分页 |
| [0026-quick-record-radial-scrub-undo-ring.md](0026-quick-record-radial-scrub-undo-ring.md) | 变更记录 | 已执行 | v1.1.0 | 底栏长按 `+` 扇形极速记账、快捷卡片原地 3 秒圆环倒计时撤销与轻/长震动区分、单卡长按调金额/切账户、内嵌复用记一笔 UI 编辑及顶栏精简 |
| [0027-fix-longpress-gestures-floating-hud-and-settings-about.md](0027-fix-longpress-gestures-floating-hud-and-settings-about.md) | 变更记录 | 已执行 | v1.1.1 | 修复全仓 `activateAfterLongPress + minDistance: 0` 导致单击被长按手势误拦截问题、加固 3 秒原地撤销稳定性、微调 HUD 重构为顶层半透明悬浮卡片及设置顶栏右上角改置纯 `i` 关于图标 |
| [0028-fullscreen-quick-template-composer.md](0028-fullscreen-quick-template-composer.md) | 变更记录 | 已执行 | v1.1.2 | 快捷卡片新增/编辑页升级为全屏「记一笔」同款页面（去转账/日期、备注改卡片名），支持跟手下滑收起仅返回快捷记账面板 |
| [0029-fix-quick-composer-account-strip.md](0029-fix-quick-composer-account-strip.md) | 变更记录 | 已执行 | v1.1.3 | 修复 `RecordKeypad` 隐藏日期按钮后横向账户选择条因 `flex: 1` 高度塌陷为 0 导致快捷卡片新增/编辑无法选择账户的问题 |
| [0030-polish-segmented-alignment-and-quick-cards.md](0030-polish-segmented-alignment-and-quick-cards.md) | 变更记录 | 已执行 | v1.1.4 | 修复全应用 `SlidingSegmentedControl` 选中滑块偏下不对称问题，并将快捷记账面板升级为舒展 2×3 宽卡排布 |
| [0031-ledger-daily-totals-and-all-mode-year.md](0031-ledger-daily-totals-and-all-mode-year.md) | 变更记录 | 已执行 | v1.1.5 | 明细单日收支仅保留「支 / 收」并将当日退款归入收入（其余逻辑不变），同时在「全部」模式日分组标题中显示完整年份 |
| [0032-refund-input-and-unified-bottom-sheet.md](0032-refund-input-and-unified-bottom-sheet.md) | 变更记录 | 已执行 | v1.2.0 | 退款金额改占位默认、自动两位截断/规整并放开金额上限；升级统一可手势拖拽 BottomSheet 基座并收口全仓 6 处弹窗 |
| [0033-fix-expanded-bottom-sheet-swipe-down.md](0033-fix-expanded-bottom-sheet-swipe-down.md) | 变更记录 | 已执行 | v1.2.1 | 修复 RNGH v3 `onActivate` 位移归零导致底部手势卡片上滑展开后与单段滚动区下滑收起失效的问题 |
| [0034-quick-card-sizing-and-velocity-scrub-steps.md](0034-quick-card-sizing-and-velocity-scrub-steps.md) | 变更记录 | 已执行 | v1.3.0 | 统一快捷卡片与「添加快捷」卡片等宽等高对齐，并将长按上下滑调金额升级为 0.01~1 元五档速度自适应步进 |
| [0035-account-model-overhaul-archive-settle-delete.md](0035-account-model-overhaul-archive-settle-delete.md) | 变更记录 | 已执行 | v1.4.0 | 账户类型驱动性质、三独立统计开关与银行卡信息（Schema v5）、停用改归档并移出资产一级页、平账可选生成记录、删除账户三重确认与级联清除 |
| [0036-cloud-backup-webdav-and-google-drive.md](0036-cloud-backup-webdav-and-google-drive.md) | 变更记录 | 已执行 | v1.5.0 | 设置侧栏接入双通道云备份（WebDAV 与 Google Drive OAuth PKCE）、硬件加密凭据隔离、多版本历史快照恢复与防抖自动云备份 |
| [0037-liability-repayment.md](0037-liability-repayment.md) | 变更记录 | 已执行 | v1.6.0 | 负债账户新增还款功能（Schema v6 / 备份 v5），支持资产转入与无账户直接还款、详情编辑与删除回滚且不计入月度收支 |
