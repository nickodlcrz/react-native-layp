#!/usr/bin/env node
/**
 * Interactive release: asks what kind of update this is, bumps the version
 * (via bump-version.js), then builds the release APK.
 *
 * Usage:
 *   npm run release:android            -> shows a menu
 *   npm run release:patch              -> no menu, patch bump + build
 *   npm run release:minor              -> no menu, minor bump + build
 *   npm run release:major              -> no menu, major bump + build
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');
const { ensureAndroidBuildCompatibility } = require('./android-build-compatibility');

const root = path.resolve(__dirname, '..');
const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const current = appJson.expo.version || '1.0.0';
const [maj, min, pat] = current.split('.').map((n) => parseInt(n, 10) || 0);

// Also read what the local Android build will actually use.
let gradleName = null;
let gradleCode = null;
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');
if (fs.existsSync(gradlePath)) {
  const g = fs.readFileSync(gradlePath, 'utf8');
  const n = g.match(/versionName\s+"([^"]*)"/);
  const c = g.match(/versionCode\s+(\d+)/);
  gradleName = n ? n[1] : null;
  gradleCode = c ? c[1] : null;
}

const next = {
  patch: `${maj}.${min}.${pat + 1}`,
  minor: `${maj}.${min + 1}.0`,
  major: `${maj + 1}.0.0`,
};

function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: true });
  if (res.status !== 0) {
    console.error(`\nFailed: ${cmd} ${args.join(' ')}`);
    process.exit(res.status || 1);
  }
}

function build() {
  ensureAndroidBuildCompatibility(path.join(root, 'android'));
  const gradle = process.platform === 'win32' ? 'gradlew' : './gradlew';
  console.log('\nBuilding release APK...\n');
  run(gradle, ['assembleRelease'], path.join(root, 'android'));
  console.log(
    '\nDone. APK: android\\app\\build\\outputs\\apk\\release\\app-release.apk'
  );
}

function go(choice) {
  run('node', [path.join('scripts', 'bump-version.js'), choice], root);
  build();
}

const preset = process.argv[2];
if (['patch', 'minor', 'major'].includes(preset)) {
  go(preset);
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('\n==============================');
  console.log(` Current version: ${current}`);
  console.log(` (app.json: ${current}, versionCode ${appJson.expo.android?.versionCode ?? 'not set'})`);
  if (gradleName !== null) {
    console.log(` (android build: ${gradleName}, versionCode ${gradleCode})`);
  }
  console.log('==============================');
  if (gradleName !== null && gradleName !== current) {
    console.log(`\n! app.json (${current}) and the android build (${gradleName}) differ.`);
    console.log('  Any bump below will sync both to the new version.');
  }
  console.log('');
  console.log(`  1) Patch  ${current} -> ${next.patch}   (small fixes)`);
  console.log(`  2) Minor  ${current} -> ${next.minor}   (new features)`);
  console.log(`  3) Major  ${current} -> ${next.major}   (big changes)`);
  console.log('  4) Custom (type your own version, e.g. 1.4.2)');
  console.log('  5) Build only, keep the current version');
  console.log('  0) Cancel\n');
  rl.question('Choose 0-5: ', (answer) => {
    const a = answer.trim();
    if (a === '1') { rl.close(); go('patch'); }
    else if (a === '2') { rl.close(); go('minor'); }
    else if (a === '3') { rl.close(); go('major'); }
    else if (a === '4') {
      rl.question('Version (x.y.z): ', (v) => {
        rl.close();
        if (!/^\d+\.\d+\.\d+$/.test(v.trim())) {
          console.error('Invalid version. Use the form 1.2.3');
          process.exit(1);
        }
        go(v.trim());
      });
    } else if (a === '5') { rl.close(); build(); }
    else { rl.close(); console.log('Cancelled. Nothing changed.'); }
  });
}
