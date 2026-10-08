#!/usr/bin/env node
// Build a standalone, side-by-side Android APK without changing app.json.
// Requires npm dependencies, Java 17, Android SDK/NDK, and Gradle network access.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ensureAndroidBuildCompatibility } = require('./android-build-compatibility');
const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const prebuildArgs = ['expo', 'prebuild', '--platform', 'android', '--no-install'];
// A verified local npm template avoids registry fetches in restricted builders.
if (process.env.LAYP_EXPO_TEMPLATE) prebuildArgs.push('--template', path.resolve(process.env.LAYP_EXPO_TEMPLATE));
run(npx, prebuildArgs);
const native = path.join(root, 'android');
if (!fs.existsSync(path.join(native, 'app', 'build.gradle'))) {
  throw new Error('Expo prebuild did not create the Android project. Check its output or set LAYP_EXPO_TEMPLATE to a local Expo template archive.');
}
ensureAndroidBuildCompatibility(native);
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (sdk && fs.existsSync(path.join(sdk, 'cmake', '3.22.1', 'bin'))) {
  const properties = path.join(native, 'local.properties');
  const prior = fs.existsSync(properties) ? fs.readFileSync(properties, 'utf8') : '';
  const lines = prior.split(/\r?\n/).filter((line) => line && !line.startsWith('cmake.dir='));
  lines.push('cmake.dir=' + path.join(sdk, 'cmake', '3.22.1').replace(/\\/g, '/'));
  fs.writeFileSync(properties, lines.join('\n') + '\n');
}
if (process.argv.includes('--source-deps')) {
  run(process.env.LAYP_PYTHON_BIN || 'python3', [path.join(root, 'scripts', 'prepare-android-source-deps.py')]);
}
const gradleFile = path.join(native, 'app', 'build.gradle');
let gradle = fs.readFileSync(gradleFile, 'utf8');
gradle = gradle.replace(/applicationId ['"][^'"]+['"]/, `applicationId '${config.android.package}.preview'`)
  .replace(/versionName "[^"]+"/, `versionName "${config.version}-preview"`);
// Filter packaged libraries too: dependency AARs can include x86 binaries
// even when the local native modules were built only for phone ABIs.
if (!gradle.includes('// LAYP preview phone ABIs')) {
  gradle = gradle.replace(/defaultConfig\s*\{/, 'defaultConfig {\n        // LAYP preview phone ABIs\n        ndk { abiFilters "arm64-v8a", "armeabi-v7a" }');
}
fs.writeFileSync(gradleFile, gradle);
const strings = path.join(native, 'app', 'src', 'main', 'res', 'values', 'strings.xml');
fs.writeFileSync(strings, fs.readFileSync(strings, 'utf8').replace(/<string name="app_name">[^<]*<\/string>/, '<string name="app_name">LAYP Preview</string>'));
const gradleBin = process.env.LAYP_GRADLE_BIN || (process.platform === 'win32' ? 'gradlew.bat' : './gradlew');
run(gradleBin, [':app:assembleRelease', '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a', '--no-daemon', '--max-workers=2', '--console=plain'], native);
const output = path.join(root, 'dist', 'apk', `LAYP-preview-${config.version}.apk`);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.copyFileSync(path.join(native, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'), output);
console.log(`\nAPK: ${output}\nUses the Android template debug signing certificate and installs as LAYP Preview.`);
