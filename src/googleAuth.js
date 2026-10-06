import { GOOGLE_WEB_CLIENT_ID } from "./googleConfig";
import { DRIVE_FILE_SCOPE, createDriveClient } from "./googleDrive";

// The Google account side of Drive backups, on top of
// @react-native-google-signin/google-signin. That library is a native
// module, so it is required lazily: in a build that doesn't include it
// (Expo Go, an older dev client) the app still works and the Drive controls
// just say a new build is needed.
let GoogleSignin = null;
try {
  GoogleSignin = require("@react-native-google-signin/google-signin").GoogleSignin;
} catch (e) {
  GoogleSignin = null;
}

let configured = false;
function ensureConfigured() {
  if (configured || !GoogleSignin) return;
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, scopes: [DRIVE_FILE_SCOPE] });
  configured = true;
}

// "unavailable"    this build doesn't include the Google sign-in module
// "not_configured" no client ID has been added to googleConfig.js yet
// "ready"          can sign in
export function googleDriveStatus() {
  if (!GoogleSignin) return "unavailable";
  if (!GOOGLE_WEB_CLIENT_ID) return "not_configured";
  return "ready";
}

// Opens Google's account picker. Resolves { ok: true, email } or
// { ok: false, cancelled: true }; real failures throw (the message says what).
export async function connectGoogle() {
  ensureConfigured();
  await GoogleSignin.hasPlayServices();
  const res = await GoogleSignin.signIn();
  if (res.type === "success") return { ok: true, email: res.data.user.email };
  return { ok: false, cancelled: true };
}

// The account that's still signed in (checked silently, no UI), or null.
export async function currentGoogleAccount() {
  if (googleDriveStatus() !== "ready") return null;
  ensureConfigured();
  try {
    const res = await GoogleSignin.signInSilently();
    return res.type === "success" ? { email: res.data.user.email } : null;
  } catch (e) {
    return null;
  }
}

export async function disconnectGoogle() {
  if (!GoogleSignin) return;
  ensureConfigured();
  try { await GoogleSignin.signOut(); } catch (e) { /* already signed out */ }
}

// Uploads one backup file to the "LAYP Backups" folder in the signed-in
// account's Drive. The library hands out (and refreshes) the access token.
export async function uploadToDrive(name, content, keepLast) {
  ensureConfigured();
  const account = await currentGoogleAccount();
  if (!account) throw new Error("Google account isn't signed in -- connect it again in Settings > Summary.");
  const client = createDriveClient({
    getToken: async () => (await GoogleSignin.getTokens()).accessToken,
    refreshToken: async (token) => { try { await GoogleSignin.clearCachedAccessToken(token); } catch (e) { /* ignore */ } },
  });
  return client.uploadBackup({ name, content, keepLast });
}
