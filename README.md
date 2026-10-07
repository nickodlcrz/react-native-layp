# LAYP 4.2.0 downloads

Source commit: 03a6a71c0b8ccf2fdd8423c5f2d0d45bc45e8fbf on main.

- LAYP-preview-4.2.0.apk: installable Android preview, embedded offline JavaScript, Android 6 or newer, ARM64/ARMv7 phones. Package com.layp.app.preview, version code 15, same Android template preview signing certificate as 4.1.2. Installs alongside the original LAYP app and updates the previous LAYP Preview. Keep the previous preview installed to retain its data.
- LAYP-updated-source-4.2.0.zip: exact source-only archive of the commit above, excluding dependencies, generated builds and artifacts.
- SHA256SUMS: checksums for both downloads.

Browser: open a file, then use Download raw file. APK and ZIP links accept ?raw=true.

New: Home → Plan week; Settings → Widgets for appearance, previews and visibility; Settings → General for alarm health and a cancellable ten-second test. Task subtask progress appears in cards/widgets. Home forecasts seven/thirty days from current balances, recurring income, unpaid bills and planned savings; everyday spending and loan repayments are excluded.

Validation: all 26 suites / 221 tests pass; complete Android release build passed; APK signing, archive integrity, both phone architectures and embedded bundle verified. Alarm screen behavior and launcher rendering still require phone testing. The native features require this APK rather than Expo Go.
