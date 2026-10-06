# Setting up Google Drive backups

LAYP can keep each backup in your own Google Drive (in a folder called
**LAYP Backups**) as well as on your phone. Google only lets an app sign you
in if it has an **OAuth client ID from a Google Cloud project**, and that
project has to be yours -- so this is a one-time setup. It's free and takes
about 10 minutes.

The backups use the `drive.file` permission: LAYP can only see files **it
created itself**, never the rest of your Drive.

## 1. Create a Google Cloud project

1. Go to <https://console.cloud.google.com> and sign in with the Google
   account you want to use for backups.
2. Top bar > project picker > **New project**. Name it `LAYP`. Create it and
   make sure it's selected.

## 2. Turn on the Drive API

**APIs & Services > Library** > search **Google Drive API** > **Enable**.

## 3. Set up the consent screen

**APIs & Services > OAuth consent screen** (or *Google Auth Platform*):

1. User type: **External**. App name `LAYP`, your email for support/contact.
2. **Scopes** > Add or remove scopes > add
   `https://www.googleapis.com/auth/drive.file` (it's listed as
   "See, edit, create and delete only the specific Google Drive files you use
   with this app").
3. **Publishing status: move it from "Testing" to "In production".**
   This matters: while an app is in *Testing*, Google expires its permission
   every **7 days**, which would break a weekly backup. `drive.file` is a
   non-sensitive scope, so publishing needs no Google review -- you just
   confirm.

## 4. Create two client IDs

**APIs & Services > Credentials > Create credentials > OAuth client ID**

**a) Web application** (this is the one LAYP's code uses)
- Application type: **Web application**, name `LAYP web`. Create.
- Copy the **Client ID** (it ends in `.apps.googleusercontent.com`).
- Open `src/googleConfig.js` and paste it:

  ```js
  export const GOOGLE_WEB_CLIENT_ID = "1234567890-abc...apps.googleusercontent.com";
  ```

**b) Android** (this one tells Google your app is really LAYP; the code never
sees it, but sign-in fails without it)
- Application type: **Android**, name `LAYP android`.
- Package name: `com.layp.app`
- **SHA-1 certificate fingerprint** -- must match the key your build is signed
  with:
  - EAS build: run `eas credentials`, choose Android, and copy the SHA1
    fingerprint of the keystore.
  - Local debug build: run `cd android && ./gradlew signingReport` and copy the
    SHA1 of the `debug` variant.
  - Installed from the Play Store: also add the SHA-1 shown under *Play Console
    > App integrity > App signing*.
  - If you build with more than one key (debug and release), create one
    Android client per key.

## 5. Build and connect

1. `npm install` (adds `@react-native-google-signin/google-signin`), then make
   a fresh native build (`npx expo prebuild --clean` / EAS build). It's a
   native module, so Expo Go can't run it.
2. In LAYP: **gear button > Summary > Backup > Connect Google account**, pick
   your account and allow access.
3. Tap **Back up now** to check it works. You should see a `LAYP Backups`
   folder in your Drive with a `layp-backup-YYYY-MM-DD.json` inside.

From then on LAYP backs up by itself once a week (see below).

## How automatic backup works

- Every 7 days it saves a copy **on your phone** and uploads one to **Drive**.
- A phone doesn't let an app run its code while it's closed, so LAYP checks
  whether a backup is due **when you open it** (and when you come back to it).
  If a week has passed, it backs up a few seconds later.
- If something fails (no internet, signed out), it keeps the phone copy and
  tries again after about 6 hours instead of every time you open the app.
- The newest 8 backups are kept in both places; older ones are removed.
- On your phone, backups go to LAYP's private folder by default. Use
  **Choose folder** (Backup > On this phone) to save them somewhere you can see,
  like `Downloads/LAYP`.

## Troubleshooting

| Message | Usual cause |
| --- | --- |
| `DEVELOPER_ERROR` / code 10 | The Android client's package name or SHA-1 doesn't match the build, or the client ID in `googleConfig.js` isn't the **Web** one. |
| `Access blocked` / app not verified | The consent screen is still in *Testing* and your account isn't listed as a test user -- publish it to *In production* (step 3). |
| `403 accessNotConfigured` | The Google Drive API isn't enabled for the project (step 2). |
| "Google sign-in isn't part of this build yet" | The build predates the library. Run `npm install` and make a new native build. |
| "One-time setup needed" | `GOOGLE_WEB_CLIENT_ID` in `src/googleConfig.js` is still empty. |
| Needs to reconnect every week | The project is still in *Testing*; publish it (step 3). |

## Privacy note

A backup contains everything in LAYP (tasks, spending, GF section...) as plain
readable JSON. Anyone who can open your Google Drive can read it, so keep that
account secured with a strong password and 2-step verification. Your PIN is not
stored in backups.
