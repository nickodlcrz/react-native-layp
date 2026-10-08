# LAYP source 4.2.1 — Android release build fix

Source commit: `d9413ba57d0f272ebe26079bfc07555da0ec22b3`.

Download **LAYP-updated-source-4.2.1-build-fix.zip** above using the Download raw file button.
This archive contains source only; no APK or generated native build files.

The fix preserves other Jetifier ignore entries and leaves Bouncy Castle test
dependencies unchanged, preventing the release lint failure with class version 65.
It applies during fresh Expo prebuilds and existing Android release retries.

Update your checkout with these source changes. Preserve your existing `android/`,
signing files, and local version/versionCode in `app.json` and `package.json`.
Add the compatibility plugin entry to `app.json`, then run
`npm run release:android` and choose **5 — Build only**.
The failed release already bumped your version, so another bump is unnecessary.

Validation: 230 app tests, 9 native tests, and the previously failing
`:layp-widget:generateReleaseLintModel` task passed with the persistent setting.

SHA-256: `f614cc7d8c08f5c34179b71313635dafd7b26029162faa4fea3f091c9d261aa1`.
