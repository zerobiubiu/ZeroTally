# 0036：接入双通道云备份（WebDAV 与 Google Drive）与多版本快照恢复

- **状态**：已执行
- **影响范围**：`app.json`、`package.json`、`app/cloud-backup.tsx`、`app/_layout.tsx`、`app/advanced-settings.tsx`、`src/features/cloud-backup/*`、`src/features/settings/components/SettingsPanel.tsx`、`docs/architecture/overview.md`
- **生效版本**：v1.5.0（Android `versionCode: 30`）
- **前置文档**：[0024-v1-settings-categories-portability-and-quick-record.md](0024-v1-settings-categories-portability-and-quick-record.md)、[0035-account-model-overhaul-archive-settle-delete.md](0035-account-model-overhaul-archive-settle-delete.md)

## 背景

ZeroTally 此前已具备完整的本地 Schema v4 JSON 备份与 FNV-1a 校验恢复能力，但依赖用户手工导出与保存文件。用户提出在设置侧栏接入云备份能力，同时支持标准 WebDAV 网盘与 Google Drive，以降低跨设备迁移与长期留存成本。

## 方案

1. **硬件安全凭据隔离与零 SQLite Schema 变更**：
   - 新增原生依赖 `expo-secure-store`、`expo-web-browser`、`expo-crypto`，在 `app.json` 扩展多自定义 scheme `["keep-accounts", "com.keepaccounts.app"]`。
   - 非敏感配置（WebDAV 地址/账号/目录、自动备份开关、保留上限、Google Client ID / 文件夹 ID / 账号邮箱、最近同步状态）持久化到既有 `app_settings` 表（key：`cloud_backup_config`），无需升级 SQLite Schema。
   - WebDAV 密码与 Google Drive OAuth 令牌独立加密存储在 Android Keystore / iOS Keychain（`expo-secure-store`，`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`），绝不写入 SQLite、导出 JSON 或日志。
2. **双通道云适配器**：
   - **WebDAV**（`webdav-provider.ts`）：内置坚果云 / Nextcloud / 自定义预设；默认强制 HTTPS（局域网场景可显式勾选 HTTP 明文并附警告条），严格禁止 URL 嵌入凭据与路径穿越；支持 `PROPFIND` 测试连接、逐级 `MKCOL` 自动建目录、`PUT` 上传、线性防 XXE/ReDoS 的 `PROPFIND` XML 快照列表解析、`GET`（50 MiB 上限保护）下载与幂等 `DELETE`。
   - **Google Drive**（`google-drive-provider.ts`）：采用系统浏览器 OAuth 2.0 PKCE（`S256` + `state` 防 CSRF 校验，零 `client_secret`），支持编译期预置 `EXPO_PUBLIC_GOOGLE_DRIVE_ANDROID_CLIENT_ID` 或应用内自填 Android Client ID，回调 URI 为 `com.keepaccounts.app:/cloud-backup`（直达当前路由避免 Expo Router 未匹配路由闪屏）；仅申请 `https://www.googleapis.com/auth/drive.file` 最小权限并在网盘根目录维护可见文件夹 `ZeroTally/`；支持提前 120 秒自动 `refresh_token` 续期与断开时尽力 `revoke`。
3. **多版本历史快照与防抖自动云备份**：
   - 云端内容直接复用 `export/service.ts` 的 Schema v4 JSON（与手动导入导出 100% 互通），文件名采用 `ZeroTally-YYYY-MM-DDTHH-mm-ssZ.json`。
   - 支持配置保留最近 `5 / 10 / 20 / 不限` 份快照，每次上传成功后自动清理超限旧快照；支持在统一手势 `BottomSheet` 中浏览任意版本、下载校验预览并单事务原子覆盖恢复。
   - 在 `app/_layout.tsx` 挂载账本变动防抖监听（15 秒防抖 + 60 秒最小冷却 + 并发锁 + 恢复/清空后 25 秒抑制窗口），开启「账本变动自动云备份」后静默上传且绝不阻塞记账交互。
4. **设置侧栏入口与互斥弹窗界面**：
   - 在 `SettingsPanel.tsx` 的「分类管理」与「高级设置」之间新增「云备份」卡片入口，跳转 `app/cloud-backup.tsx`。
   - 全页及三套底部弹窗（`WebDavConfigSheet`、`GoogleDriveConfigSheet`、`CloudSnapshotsSheet`）复用统一 `BottomSheet` 与 `ConfirmDialog`，采用严格互斥状态机杜绝 Android 双层 Modal 叠加，零原生 `Alert.alert`。

## 实施（改动文件清单）

- **配置与版本**：
  - `package.json`：版本升级至 `1.5.0`，新增 `expo-secure-store`、`expo-web-browser`、`expo-crypto`。
  - `bun.lock`：同步锁定新增依赖树。
  - `app.json`：版本同步 `1.5.0`、`android.versionCode` 升至 `30`、`scheme` 升级为 `["keep-accounts", "com.keepaccounts.app"]`，挂载 `expo-secure-store` 与 `expo-web-browser` 插件。
  - `CHANGELOG.md`：补充 `## [1.5.0]` 变更条目。
- **云备份核心模块（新增 `src/features/cloud-backup/`）**：
  - `src/features/cloud-backup/types.ts`：领域类型与依赖注入契约。
  - `src/features/cloud-backup/rules.ts`：纯 TS UTF-8/Base64URL 编码、WebDAV URL/目录校验、PROPFIND XML 安全解析、Google OAuth PKCE/state 规则、快照命名与淘汰计算。
  - `src/features/cloud-backup/credentials.ts`：令牌安全解析与单测内存凭据仓储。
  - `src/features/cloud-backup/native-runtime.ts`：`expo-secure-store`、`expo-crypto` 与 `expo-web-browser` 原生运行时适配。
  - `src/features/cloud-backup/config-repository.ts`：`app_settings` 非敏感配置容错读写。
  - `src/features/cloud-backup/webdav-provider.ts`：WebDAV 协议客户端。
  - `src/features/cloud-backup/google-drive-provider.ts`：Google Drive OAuth PKCE + Drive API v3 客户端。
  - `src/features/cloud-backup/service.ts`：统一编排服务与防抖自动云备份门禁。
  - `src/features/cloud-backup/components/WebDavConfigSheet.tsx`：WebDAV 预设与凭据配置底部弹窗。
  - `src/features/cloud-backup/components/GoogleDriveConfigSheet.tsx`：Google Drive 授权配置底部弹窗。
  - `src/features/cloud-backup/components/CloudSnapshotsSheet.tsx`：多版本历史快照浏览底部弹窗。
  - `src/features/cloud-backup/rules.test.ts`、`src/features/cloud-backup/service.test.ts`：纯规则与全链路集成单测（新增 13 项测试）。
- **页面与路由集成**：
  - `app/cloud-backup.tsx`：云备份主页面。
  - `src/features/settings/components/SettingsPanel.tsx`：侧栏新增「云备份」入口。
  - `app/_layout.tsx`：注册 `/cloud-backup` 路由并挂载 15 秒防抖自动云备份监听。
  - `app/advanced-settings.tsx`：本地 JSON 恢复与清空账本时调用 `suppressAutoCloudBackup` 避免重复回传。
- **架构与变更文档**：
  - `docs/architecture/overview.md`、`docs/changes/0036-cloud-backup-webdav-and-google-drive.md`、`docs/changes/README.md`、`docs/README.md`。

## 执行验证记录

- **执行环境**：Windows 11（PowerShell）、Bun `1.4.5`、Node.js（`node:sqlite`）、Android SDK Build-Tools `37.0.0`、Android Studio JBR。
- **验证命令与实际输出**：
  1. `bun run verify`：
     - `node scripts/check-version.mjs`：`版本校验通过：v1.5.0`
     - `tsc --noEmit`：0 错误退出
     - `eslint .`：0 错误 0 警告退出
     - `vitest run`：`Test Files 23 passed (23)`，`Tests 99 passed (99)`
  2. `bun x expo prebuild --platform android --no-install && bun run build:apk`：
     - `BUILD SUCCESSFUL in 3m 5s`
     - 产物：`D:\keep-accounts\android\app\build\outputs\apk\release\app-release.apk`（`60,422,069` 字节 / `57.62 MB`）
  3. `aapt2 dump badging` + `AndroidManifest.xml` 回调校验 + `apksigner verify` + SHA-256：
     - `package: name='com.keepaccounts.app' versionCode='30' versionName='1.5.0'`
     - `application-label:'ZeroTally'`，`native-code: 'arm64-v8a' 'x86_64'`
     - Manifest 已注入 `<data android:scheme="keep-accounts"/>` 与 `<data android:scheme="com.keepaccounts.app"/>`
     - `apksigner verify --verbose`：`Verifies`（APK Signature Scheme v2: `true`，调试签名证书 SHA-1：`5e8f16062ea3cd2c4a0d547876baa6f38cabf625`）
     - SHA-256：`831331500CC03DF4CDAC3F14CFD453365346A40C90C84B8C1CA7E4F530730F7D`
- **验证结论**：全部静态门禁、99 项单元测试及 Android Release APK 构建与签名校验通过。
- **已知限制**：
  - 本地未连接真实 Android 真机，WebDAV 实网上传/下载与 Google Chrome Custom Tabs OAuth 回调未在真机端实测；相关协议与状态机已通过真实内存 SQLite + Mock Fetch / Mock OAuth Runtime 单测验证。
  - 若使用 Google Drive 通道，需在 Google Cloud Console 创建绑定包名 `com.keepaccounts.app` 与当前 APK 证书 SHA-1 的 Android OAuth Client ID（并开启自定义 URI scheme），填入应用内输入框或编译期 `EXPO_PUBLIC_GOOGLE_DRIVE_ANDROID_CLIENT_ID`。

## 后续验证建议

1. 真机安装 `v1.5.0` APK，从设置侧栏进入「云备份」，使用坚果云应用密码执行「测试连接 → 立即备份 → 历史快照 → 恢复」验证端到端体验。
2. 在 Google Cloud Console 配置 Android OAuth Client ID（包名 `com.keepaccounts.app`、回调 `com.keepaccounts.app:/cloud-backup`）后验证 Chrome Custom Tabs 授权回跳、自动创建 `ZeroTally/` 目录与多版本快照恢复。
3. 开启「账本变动自动云备份」后连续记 2 笔账，确认不阻塞记账操作且约 15 秒后在网盘生成单份合并快照。
