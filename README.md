# LAYP Preview 4.1.2 APK

[Download the installable APK](https://github.com/nickodlcrz/react-native-layp/blob/apk-preview-4.1.2-50bd8fc/LAYP-preview-4.1.2.apk?raw=true)

Includes the redesigned Classes Today widget with comfortable spacing, full class times, an ongoing-class countdown, device-local weekday selection, and the transparent app navigation bar. It also includes the widget, task, reminder, and alarm improvements on main.

Installs as **LAYP Preview** (`com.layp.app.preview`) alongside the existing LAYP app. Android 6.0 or newer; ARM64 and ARMv7 phones. Open the downloaded APK on your Android phone and allow installation from your browser or file manager if prompted. Existing LAYP data stays in the original app; import a backup into the preview to use it here.

This is a release-mode build with bundled JavaScript; Metro and Expo Go are not required. It uses the Android template debug signing certificate. Updating the original package requires its original signing key.

- Source: [50bd8fc](https://github.com/nickodlcrz/react-native-layp/tree/50bd8fc994309486d4406a86cefa56a92a386215)
- Size: 37,561,764 bytes
- SHA-256: `f85576b312e36581854e18107f26376b0f41e6611f9fb691852cbcd50034dd8c`
- Built: 2026-10-06T21:22:46.293414+00:00

Validation: Android assembleRelease and release lint checks passed. APK v1/v2 signatures, ZIP integrity, bundled app code, required native libraries for both phone architectures, and license assets verified. Nine compiled native schedule checks passed. Jest: 201 passed; two existing frequentExpenseTemplates selector tests still fail. Phone UI, widget rendering, and alarm display have not been tested on a device.

JitPack is unavailable in this cloud environment. BlurView 2.0.6 and Android Image Cropper 4.3.1 are built from official tagged source archives with pinned SHA-256 checks. Their original licenses are included. The source adapter updates build metadata, declares the nullable bitmap result explicitly, and handles unavailable output streams.

Build instructions are in the [source README](https://github.com/nickodlcrz/react-native-layp/blob/50bd8fc994309486d4406a86cefa56a92a386215/README.md#standalone-preview-apk). This branch holds the APK and its metadata; source is on main.
