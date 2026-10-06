#!/usr/bin/env python3
"""Build-time source fallback for Expo 51's two pinned JitPack libraries.

Uses official tagged source archives, verified by SHA-256. Only generated
Android files and its ignored source-deps directory are changed.
"""
from pathlib import Path
import hashlib
import urllib.request
import zipfile
import xml.etree.ElementTree as ET

ET.register_namespace('android', 'http://schemas.android.com/apk/res/android')

repo = Path(__file__).resolve().parent.parent
android = repo / 'android'
cache = android / 'source-deps'
cache.mkdir(parents=True, exist_ok=True)
projects = [
    ('BlurView-version-2.0.6', 'library', 'https://codeload.github.com/Dimezis/BlurView/zip/refs/tags/version-2.0.6', '026d15f59bc93e1e8a49692aef1cb01ea6293de04f5e436ee827ec4a9a4ac58e'),
    ('Android-Image-Cropper-4.3.1', 'cropper', 'https://codeload.github.com/CanHub/Android-Image-Cropper/zip/refs/tags/4.3.1', '39b79465554c2b3de17b55f693f1947a567606e66ae9c81ce652b7aa00a968cc'),
]
for name, module, url, expected in projects:
    archive = cache / f'{name}.zip'
    if not archive.exists():
        with urllib.request.urlopen(url, timeout=60) as response:
            archive.write_bytes(response.read())
    if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
        raise RuntimeError(f'Checksum mismatch for {name}; refusing to use this archive')
    if not (cache / name / module).exists():
        with zipfile.ZipFile(archive) as source:
            if source.testzip() is not None:
                raise RuntimeError(f'Corrupt source archive: {name}')
            for entry in source.infolist():
                if not (cache / entry.filename).resolve().is_relative_to(cache.resolve()):
                    raise RuntimeError('Unsafe archive path')
            source.extractall(cache)
    manifest = cache / name / module / 'src/main/AndroidManifest.xml'
    tree = ET.parse(manifest)
    tree.getroot().attrib.pop('package', None)
    tree.write(manifest, encoding='utf-8', xml_declaration=True)

blur = cache / projects[0][0] / 'library'
cropper = cache / projects[1][0] / 'cropper'
# Android 34 exposes nullable APIs. Start from the verified original file
# on each run so these small compatibility changes remain repeatable.
bitmap_utils = cropper / 'src/main/java/com/canhub/cropper/BitmapUtils.kt'
with zipfile.ZipFile(cache / f'{projects[1][0]}.zip') as source:
    bitmap_source = source.read(f'{projects[1][0]}/cropper/src/main/java/com/canhub/cropper/BitmapUtils.kt').decode('utf-8')
bitmap_source = bitmap_source.replace('var result = Bitmap.createBitmap(', 'var result: Bitmap? = Bitmap.createBitmap(')
bitmap_source = bitmap_source.replace(
    'outputStream = context.contentResolver.openOutputStream(newUri!!, WRITE_AND_TRUNCATE)\n',
    'outputStream = context.contentResolver.openOutputStream(newUri!!, WRITE_AND_TRUNCATE)\n'
    '                ?: throw FileNotFoundException("Unable to open output URI: $newUri")\n',
)
bitmap_utils.write_text(bitmap_source)
blur.joinpath('build.gradle').write_text("""apply plugin: 'com.android.library'
android {
  namespace 'eightbitlab.com.blurview'
  compileSdkVersion 34
  defaultConfig { minSdkVersion 18; targetSdkVersion 31 }
  compileOptions { sourceCompatibility JavaVersion.VERSION_1_8; targetCompatibility JavaVersion.VERSION_1_8 }
}
dependencies { implementation 'androidx.annotation:annotation:1.3.0' }
""")
cropper.joinpath('build.gradle').write_text("""apply plugin: 'com.android.library'
apply plugin: 'kotlin-android'
apply plugin: 'kotlin-parcelize'
android {
  namespace 'com.canhub.cropper'
  compileSdkVersion 34
  defaultConfig { minSdkVersion 16; targetSdkVersion 31 }
  compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }
  kotlinOptions { jvmTarget = '17' }
  buildFeatures { viewBinding true }
}
dependencies {
  implementation 'androidx.appcompat:appcompat:1.4.2'
  implementation 'androidx.activity:activity-ktx:1.4.0'
  implementation 'androidx.exifinterface:exifinterface:1.3.3'
  implementation 'androidx.core:core-ktx:1.8.0'
  implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-core:1.6.3'
  implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.6.3'
}
""")
settings = android / 'settings.gradle'
start = '// LAYP source dependencies START'
end = '// LAYP source dependencies END'
import re

def replace_block(file, block):
    content = file.read_text()
    content = re.sub(re.escape(start) + r'.*?' + re.escape(end), '', content, flags=re.S)
    file.write_text(content.rstrip() + '\n\n' + start + '\n' + block + '\n' + end + '\n')

replace_block(settings, """include ':laypBlurSource', ':laypCropperSource'
project(':laypBlurSource').projectDir = file('source-deps/BlurView-version-2.0.6/library')
project(':laypCropperSource').projectDir = file('source-deps/Android-Image-Cropper-4.3.1/cropper')""")
replace_block(android / 'build.gradle', """allprojects {
  configurations.configureEach {
    resolutionStrategy.dependencySubstitution {
      substitute module('com.github.Dimezis:BlurView:version-2.0.6') using project(':laypBlurSource')
      substitute module('com.github.CanHub:Android-Image-Cropper:4.3.1') using project(':laypCropperSource')
    }
  }
}""")
licenses = android / 'app/src/main/assets/third-party-licenses'
licenses.mkdir(parents=True, exist_ok=True)
for name, source in [('BlurView-2.0.6.txt', cache / projects[0][0] / 'LICENSE.md'), ('Android-Image-Cropper-4.3.1.txt', cache / projects[1][0] / 'LICENSE.txt')]:
    (licenses / name).write_bytes(source.read_bytes())
print('Prepared verified official BlurView 2.0.6 and Android Image Cropper 4.3.1 sources.')
