import { describe, expect, it } from 'vitest';
import {
  buildCloudSnapshotFilename,
  buildGoogleOAuthAuthorizeUrl,
  bytesToBase64,
  bytesToBase64Url,
  encodeBasicAuthHeader,
  formatSnapshotSize,
  GOOGLE_DRIVE_REDIRECT_URI,
  GOOGLE_DRIVE_SCOPE,
  isCloudSnapshotFilename,
  joinWebDavUrl,
  normalizeGoogleClientId,
  normalizeWebDavDirectory,
  normalizeWebDavServerUrl,
  parseGoogleOAuthRedirectUrl,
  parseTimestampFromSnapshotFilename,
  parseWebDavPropfindXml,
  selectSnapshotsToPrune,
  utf8ToBytes,
} from './rules';
import type { CloudSnapshotItem } from './types';

describe('cloud-backup rules', () => {
  describe('Base64 / Base64URL 与 Basic Auth 编码', () => {
    it('正确编码 ASCII 与 UTF-8 中文凭据', () => {
      expect(bytesToBase64(utf8ToBytes('user:pass'))).toBe('dXNlcjpwYXNz');
      expect(encodeBasicAuthHeader('记账用户', 'p@ss')).toBe(
        `Basic ${Buffer.from('记账用户:p@ss', 'utf8').toString('base64')}`
      );
      expect(bytesToBase64Url(new Uint8Array([0xfb, 0xff, 0xfe]))).toBe('-__-');
    });
  });

  describe('WebDAV URL 与目录安全校验', () => {
    it('默认强制 HTTPS 并自动规范化尾部斜杠', () => {
      expect(normalizeWebDavServerUrl('https://dav.jianguoyun.com/dav', false)).toBe(
        'https://dav.jianguoyun.com/dav/'
      );
      expect(() => normalizeWebDavServerUrl('http://192.168.1.10:5005/dav', false)).toThrow(
        /HTTPS/
      );
      expect(normalizeWebDavServerUrl('http://192.168.1.10:5005/dav?a=1#h', true)).toBe(
        'http://192.168.1.10:5005/dav/'
      );
    });

    it('拒绝非 HTTP/HTTPS 协议及 URL 内嵌账号密码', () => {
      expect(() => normalizeWebDavServerUrl('file:///etc/passwd', true)).toThrow(/仅支持/);
      expect(() =>
        normalizeWebDavServerUrl('https://user:secret@dav.example.com/dav/', false)
      ).toThrow(/嵌入账号或密码/);
    });

    it('规范化远端目录并拦截路径穿越', () => {
      expect(normalizeWebDavDirectory('')).toBe('/');
      expect(normalizeWebDavDirectory('ZeroTally/2026/')).toBe('/ZeroTally/2026');
      expect(() => normalizeWebDavDirectory('/ZeroTally/../etc')).toThrow(/\.\./);
      expect(() => normalizeWebDavDirectory('ZeroTally\\back')).toThrow(/非法字符/);
    });

    it('安全拼接目录与快照文件 URL 并校验文件名', () => {
      expect(
        joinWebDavUrl(
          'https://dav.jianguoyun.com/dav/',
          '/我的账本/ZeroTally',
          'ZeroTally-2026-11-27T08-00-00Z.json'
        )
      ).toBe(
        'https://dav.jianguoyun.com/dav/%E6%88%91%E7%9A%84%E8%B4%A6%E6%9C%AC/ZeroTally/ZeroTally-2026-11-27T08-00-00Z.json'
      );
      expect(() =>
        joinWebDavUrl('https://dav.jianguoyun.com/dav/', '/ZeroTally', '../evil.json')
      ).toThrow(/快照文件名不合法/);
    });
  });

  describe('WebDAV PROPFIND XML 安全解析', () => {
    it('提取多命名空间下的 ZeroTally 快照、忽略杂文件与目录并按时间倒序', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
      <D:multistatus xmlns:D="DAV:">
        <D:response>
          <D:href>/dav/ZeroTally/</D:href>
          <D:propstat><D:prop><D:getcontentlength>0</D:getcontentlength></D:prop></D:propstat>
        </D:response>
        <d:response xmlns:d="DAV:">
          <d:href>/dav/ZeroTally/ZeroTally-2026-11-25T10-00-00Z.json</d:href>
          <d:propstat>
            <d:prop>
              <d:getcontentlength>2048</d:getcontentlength>
              <d:getlastmodified>Wed, 25 Nov 2026 10:00:00 GMT</d:getlastmodified>
            </d:prop>
          </d:propstat>
        </d:response>
        <response>
          <href>/dav/ZeroTally/ZeroTally-2026-11-27T08-30-00Z.json</href>
          <propstat>
            <prop>
              <getcontentlength>4096</getcontentlength>
            </prop>
          </propstat>
        </response>
        <D:response>
          <D:href>/dav/ZeroTally/readme.txt</D:href>
        </D:response>
        <D:response>
          <D:href>/dav/ZeroTally/ZeroTally-..evil.json</D:href>
        </D:response>
      </D:multistatus>`;

      const snapshots = parseWebDavPropfindXml(xml);
      expect(snapshots).toHaveLength(2);
      expect(snapshots[0]).toEqual({
        provider: 'webdav',
        id: 'ZeroTally-2026-11-27T08-30-00Z.json',
        filename: 'ZeroTally-2026-11-27T08-30-00Z.json',
        sizeBytes: 4096,
        modifiedAt: '2026-11-27T08:30:00.000Z',
      });
      expect(snapshots[1]?.sizeBytes).toBe(2048);
    });
  });

  describe('Google OAuth 2.0 PKCE 与回调校验', () => {
    it('校验 Client ID 并生成包含 S256 PKCE 与 drive.file 的授权链接', () => {
      const clientId = '1234567890-abcdefg.apps.googleusercontent.com';
      expect(normalizeGoogleClientId(`  ${clientId}  `)).toBe(clientId);
      expect(() => normalizeGoogleClientId('not-a-valid-client')).toThrow(
        /apps\.googleusercontent\.com/
      );

      const url = buildGoogleOAuthAuthorizeUrl({
        clientId,
        codeChallenge: 'challenge_xyz',
        state: 'state_123',
      });
      const parsed = new URL(url);
      expect(parsed.searchParams.get('client_id')).toBe(clientId);
      expect(parsed.searchParams.get('redirect_uri')).toBe(GOOGLE_DRIVE_REDIRECT_URI);
      expect(parsed.searchParams.get('scope')).toBe(GOOGLE_DRIVE_SCOPE);
      expect(parsed.searchParams.get('code_challenge')).toBe('challenge_xyz');
      expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
      expect(parsed.searchParams.get('state')).toBe('state_123');
      expect(parsed.searchParams.get('access_type')).toBe('offline');
    });

    it('严格校验回调 state 防止 CSRF 并识别取消授权', () => {
      expect(
        parseGoogleOAuthRedirectUrl(
          'com.keepaccounts.app:/cloud-backup?code=auth_code_1&state=expected_s',
          'expected_s'
        )
      ).toEqual({ code: 'auth_code_1' });

      expect(() =>
        parseGoogleOAuthRedirectUrl(
          'com.keepaccounts.app:/cloud-backup?code=auth_code_1&state=tampered',
          'expected_s'
        )
      ).toThrow(/安全状态校验未通过/);

      expect(() =>
        parseGoogleOAuthRedirectUrl(
          'com.keepaccounts.app:/cloud-backup?error=access_denied',
          'expected_s'
        )
      ).toThrow(/已取消/);
    });
  });

  describe('快照命名与保留上限裁剪', () => {
    it('生成并识别标准快照文件名与时间戳', () => {
      const filename = buildCloudSnapshotFilename(new Date('2026-11-27T07:05:09.000Z'));
      expect(filename).toBe('ZeroTally-2026-11-27T07-05-09Z.json');
      expect(isCloudSnapshotFilename(filename)).toBe(true);
      expect(isCloudSnapshotFilename('other.json')).toBe(false);
      expect(parseTimestampFromSnapshotFilename(filename)).toBe('2026-11-27T07:05:09.000Z');
      expect(formatSnapshotSize(512)).toBe('512 B');
      expect(formatSnapshotSize(2048)).toBe('2.0 KB');
    });

    it('按时间倒序保留最新 N 份并筛出最旧待清理快照', () => {
      const items: CloudSnapshotItem[] = [
        {
          provider: 'webdav',
          id: 'ZeroTally-2026-11-01T00-00-00Z.json',
          filename: 'ZeroTally-2026-11-01T00-00-00Z.json',
          sizeBytes: 100,
          modifiedAt: '2026-11-01T00:00:00.000Z',
        },
        {
          provider: 'webdav',
          id: 'ZeroTally-2026-11-06T00-00-00Z.json',
          filename: 'ZeroTally-2026-11-06T00-00-00Z.json',
          sizeBytes: 100,
          modifiedAt: '2026-11-06T00:00:00.000Z',
        },
        {
          provider: 'webdav',
          id: 'ZeroTally-2026-11-02T00-00-00Z.json',
          filename: 'ZeroTally-2026-11-02T00-00-00Z.json',
          sizeBytes: 100,
          modifiedAt: '2026-11-02T00:00:00.000Z',
        },
        {
          provider: 'webdav',
          id: 'ZeroTally-2026-11-05T00-00-00Z.json',
          filename: 'ZeroTally-2026-11-05T00-00-00Z.json',
          sizeBytes: 100,
          modifiedAt: '2026-11-05T00:00:00.000Z',
        },
        {
          provider: 'webdav',
          id: 'ZeroTally-2026-11-04T00-00-00Z.json',
          filename: 'ZeroTally-2026-11-04T00-00-00Z.json',
          sizeBytes: 100,
          modifiedAt: '2026-11-04T00:00:00.000Z',
        },
        {
          provider: 'webdav',
          id: 'ZeroTally-2026-11-03T00-00-00Z.json',
          filename: 'ZeroTally-2026-11-03T00-00-00Z.json',
          sizeBytes: 100,
          modifiedAt: '2026-11-03T00:00:00.000Z',
        },
      ];

      expect(selectSnapshotsToPrune(items, 0)).toEqual([]);
      const pruned = selectSnapshotsToPrune(items, 5);
      expect(pruned.map((item) => item.filename)).toEqual([
        'ZeroTally-2026-11-01T00-00-00Z.json',
      ]);
    });
  });
});
