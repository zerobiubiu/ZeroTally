import type {
  CloudRetentionLimit,
  CloudSnapshotItem,
  WebDavPreset,
} from './types';

/** 与 app.json 中注册的包名自定义 scheme 对齐，确保回调直达 /cloud-backup 不触发未匹配路由 */
export const GOOGLE_DRIVE_REDIRECT_URI = 'com.keepaccounts.app:/cloud-backup';
export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_DRIVE_FOLDER_NAME = 'ZeroTally';
export const GOOGLE_OAUTH_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_OAUTH_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_OAUTH_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

/** 云备份单文件下载体积上限（50 MiB），防止恶意或异常远端大文件触发 OOM */
export const MAX_CLOUD_BACKUP_BYTES = 50 * 1024 * 1024;

export const CLOUD_RETENTION_OPTIONS: readonly {
  value: CloudRetentionLimit;
  label: string;
}[] = [
  { value: 5, label: '5 份' },
  { value: 10, label: '10 份' },
  { value: 20, label: '20 份' },
  { value: 0, label: '不限' },
];

export const WEBDAV_PRESETS: readonly WebDavPreset[] = [
  {
    id: 'jianguoyun',
    label: '坚果云',
    serverUrl: 'https://dav.jianguoyun.com/dav/',
    defaultDirectory: '/ZeroTally',
    hint: '账号填注册邮箱，密码请使用坚果云安全选项生成的应用密码',
  },
  {
    id: 'nextcloud',
    label: 'Nextcloud',
    serverUrl: 'https://your-domain.com/remote.php/dav/files/username/',
    defaultDirectory: '/ZeroTally',
    hint: '将地址中的域名与用户名替换为你的实例路径，建议使用应用专用密码',
  },
  {
    id: 'custom',
    label: '自定义',
    serverUrl: '',
    defaultDirectory: '/ZeroTally',
    hint: '支持标准 WebDAV（如群晖、AList、OwnCloud、Caddy 等），默认要求 HTTPS',
  },
];

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * 纯 TypeScript UTF-8 字节编码（兼容 Hermes 与 Node，无第三方依赖）。
 */
export function utf8ToBytes(input: string): Uint8Array<ArrayBuffer> {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      i + 1 < input.length
    ) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        const cp = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        bytes.push(
          0xf0 | (cp >> 18),
          0x80 | ((cp >> 12) & 0x3f),
          0x80 | ((cp >> 6) & 0x3f),
          0x80 | (cp & 0x3f)
        );
        i += 1;
        continue;
      }
      bytes.push(0xef, 0xbf, 0xbd);
    } else {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return new Uint8Array(bytes);
}

/**
 * 纯 TypeScript 字节数组转标准 Base64。
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? (bytes[i + 1] ?? 0) : 0;
    const b2 = hasB2 ? (bytes[i + 2] ?? 0) : 0;

    const c0 = b0 >> 2;
    const c1 = ((b0 & 0x03) << 4) | (b1 >> 4);
    const c2 = ((b1 & 0x0f) << 2) | (b2 >> 6);
    const c3 = b2 & 0x3f;

    out += BASE64_ALPHABET[c0] ?? '';
    out += BASE64_ALPHABET[c1] ?? '';
    out += hasB1 ? (BASE64_ALPHABET[c2] ?? '') : '=';
    out += hasB2 ? (BASE64_ALPHABET[c3] ?? '') : '=';
  }
  return out;
}

/**
 * 纯 TypeScript 字节数组转 Base64URL（无填充 `=`），用于 OAuth 2.0 PKCE 与 state。
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 构造 HTTP Basic Authorization 头（支持含中文等 UTF-8 字符的凭据）。
 */
export function encodeBasicAuthHeader(username: string, password: string): string {
  return `Basic ${bytesToBase64(utf8ToBytes(`${username}:${password}`))}`;
}

/**
 * 校验并规范化 WebDAV 服务器基础地址：
 * - 拒绝非 http/https 协议及 URL 内嵌用户名密码；
 * - 默认强制 HTTPS，仅当显式开启 allowInsecureHttp 时放行 HTTP；
 * - 去掉查询串与锚点，确保以 `/` 结尾方便后续路径拼接。
 */
export function normalizeWebDavServerUrl(
  rawUrl: string,
  allowInsecureHttp: boolean
): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('请输入 WebDAV 服务器地址');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('WebDAV 服务器地址格式无效，请以 https:// 开头');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('WebDAV 服务器仅支持 HTTPS 或 HTTP 协议');
  }

  if (parsed.protocol === 'http:' && !allowInsecureHttp) {
    throw new Error('为保护账本隐私，默认仅允许 HTTPS；如为局域网服务请先开启「允许 HTTP 明文连接」');
  }

  if (!parsed.hostname) {
    throw new Error('WebDAV 服务器地址缺少主机名');
  }

  if (parsed.username || parsed.password) {
    throw new Error('请勿在服务器地址中嵌入账号或密码，请填写到下方对应输入框');
  }

  parsed.search = '';
  parsed.hash = '';
  const pathname = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`;
  return `${parsed.origin}${pathname}`;
}

/**
 * 校验并规范化 WebDAV 远端目录（如 `/ZeroTally` 或 `ZeroTally/backups` -> `/ZeroTally`）。
 * 严格拒绝 `..`、反斜杠、控制字符与非法路径片段，防止路径穿越。
 */
export function normalizeWebDavDirectory(rawDirectory: string): string {
  const trimmed = rawDirectory.trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }

  if (trimmed.includes('\\') || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new Error('远端目录包含非法字符');
  }

  const rawSegments = trimmed.split('/').filter((seg) => seg.length > 0);
  const safeSegments: string[] = [];
  for (const seg of rawSegments) {
    if (seg === '.' || seg === '..') {
      throw new Error('远端目录不允许包含 . 或 .. 路径段');
    }
    if (seg.length > 80) {
      throw new Error('远端目录单级名称不能超过 80 个字符');
    }
    safeSegments.push(seg);
  }

  return safeSegments.length === 0 ? '/' : `/${safeSegments.join('/')}`;
}

/**
 * 拆分规范化后的远端目录为逐级目录段，用于依次 MKCOL。
 */
export function getWebDavDirectorySegments(normalizedDir: string): string[] {
  if (!normalizedDir || normalizedDir === '/') {
    return [];
  }
  return normalizedDir.split('/').filter((seg) => seg.length > 0);
}

/**
 * 校验云端快照文件名（严格单级安全文件名，匹配 ZeroTally-*.json）。
 */
const CLOUD_SNAPSHOT_FILENAME_RE = /^ZeroTally-[A-Za-z0-9._-]{4,80}\.json$/;

export function isCloudSnapshotFilename(filename: string): boolean {
  if (
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('..')
  ) {
    return false;
  }
  return CLOUD_SNAPSHOT_FILENAME_RE.test(filename);
}

/**
 * 生成带 UTC 秒级时间戳的云快照文件名，格式：`ZeroTally-YYYY-MM-DDTHH-mm-ssZ.json`。
 */
export function buildCloudSnapshotFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = now.getUTCFullYear();
  const mm = pad(now.getUTCMonth() + 1);
  const dd = pad(now.getUTCDate());
  const hh = pad(now.getUTCHours());
  const mi = pad(now.getUTCMinutes());
  const ss = pad(now.getUTCSeconds());
  return `ZeroTally-${yyyy}-${mm}-${dd}T${hh}-${mi}-${ss}Z.json`;
}

/**
 * 尝试从标准云快照文件名反推 ISO UTC 时间（当服务端未返回 getlastmodified 时兜底）。
 */
export function parseTimestampFromSnapshotFilename(filename: string): string | null {
  const match = /^ZeroTally-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.json$/.exec(
    filename
  );
  if (!match) {
    return null;
  }
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z`;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/**
 * 将规范化服务器基础 URL、远端目录与可选文件名安全拼接为完整请求 URL。
 */
export function joinWebDavUrl(
  normalizedServerUrl: string,
  normalizedDirectory: string,
  filename?: string
): string {
  const base = normalizedServerUrl.endsWith('/')
    ? normalizedServerUrl
    : `${normalizedServerUrl}/`;
  const segments = getWebDavDirectorySegments(normalizedDirectory).map((seg) =>
    encodeURIComponent(seg)
  );
  if (filename !== undefined) {
    if (!isCloudSnapshotFilename(filename)) {
      throw new Error('快照文件名不合法');
    }
    segments.push(encodeURIComponent(filename));
    return `${base}${segments.join('/')}`;
  }
  if (segments.length === 0) {
    return base;
  }
  return `${base}${segments.join('/')}/`;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractFirstXmlTagText(block: string, localName: string): string | null {
  // 无嵌套量词的线性扫描，杜绝 ReDoS；不解析实体声明，杜绝 XXE
  const openRe = new RegExp(`<(?:[A-Za-z0-9_-]+:)?${localName}(?:\\s[^>]*)?>`, 'i');
  const openMatch = openRe.exec(block);
  if (!openMatch) {
    return null;
  }
  const startIdx = openMatch.index + openMatch[0].length;
  const closeRe = new RegExp(`</(?:[A-Za-z0-9_-]+:)?${localName}\\s*>`, 'i');
  const rest = block.slice(startIdx);
  const closeMatch = closeRe.exec(rest);
  if (!closeMatch) {
    return null;
  }
  return decodeXmlEntities(rest.slice(0, closeMatch.index).trim());
}

/**
 * 安全解析 WebDAV PROPFIND (Depth: 1) 的 XML 响应，仅提取符合 `ZeroTally-*.json` 的快照文件列表。
 */
export function parseWebDavPropfindXml(xml: string): CloudSnapshotItem[] {
  if (!xml || xml.length > 4 * 1024 * 1024) {
    return [];
  }

  const results: CloudSnapshotItem[] = [];
  const seen = new Set<string>();
  const openResponseRe = /<(?:[A-Za-z0-9_-]+:)?response(?:\s[^>]*)?>/gi;
  const closeResponseRe = /<\/(?:[A-Za-z0-9_-]+:)?response\s*>/gi;

  let openMatch = openResponseRe.exec(xml);
  while (openMatch !== null) {
    const contentStart = openMatch.index + openMatch[0].length;
    closeResponseRe.lastIndex = contentStart;
    const closeMatch = closeResponseRe.exec(xml);
    if (!closeMatch) {
      break;
    }

    const block = xml.slice(contentStart, closeMatch.index);
    const rawHref = extractFirstXmlTagText(block, 'href');
    if (rawHref && !rawHref.endsWith('/')) {
      const pathPart = rawHref.split('?')[0]?.split('#')[0] ?? '';
      const lastSlash = pathPart.lastIndexOf('/');
      const encodedName = lastSlash >= 0 ? pathPart.slice(lastSlash + 1) : pathPart;
      let decodedName = encodedName;
      try {
        decodedName = decodeURIComponent(encodedName);
      } catch {
        decodedName = encodedName;
      }

      if (isCloudSnapshotFilename(decodedName) && !seen.has(decodedName)) {
        seen.add(decodedName);
        const rawSize = extractFirstXmlTagText(block, 'getcontentlength');
        const parsedSize = rawSize !== null ? Number(rawSize) : NaN;
        const sizeBytes =
          Number.isFinite(parsedSize) && parsedSize >= 0 ? Math.floor(parsedSize) : null;

        const rawModified = extractFirstXmlTagText(block, 'getlastmodified');
        let modifiedAt: string | null = null;
        if (rawModified) {
          const ms = Date.parse(rawModified);
          if (!Number.isNaN(ms)) {
            modifiedAt = new Date(ms).toISOString();
          }
        }
        if (!modifiedAt) {
          modifiedAt = parseTimestampFromSnapshotFilename(decodedName);
        }

        results.push({
          provider: 'webdav',
          id: decodedName,
          filename: decodedName,
          sizeBytes,
          modifiedAt,
        });
      }
    }

    openResponseRe.lastIndex = closeMatch.index + closeMatch[0].length;
    openMatch = openResponseRe.exec(xml);
  }

  return sortCloudSnapshotsDesc(results);
}

/**
 * 校验并规范化 Google OAuth Android Client ID。
 */
export function normalizeGoogleClientId(rawClientId: string): string {
  const trimmed = rawClientId.trim();
  if (!trimmed) {
    throw new Error('请先填写 Google Android OAuth Client ID');
  }
  if (!/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(trimmed)) {
    throw new Error(
      'Google Client ID 格式无效，应以 .apps.googleusercontent.com 结尾'
    );
  }
  return trimmed;
}

/**
 * 构建 Google OAuth 2.0 授权 URL（强制 PKCE S256 + state CSRF 校验 + drive.file 最小权限）。
 */
export function buildGoogleOAuthAuthorizeUrl(params: {
  clientId: string;
  redirectUri?: string;
  codeChallenge: string;
  state: string;
}): string {
  const clientId = normalizeGoogleClientId(params.clientId);
  const redirectUri = params.redirectUri ?? GOOGLE_DRIVE_REDIRECT_URI;
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_DRIVE_SCOPE,
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
    state: params.state,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${GOOGLE_OAUTH_AUTH_ENDPOINT}?${query.toString()}`;
}

/**
 * 解析并校验 Google OAuth 回调 URL：验证错误码、必填 code 与严格 state 一致性（防 CSRF）。
 */
export function parseGoogleOAuthRedirectUrl(
  callbackUrl: string,
  expectedState: string
): { code: string } {
  let parsed: URL;
  try {
    parsed = new URL(callbackUrl);
  } catch {
    throw new Error('无法解析 Google 授权回调地址');
  }

  const error = parsed.searchParams.get('error');
  if (error) {
    if (error === 'access_denied') {
      throw new Error('已取消 Google Drive 授权');
    }
    const desc = parsed.searchParams.get('error_description');
    throw new Error(desc ? `Google 授权失败：${desc}` : `Google 授权失败（${error}）`);
  }

  const returnedState = parsed.searchParams.get('state');
  if (!returnedState || returnedState !== expectedState) {
    throw new Error('Google 授权安全状态校验未通过，请重试');
  }

  const code = parsed.searchParams.get('code');
  if (!code) {
    throw new Error('Google 授权回调缺少授权码');
  }

  return { code };
}

function snapshotSortTime(item: CloudSnapshotItem): number {
  if (item.modifiedAt) {
    const ms = Date.parse(item.modifiedAt);
    if (!Number.isNaN(ms)) {
      return ms;
    }
  }
  const fromName = parseTimestampFromSnapshotFilename(item.filename);
  if (fromName) {
    const ms = Date.parse(fromName);
    if (!Number.isNaN(ms)) {
      return ms;
    }
  }
  return 0;
}

/**
 * 按修改时间/文件名倒序排列云端快照（最新在最前）。
 */
export function sortCloudSnapshotsDesc(
  items: readonly CloudSnapshotItem[]
): CloudSnapshotItem[] {
  return [...items].sort((a, b) => {
    const diff = snapshotSortTime(b) - snapshotSortTime(a);
    if (diff !== 0) {
      return diff;
    }
    return b.filename.localeCompare(a.filename);
  });
}

/**
 * 根据保留份数策略筛选需要清理的超出上限旧快照（保留最新 maxSnapshots 份；0 表示不限）。
 */
export function selectSnapshotsToPrune(
  items: readonly CloudSnapshotItem[],
  maxSnapshots: CloudRetentionLimit
): CloudSnapshotItem[] {
  if (maxSnapshots <= 0 || items.length <= maxSnapshots) {
    return [];
  }
  const sorted = sortCloudSnapshotsDesc(items);
  return sorted.slice(maxSnapshots);
}

export function isValidRetentionLimit(value: unknown): value is CloudRetentionLimit {
  return value === 5 || value === 10 || value === 20 || value === 0;
}

/**
 * 将快照字节数格式化为简洁可读文本。
 */
export function formatSnapshotSize(sizeBytes: number | null): string {
  if (sizeBytes === null || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return '未知大小';
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * 将 ISO 时间戳格式化为本地紧凑日期时间（YYYY-MM-DD HH:mm）。
 */
export function formatCloudTimestamp(iso: string | null): string {
  if (!iso) {
    return '尚未备份';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '未知时间';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}
