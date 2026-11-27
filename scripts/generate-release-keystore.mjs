import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const rootDir = process.cwd();
const defaultKeyDir = path.join(os.homedir(), '.zerotally-keys');
const defaultKeystorePath = path.join(defaultKeyDir, 'zerotally-release.keystore');
const localSigningConfigPath = path.join(rootDir, 'signing.local.json');

function parseArgs(argv) {
  let outPath = defaultKeystorePath;
  let alias = 'zerotally-release';
  let force = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out' && argv[i + 1]) {
      outPath = path.resolve(argv[i + 1]);
      i += 1;
    } else if (arg === '--alias' && argv[i + 1]) {
      alias = argv[i + 1];
      i += 1;
    } else if (arg === '--force') {
      force = true;
    }
  }
  return { outPath, alias, force };
}

function resolveKeytool() {
  const candidates = [
    process.env.JAVA_HOME,
    'C:\\Program Files\\Android\\Android Studio\\jbr',
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
  ].filter(Boolean);

  for (const dir of candidates) {
    const bin = path.join(dir, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool');
    if (fs.existsSync(bin)) {
      return bin;
    }
  }
  return 'keytool';
}

const { outPath, alias, force } = parseArgs(process.argv.slice(2));
const resolvedRepo = path.resolve(rootDir);
if (path.resolve(outPath).startsWith(resolvedRepo + path.sep)) {
  console.error('安全拒绝：正式 Keystore 严禁存放在 Git 仓库目录内，请使用仓库外路径（默认 ~/.zerotally-keys/）。');
  process.exit(1);
}

if (fs.existsSync(outPath) && !force) {
  console.error(`目标 Keystore 已存在：${outPath}\n为防止覆盖导致无法升级已安装应用，已中止。如需覆盖请显式传入 --force。`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
const password = crypto.randomBytes(18).toString('base64url');
const keytool = resolveKeytool();

console.log(`正在生成 ZeroTally 正式发布 Keystore：${outPath}`);
const genRes = spawnSync(
  keytool,
  [
    '-genkeypair',
    '-v',
    '-storetype',
    'PKCS12',
    '-keystore',
    outPath,
    '-alias',
    alias,
    '-keyalg',
    'RSA',
    '-keysize',
    '2048',
    '-validity',
    '10000',
    '-storepass',
    password,
    '-keypass',
    password,
    '-dname',
    'CN=ZeroTally, OU=Personal, O=ZeroTally, L=Unknown, ST=Unknown, C=CN',
  ],
  { stdio: 'inherit' }
);

if (genRes.status !== 0) {
  console.error('生成 Keystore 失败，请检查 JDK / keytool 环境。');
  process.exit(genRes.status ?? 1);
}

const localConfig = {
  keystorePath: outPath,
  keystorePassword: password,
  keyAlias: alias,
  keyPassword: password,
};
fs.writeFileSync(localSigningConfigPath, `${JSON.stringify(localConfig, null, 2)}\n`, 'utf8');

const listRes = spawnSync(
  keytool,
  ['-list', '-v', '-keystore', outPath, '-alias', alias, '-storepass', password],
  { encoding: 'utf8' }
);
const sha256Match = (listRes.stdout ?? '').match(/SHA256:\s*([0-9A-F:]+)/i);

console.log('\n============================================================');
console.log('ZeroTally 正式发布 Keystore 已生成并写入本地忽略配置 signing.local.json');
console.log(`- Keystore 路径：${outPath}`);
console.log(`- Key Alias：${alias}`);
if (sha256Match) {
  console.log(`- 证书 SHA-256 指纹：${sha256Match[1]}`);
}
console.log('- 重要提醒：请立即将上述 Keystore 文件与 signing.local.json 中的密码离线备份！');
console.log('  丢失此密钥将导致后续版本无法覆盖安装升级。');
console.log('- 如需接入 GitHub Actions 自动发版，请将以下 4 项配置至仓库 Secrets：');
console.log('  ANDROID_KEYSTORE_BASE64 / ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD');
console.log('============================================================\n');
