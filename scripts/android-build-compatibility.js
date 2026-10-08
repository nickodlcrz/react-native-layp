const fs = require('fs');
const path = require('path');

const IGNORE_LIST_KEY = 'android.jetifier.ignorelist';

// Robolectric's Bouncy Castle test dependency contains Java 21 multi-release
// classes that Expo 51's Jetifier cannot parse. It has no Android support APIs
// to migrate, so leave this JAR unchanged while still jetifying other libraries.
function mergeJetifierIgnoreList(values) {
  const entries = values.flatMap((value) => String(value || '').split(','))
    .map((entry) => entry.trim()).filter(Boolean);
  return [...new Set([...entries, 'bcprov'])].join(',');
}

function ensureAndroidBuildCompatibility(androidDirectory) {
  const filename = path.join(androidDirectory, 'gradle.properties');
  // An existing native project is required: never regenerate a user's Android
  // folder, signing configuration or package ID as part of a release retry.
  const original = fs.readFileSync(filename, 'utf8');
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const lines = original.split(/\r?\n/);
  const pattern = /^\s*android\.jetifier\.ignorelist\s*[=:]\s*(.*)$/;
  const matches = lines.map((line) => line.match(pattern));
  const merged = mergeJetifierIgnoreList(matches.filter(Boolean).map((match) => match[1]));
  let replaced = false;
  const updated = lines.flatMap((line, index) => {
    if (!matches[index]) return [line];
    if (replaced) return [];
    replaced = true;
    return [`${IGNORE_LIST_KEY}=${merged}`];
  });
  if (!replaced) {
    if (updated[updated.length - 1] === '') updated.pop();
    updated.push(`${IGNORE_LIST_KEY}=${merged}`, '');
  }
  const output = updated.join(newline);
  if (output !== original) fs.writeFileSync(filename, output);
}

module.exports = { IGNORE_LIST_KEY, mergeJetifierIgnoreList, ensureAndroidBuildCompatibility };
