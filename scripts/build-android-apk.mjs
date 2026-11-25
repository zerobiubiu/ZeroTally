import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const rootDir = process.cwd();
const androidDir = path.join(rootDir, 'android');

function parseArgs(argv) {
  let variant = 'release';
  let abis = 'arm64-v8a,x86_64';

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--variant' && argv[i + 1]) {
      variant = argv[i + 1];
      i += 1;
    } else if (arg === '--abis' && argv[i + 1]) {
      abis = argv[i + 1];
      i += 1;
    }
  }

  if (variant !== 'release' && variant !== 'debug') {
    console.error(`不支持的 variant：${variant}，仅支持 release 或 debug`);
    process.exit(1);
  }
  return { variant, abis };
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

const { variant, abis } = parseArgs(process.argv.slice(2));
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

const env = {
  ...process.env,
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
  runCommand(
    'cmd.exe',
    ['/d', '/c', 'gradlew.bat', gradleTask, `-PreactNativeArchitectures=${abis}`, '--no-daemon'],
    { cwd: androidDir, env }
  );
} else {
  runCommand(
    './gradlew',
    [gradleTask, `-PreactNativeArchitectures=${abis}`, '--no-daemon'],
    { cwd: androidDir, env }
  );
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
