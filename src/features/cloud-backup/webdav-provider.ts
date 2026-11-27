import {
  encodeBasicAuthHeader,
  getWebDavDirectorySegments,
  isCloudSnapshotFilename,
  joinWebDavUrl,
  MAX_CLOUD_BACKUP_BYTES,
  normalizeWebDavDirectory,
  normalizeWebDavServerUrl,
  parseWebDavPropfindXml,
  utf8ToBytes,
} from './rules';
import type { CloudSnapshotItem } from './types';

export interface WebDavConnectionParams {
  serverUrl: string;
  username: string;
  password: string;
  remoteDirectory: string;
  allowInsecureHttp: boolean;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const TRANSFER_TIMEOUT_MS = 45_000;

const PROPFIND_LIST_BODY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:getcontentlength/>
    <d:getlastmodified/>
  </d:prop>
</d:propfind>`;

function validateWebDavParams(params: WebDavConnectionParams): {
  serverUrl: string;
  remoteDirectory: string;
  authHeader: string;
} {
  const serverUrl = normalizeWebDavServerUrl(params.serverUrl, params.allowInsecureHttp);
  const remoteDirectory = normalizeWebDavDirectory(params.remoteDirectory);
  const username = params.username.trim();
  if (!username) {
    throw new Error('请输入 WebDAV 账号');
  }
  if (!params.password) {
    throw new Error('请输入 WebDAV 密码或应用密码');
  }
  return {
    serverUrl,
    remoteDirectory,
    authHeader: encodeBasicAuthHeader(username, params.password),
  };
}

async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('WebDAV 连接超时，请检查网络或服务器地址');
    }
    throw new Error(
      err instanceof Error && err.message
        ? `WebDAV 网络请求失败：${err.message}`
        : 'WebDAV 网络请求失败，请检查网络连接'
    );
  } finally {
    clearTimeout(timer);
  }
}

function mapWebDavHttpError(status: number, action: string): Error {
  if (status === 401) {
    return new Error('WebDAV 认证失败（401），请检查账号或应用专用密码');
  }
  if (status === 403) {
    return new Error('WebDAV 权限不足（403），当前账号无权访问该目录');
  }
  if (status === 404) {
    return new Error('WebDAV 路径不存在（404），请核对服务器地址与远端目录');
  }
  if (status === 405) {
    return new Error('服务器不支持该 WebDAV 方法（405），请确认服务器地址指向 WebDAV 端点');
  }
  if (status === 409) {
    return new Error('WebDAV 目录冲突（409），请检查上级路径是否存在');
  }
  if (status === 507) {
    return new Error('WebDAV 云端存储空间不足（507）');
  }
  return new Error(`WebDAV ${action}失败（HTTP ${status}）`);
}

/**
 * 检测 WebDAV 凭据与基础地址连通性（只读 PROPFIND Depth: 0，不修改远端内容）。
 */
export async function testWebDavConnection(
  params: WebDavConnectionParams,
  fetchFn: typeof fetch = fetch
): Promise<void> {
  const { serverUrl, authHeader } = validateWebDavParams(params);
  const res = await fetchWithTimeout(
    fetchFn,
    serverUrl,
    {
      method: 'PROPFIND',
      headers: {
        Authorization: authHeader,
        Depth: '0',
      },
    },
    DEFAULT_TIMEOUT_MS
  );

  if (res.status === 200 || res.status === 204 || res.status === 207) {
    return;
  }

  // 部分精简 WebDAV 网关对根路径不接受无 body PROPFIND，尝试 OPTIONS 兜底核验认证与 DAV 头
  if (res.status === 405) {
    const optRes = await fetchWithTimeout(
      fetchFn,
      serverUrl,
      {
        method: 'OPTIONS',
        headers: {
          Authorization: authHeader,
        },
      },
      DEFAULT_TIMEOUT_MS
    );
    if (optRes.status >= 200 && optRes.status < 300) {
      return;
    }
    throw mapWebDavHttpError(optRes.status, '连接测试');
  }

  throw mapWebDavHttpError(res.status, '连接测试');
}

/**
 * 逐级确保 WebDAV 远端备份目录存在（兼容坚果云 / Nextcloud / 群晖 / AList 的 MKCOL 响应码）。
 */
export async function ensureWebDavDirectory(
  params: WebDavConnectionParams,
  fetchFn: typeof fetch = fetch
): Promise<void> {
  const { serverUrl, remoteDirectory, authHeader } = validateWebDavParams(params);
  const segments = getWebDavDirectorySegments(remoteDirectory);
  if (segments.length === 0) {
    return;
  }

  let currentPath = '';
  for (const segment of segments) {
    currentPath += `/${segment}`;
    const targetUrl = joinWebDavUrl(serverUrl, currentPath);
    const res = await fetchWithTimeout(
      fetchFn,
      targetUrl,
      {
        method: 'MKCOL',
        headers: {
          Authorization: authHeader,
        },
      },
      DEFAULT_TIMEOUT_MS
    );

    // 200/201/204 表示新建或已就绪；301/302/405 表示目录已存在
    if (
      res.status === 200 ||
      res.status === 201 ||
      res.status === 204 ||
      res.status === 301 ||
      res.status === 302 ||
      res.status === 405
    ) {
      continue;
    }

    throw mapWebDavHttpError(res.status, '创建远端目录');
  }
}

/**
 * 将 JSON 备份文本上传到 WebDAV 远端目录。
 */
export async function uploadWebDavSnapshot(
  params: WebDavConnectionParams,
  filename: string,
  content: string,
  fetchFn: typeof fetch = fetch
): Promise<void> {
  if (!isCloudSnapshotFilename(filename)) {
    throw new Error('云快照文件名不合法');
  }
  const { serverUrl, remoteDirectory, authHeader } = validateWebDavParams(params);
  await ensureWebDavDirectory(params, fetchFn);

  const fileUrl = joinWebDavUrl(serverUrl, remoteDirectory, filename);
  const res = await fetchWithTimeout(
    fetchFn,
    fileUrl,
    {
      method: 'PUT',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: content,
    },
    TRANSFER_TIMEOUT_MS
  );

  if (res.status === 200 || res.status === 201 || res.status === 204) {
    return;
  }

  throw mapWebDavHttpError(res.status, '上传备份');
}

/**
 * 列出 WebDAV 远端目录中的全部 ZeroTally 历史快照（按时间倒序）。
 */
export async function listWebDavSnapshots(
  params: WebDavConnectionParams,
  fetchFn: typeof fetch = fetch
): Promise<CloudSnapshotItem[]> {
  const { serverUrl, remoteDirectory, authHeader } = validateWebDavParams(params);
  const dirUrl = joinWebDavUrl(serverUrl, remoteDirectory);
  const res = await fetchWithTimeout(
    fetchFn,
    dirUrl,
    {
      method: 'PROPFIND',
      headers: {
        Authorization: authHeader,
        Depth: '1',
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body: PROPFIND_LIST_BODY,
    },
    DEFAULT_TIMEOUT_MS
  );

  if (res.status === 404) {
    return [];
  }
  if (res.status !== 207 && res.status !== 200) {
    throw mapWebDavHttpError(res.status, '读取快照列表');
  }

  const xml = await res.text();
  return parseWebDavPropfindXml(xml);
}

/**
 * 从 WebDAV 下载指定历史快照的原始 JSON 文本。
 */
export async function downloadWebDavSnapshot(
  params: WebDavConnectionParams,
  filename: string,
  fetchFn: typeof fetch = fetch
): Promise<string> {
  if (!isCloudSnapshotFilename(filename)) {
    throw new Error('云快照文件名不合法');
  }
  const { serverUrl, remoteDirectory, authHeader } = validateWebDavParams(params);
  const fileUrl = joinWebDavUrl(serverUrl, remoteDirectory, filename);
  const res = await fetchWithTimeout(
    fetchFn,
    fileUrl,
    {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        Accept: 'application/json, text/plain;q=0.9',
      },
    },
    TRANSFER_TIMEOUT_MS
  );

  if (!res.ok) {
    throw mapWebDavHttpError(res.status, '下载备份');
  }

  const contentLengthHeader = res.headers.get('content-length');
  if (contentLengthHeader) {
    const declaredBytes = Number(contentLengthHeader);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_CLOUD_BACKUP_BYTES) {
      throw new Error('云端备份文件体积超出安全上限（50 MB），已中止下载');
    }
  }

  const text = await res.text();
  if (utf8ToBytes(text).length > MAX_CLOUD_BACKUP_BYTES) {
    throw new Error('云端备份文件体积超出安全上限（50 MB），已中止解析');
  }
  return text;
}

/**
 * 删除 WebDAV 上的指定历史快照（404 视为已删除幂等成功）。
 */
export async function deleteWebDavSnapshot(
  params: WebDavConnectionParams,
  filename: string,
  fetchFn: typeof fetch = fetch
): Promise<void> {
  if (!isCloudSnapshotFilename(filename)) {
    throw new Error('云快照文件名不合法');
  }
  const { serverUrl, remoteDirectory, authHeader } = validateWebDavParams(params);
  const fileUrl = joinWebDavUrl(serverUrl, remoteDirectory, filename);
  const res = await fetchWithTimeout(
    fetchFn,
    fileUrl,
    {
      method: 'DELETE',
      headers: {
        Authorization: authHeader,
      },
    },
    DEFAULT_TIMEOUT_MS
  );

  if (res.status === 200 || res.status === 202 || res.status === 204 || res.status === 404) {
    return;
  }

  throw mapWebDavHttpError(res.status, '删除快照');
}
