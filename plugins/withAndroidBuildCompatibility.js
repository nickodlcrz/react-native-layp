const { withGradleProperties } = require('expo/config-plugins');
const { IGNORE_LIST_KEY, mergeJetifierIgnoreList } = require('../scripts/android-build-compatibility');

module.exports = function withAndroidBuildCompatibility(config) {
  return withGradleProperties(config, (mod) => {
    const existing = mod.modResults.filter((item) => item.type === 'property' && item.key === IGNORE_LIST_KEY);
    mod.modResults = mod.modResults.filter((item) => item.type !== 'property' || item.key !== IGNORE_LIST_KEY);
    mod.modResults.push({ type: 'property', key: IGNORE_LIST_KEY,
      value: mergeJetifierIgnoreList(existing.map((item) => item.value)) });
    return mod;
  });
};
