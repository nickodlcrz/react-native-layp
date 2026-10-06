// Google Drive as a backup destination -- plain REST calls against the Drive
// v3 API, with the `drive.file` scope (the app can only see files it created
// itself, which is all a backup needs and avoids Google's sensitive-scope
// review). Everything network-facing goes through an injected `fetchImpl`
// and token functions, so the whole flow is unit tested without a phone.

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const BACKUP_FOLDER_NAME = "LAYP Backups";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export class DriveError extends Error {
  constructor(status, body) {
    super(`Google Drive request failed (${status}): ${body}`);
    this.name = "DriveError";
    this.status = status;
  }
}

// A multipart/related upload body: JSON metadata part, then the file part.
export function buildMultipartBody(metadata, content, boundary) {
  return [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json",
    "",
    content,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

// getToken(): the current access token. refreshToken(token): throw that token
// away so the next getToken() returns a fresh one (done once after a 401).
export function createDriveClient({ getToken, refreshToken = async () => {}, fetchImpl = fetch }) {
  async function call(url, init = {}, retried = false) {
    const token = await getToken();
    const res = await fetchImpl(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
    if (res.status === 401 && !retried) {
      await refreshToken(token);
      return call(url, init, true);
    }
    if (!res.ok) {
      let body = "";
      try { body = await res.text(); } catch (e) { /* no body */ }
      throw new DriveError(res.status, body.slice(0, 300));
    }
    return res;
  }

  async function findFolder() {
    const q = `name='${BACKUP_FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`;
    const res = await call(`${API}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent("files(id,name)")}&spaces=drive`);
    const json = await res.json();
    return json.files?.[0]?.id || null;
  }

  async function createFolder() {
    const res = await call(`${API}/files?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ name: BACKUP_FOLDER_NAME, mimeType: FOLDER_MIME }),
    });
    return (await res.json()).id;
  }

  async function ensureFolder() {
    return (await findFolder()) || (await createFolder());
  }

  async function listBackups(folderId) {
    const q = `'${folderId}' in parents and trashed=false and name contains 'layp-backup-'`;
    const url = `${API}/files?q=${encodeURIComponent(q)}&orderBy=${encodeURIComponent("createdTime desc")}&pageSize=100&fields=${encodeURIComponent("files(id,name,createdTime)")}`;
    const res = await call(url);
    return (await res.json()).files || [];
  }

  async function deleteFile(id) {
    await call(`${API}/files/${id}`, { method: "DELETE" });
  }

  async function upload({ name, content, folderId }) {
    const boundary = `layp_${Date.now().toString(36)}`;
    const res = await call(`${UPLOAD}/files?uploadType=multipart&fields=${encodeURIComponent("id,name,createdTime")}`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: buildMultipartBody({ name, parents: [folderId], mimeType: "application/json" }, content, boundary),
    });
    return res.json();
  }

  // Uploads one backup into the "LAYP Backups" folder (created on first use),
  // then deletes the oldest ones so only the newest `keepLast` remain.
  async function uploadBackup({ name, content, keepLast = 8 }) {
    const folderId = await ensureFolder();
    const file = await upload({ name, content, folderId });
    let pruned = 0;
    try {
      const all = await listBackups(folderId);
      for (const old of all.slice(keepLast)) {
        try { await deleteFile(old.id); pruned += 1; } catch (e) { /* leave it; next time */ }
      }
    } catch (e) { /* the upload itself succeeded */ }
    return { id: file.id, name: file.name, pruned };
  }

  return { uploadBackup, ensureFolder, listBackups };
}
