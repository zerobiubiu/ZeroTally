import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const pkgPath = path.join(rootDir, 'package.json');
const appJsonPath = path.join(rootDir, 'app.json');
const changelogPath = path.join(rootDir, 'CHANGELOG.md');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const appConfig = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const changelog = fs.readFileSync(changelogPath, 'utf8');

const pkgVersion = pkg.version;
const appVersion = appConfig?.expo?.version;

if (!pkgVersion || !appVersion) {
  console.error('版本号缺失：请检查 package.json 与 app.json 中的 version 字段。');
  process.exit(1);
}

if (pkgVersion !== appVersion) {
  console.error(`版本号不一致：package.json=${pkgVersion}，app.json=${appVersion}`);
  process.exit(1);
}

if (!changelog.includes(`## [${pkgVersion}]`)) {
  console.error(`CHANGELOG.md 缺少版本记录节：## [${pkgVersion}]`);
  process.exit(1);
}

console.log(`版本校验通过：v${pkgVersion}`);
