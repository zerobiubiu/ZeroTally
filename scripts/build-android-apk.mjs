import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const rootDir = process.cwd();
const androidDir = path.join(rootDir, 'android');
const localSigningConfigPath = path.join(rootDir, 'signing.local.json');

function parseArgs(argv) {
  let variant = 'release';
  let abis = 'arm64-v8a,x86_64';
  let allowDebugSigning = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--variant' && argv[i + 1]) {
      variant = argv[i + 1];
      i += 1;
    } else if (arg === '--abis' && argv[i + 1]) {
      abis = argv[i + 1];
      i += 1;
    } else if (arg === '--allow-debug-signing') {
      allowDebugSigning = true;
    }
  }

  if (variant !== 'release' && variant !== 'debug') {
    console.error(`不支持的 variant：${variant}，仅支持 release 或 debug`);
    process.exit(1);
  }
  return { variant, abis, allowDebugSigning };
}

function resolveSigningCredentials() {
  const fromEnv = {
    keystorePath: process.env.ZEROTALLY_KEYSTORE_PATH?.trim() || '',
    keystorePassword: process.env.ZEROTALLY_KEYSTORE_PASSWORD?.trim() || '',
    keyAlias: process.env.ZEROTALLY_KEY_ALIAS?.trim() || '',
    keyPassword: process.env.ZEROTALLY_KEY_PASSWORD?.trim() || '',
  };

  if (
    fromEnv.keystorePath &&
    fromEnv.keystorePassword &&
    fromEnv.keyAlias &&
    fromEnv.keyPassword
  ) {
    return { source: 'env', ...fromEnv };
  }

  if (fs.existsSync(localSigningConfigPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(localSigningConfigPath, 'utf8'));
      const fromFile = {
        keystorePath: String(parsed.keystorePath ?? '').trim(),
        keystorePassword: String(parsed.keystorePassword ?? '').trim(),
        keyAlias: String(parsed.keyAlias ?? '').trim(),
        keyPassword: String(parsed.keyPassword ?? '').trim(),
      };
      if (
        fromFile.keystorePath &&
        fromFile.keystorePassword &&
        fromFile.keyAlias &&
        fromFile.keyPassword
      ) {
        return { source: 'signing.local.json', ...fromFile };
      }
    } catch (err) {
      console.error(`读取 signing.local.json 失败：${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  return null;
}

function resolveAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : null,
    path.join(os.homedir(), 'Android', 'Sdk'),
    path.join(os.homedir(), 'Library', 'Android', 'sdk'),
  ].filter(Boolean);

  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  return null;
}

function resolveJavaHome() {
  const candidates = [
    process.env.JAVA_HOME,
    'C:\\Program Files\\Android\\Android Studio\\jbr',
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
  ].filter(Boolean);

  for (const dir of candidates) {
    const javaBin = path.join(dir, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
    if (fs.existsSync(javaBin)) {
      return dir;
    }
  }
  return null;
}

function runCommand(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

const { variant, abis, allowDebugSigning } = parseArgs(process.argv.slice(2));
const androidHome = resolveAndroidSdk();
const javaHome = resolveJavaHome();

if (!androidHome) {
  console.error('未找到 Android SDK，请安装 Android SDK 或设置 ANDROID_HOME 环境变量。');
  process.exit(1);
}
if (!javaHome) {
  console.error('未找到兼容 JDK，请安装 Android Studio JBR / JDK 或设置 JAVA_HOME 环境变量。');
  process.exit(1);
}

const signing = resolveSigningCredentials();
const gradleExtraArgs = [`-PreactNativeArchitectures=${abis}`, '--no-daemon'];
const signingEnv = {};

if (variant === 'release') {
  if (signing) {
    if (!fs.existsSync(signing.keystorePath)) {
      console.error(`正式签名 Keystore 文件不存在：${signing.keystorePath}`);
      process.exit(1);
    }
    signingEnv.ZEROTALLY_KEYSTORE_PATH = signing.keystorePath;
    signingEnv.ZEROTALLY_KEYSTORE_PASSWORD = signing.keystorePassword;
    signingEnv.ZEROTALLY_KEY_ALIAS = signing.keyAlias;
    signingEnv.ZEROTALLY_KEY_PASSWORD = signing.keyPassword;
    console.log(`已加载正式发布签名配置（来源：${signing.source}，Alias：${signing.keyAlias}）`);
  } else if (allowDebugSigning) {
    console.warn(
      '⚠️  [本地测试模式] 未检测到正式 Keystore，已按 --allow-debug-signing 放行调试签名，产物严禁对外分发！'
    );
    gradleExtraArgs.push('-PzerotallyAllowDebugSigning=true');
  } else {
    console.error(
      '发布门禁拦截：未检测到正式 Release Keystore 配置，已拒绝隐式回退 debug 签名。\n' +
        '请先执行 `bun run keystore:init` 生成仓库外正式 Keystore（或配置环境变量 ZEROTALLY_KEYSTORE_PATH/PASSWORD/ALIAS/KEY_PASSWORD）。\n' +
        '如仅需本机无正式密钥快速自测，请显式传入：`bun run build:apk -- --allow-debug-signing`'
    );
    process.exit(1);
  }
}

const env = {
  ...process.env,
  ...signingEnv,
  ANDROID_HOME: androidHome,
  ANDROID_SDK_ROOT: androidHome,
  JAVA_HOME: javaHome,
  PATH: `${path.join(javaHome, 'bin')}${path.delimiter}${path.join(androidHome, 'platform-tools')}${path.delimiter}${process.env.PATH ?? ''}`,
};

if (!fs.existsSync(androidDir)) {
  console.log('未检测到 android/ 目录，正在执行 expo prebuild...');
  runCommand(
    'bun',
    ['x', 'expo', 'prebuild', '--platform', 'android', '--no-install'],
    { cwd: rootDir, env }
  );
}

const escapedSdk = androidHome.replaceAll('\\', '\\\\').replaceAll(':', '\\:');
fs.writeFileSync(path.join(androidDir, 'local.properties'), `sdk.dir=${escapedSdk}\n`, 'utf8');

const gradleTask = variant === 'release' ? 'assembleRelease' : 'assembleDebug';

console.log(`开始编译 Android ${variant} APK（ABI: ${abis}）...`);
if (process.platform === 'win32') {
  runCommand('cmd.exe', ['/d', '/c', 'gradlew.bat', gradleTask, ...gradleExtraArgs], {
    cwd: androidDir,
    env,
  });
} else {
  runCommand('./gradlew', [gradleTask, ...gradleExtraArgs], { cwd: androidDir, env });
}

const apkPath = path.join(
  androidDir,
  'app',
  'build',
  'outputs',
  'apk',
  variant,
  `app-${variant}.apk`
);
if (fs.existsSync(apkPath)) {
  const sizeMb = (fs.statSync(apkPath).size / (1024 * 1024)).toFixed(2);
  console.log(`构建完成：${apkPath} (${sizeMb} MB)`);
}
