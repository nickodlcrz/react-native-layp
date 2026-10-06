#!/usr/bin/env node
/**
 * Bumps the LAYP app version everywhere it lives, in one step.
 *
 * Usage:
 *   node scripts/bump-version.js            -> patch bump (1.0.0 -> 1.0.1)
 *   node scripts/bump-version.js minor      -> 1.0.1 -> 1.1.0
 *   node scripts/bump-version.js major      -> 1.1.0 -> 2.0.0
 *   node scripts/bump-version.js 1.4.2      -> set an exact version
 *
 * Updates:
 *   - app.json            expo.version + expo.android.versionCode
 *   - package.json        version
 *   - android/app/build.gradle  versionName + versionCode (if the folder exists)
 *
 * versionCode always goes up by 1 (Android needs a higher number to treat a
 * build as an update). The local android/ folder is git-ignored and is NOT
 * regenerated on every build, so it has to be patched directly.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appJsonPath = path.join(root, 'app.json');
const pkgPath = path.join(root, 'package.json');
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');

const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const expo = appJson.expo;
expo.android = expo.android || {};

let gradle = null;
let gradleCode = 0;
if (fs.existsSync(gradlePath)) {
  gradle = fs.readFileSync(gradlePath, 'utf8');
  const m = gradle.match(/versionCode\s+(\d+)/);
  if (m) gradleCode = parseInt(m[1], 10);
}

const arg = process.argv[2] || 'patch';
const current = expo.version || '1.0.0';
let next;
if (/^\d+\.\d+\.\d+$/.test(arg)) {
  next = arg;
} else {
  const [maj, min, pat] = current.split('.').map((n) => parseInt(n, 10) || 0);
  if (arg === 'major') next = `${maj + 1}.0.0`;
  else if (arg === 'minor') next = `${maj}.${min + 1}.0`;
  else if (arg === 'patch') next = `${maj}.${min}.${pat + 1}`;
  else {
    console.error(`Unknown argument "${arg}". Use patch | minor | major | x.y.z`);
    process.exit(1);
  }
}

// Take the highest known versionCode so we never go backwards.
const nextCode = Math.max(expo.android.versionCode || 0, gradleCode) + 1;

expo.version = next;
expo.android.versionCode = nextCode;
fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = next;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

if (gradle !== null) {
  gradle = gradle
    .replace(/versionCode\s+\d+/, `versionCode ${nextCode}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "${next}"`);
  fs.writeFileSync(gradlePath, gradle);
}

console.log(`Version ${current} -> ${next} (versionCode ${nextCode})`);
console.log(gradle !== null ? 'Patched android/app/build.gradle' : 'No android/ folder found - only app.json and package.json updated');
