module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // react-native-reanimated's plugin must always be last.
    plugins: ["react-native-reanimated/plugin"],
  };
};
