const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { ensureAndroidBuildCompatibility } = require('../android-build-compatibility');
const withAndroidBuildCompatibility = require('../../plugins/withAndroidBuildCompatibility');

let directory;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'layp-build-')); });
afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });

test.each(['\n', '\r\n'])('keeps native properties and signing files intact with %j line endings', (newline) => {
  const filename = path.join(directory, 'gradle.properties');
  const original = ['# Local configuration', 'android.enableJetifier=true', 'MY_UPLOAD_STORE_FILE=release.keystore', ''].join(newline);
  fs.writeFileSync(filename, original);
  const signingFile = path.join(directory, 'release.keystore');
  fs.writeFileSync(signingFile, Buffer.from([1, 2, 3, 4]));
  ensureAndroidBuildCompatibility(directory);
  expect(fs.readFileSync(filename, 'utf8')).toBe(original + 'android.jetifier.ignorelist=bcprov' + newline);
  expect(fs.readFileSync(signingFile)).toEqual(Buffer.from([1, 2, 3, 4]));
});

test('preserves and combines existing ignore patterns and can run repeatedly', () => {
  const filename = path.join(directory, 'gradle.properties');
  fs.writeFileSync(filename, '# keep me\nandroid.jetifier.ignorelist=existing.*\nandroid.jetifier.ignorelist: custom, bcprov\nother=value\n');
  ensureAndroidBuildCompatibility(directory);
  const first = fs.readFileSync(filename, 'utf8');
  expect(first).toBe('# keep me\nandroid.jetifier.ignorelist=existing.*,custom,bcprov\nother=value\n');
  ensureAndroidBuildCompatibility(directory);
  expect(fs.readFileSync(filename, 'utf8')).toBe(first);
});

test('requires an existing project instead of generating a new native configuration', () => {
  expect(() => ensureAndroidBuildCompatibility(directory)).toThrow();
  expect(fs.readdirSync(directory)).toEqual([]);
});

test('Expo prebuild mod keeps other properties and existing ignore entries on repeat runs', async () => {
  const config = withAndroidBuildCompatibility({ name: 'LAYP', slug: 'layp-app' });
  const initial = { modRequest: { platform: 'android', modName: 'gradleProperties' }, modResults: [
    { type: 'comment', value: 'keep me' },
    { type: 'property', key: 'android.enableJetifier', value: 'true' },
    { type: 'property', key: 'android.jetifier.ignorelist', value: 'existing.*' },
  ] };
  const first = await config.mods.android.gradleProperties(initial);
  expect(first.modResults).toEqual([
    initial.modResults[0], initial.modResults[1],
    { type: 'property', key: 'android.jetifier.ignorelist', value: 'existing.*,bcprov' },
  ]);
  const second = await config.mods.android.gradleProperties(first);
  expect(second.modResults).toEqual(first.modResults);
});

(process.platform === 'win32' ? test.skip : test)('build-only release applies compatibility before invoking Gradle without changing the version', () => {
  // Exercise the actual release entry point with a lightweight Gradle stand-in.
  const scripts = path.join(directory, 'scripts');
  const android = path.join(directory, 'android');
  fs.mkdirSync(scripts);
  fs.mkdirSync(path.join(android, 'app'), { recursive: true });
  for (const name of ['release.js', 'android-build-compatibility.js']) {
    fs.copyFileSync(path.join(__dirname, '..', name), path.join(scripts, name));
  }
  const appJson = JSON.stringify({ expo: { version: '4.2.2', android: { versionCode: 21 } } });
  fs.writeFileSync(path.join(directory, 'app.json'), appJson);
  const nativeBuild = 'applicationId "com.layp.app"\nversionName "4.2.2"\nversionCode 21\n';
  fs.writeFileSync(path.join(android, 'app', 'build.gradle'), nativeBuild);
  fs.writeFileSync(path.join(android, 'gradle.properties'), 'android.enableJetifier=true\n');
  fs.writeFileSync(path.join(android, 'gradlew'), '#!/bin/sh\ncat gradle.properties > invoked-properties.txt\n', { mode: 0o755 });
  const result = spawnSync(process.execPath, [path.join(scripts, 'release.js')], { cwd: directory, input: '5\n', encoding: 'utf8' });
  expect(result.status).toBe(0);
  expect(fs.readFileSync(path.join(android, 'invoked-properties.txt'), 'utf8')).toContain('android.jetifier.ignorelist=bcprov');
  expect(fs.readFileSync(path.join(directory, 'app.json'), 'utf8')).toBe(appJson);
  expect(fs.readFileSync(path.join(android, 'app', 'build.gradle'), 'utf8')).toBe(nativeBuild);
});
