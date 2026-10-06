import { isBackupDue, nextBackupAt, backupFileName, parseBackupFileDate, selectBackupsToDelete } from "../backupSchedule";
import { createDriveClient, buildMultipartBody, DriveError, BACKUP_FOLDER_NAME } from "../googleDrive";
import { runBackup } from "../backupService";
import { normalizeBackupSettings, DEFAULT_BACKUP_SETTINGS } from "../backupSettingsLogic";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

describe("backup schedule", () => {
  const now = Date.UTC(2026, 9, 10, 12);

  test("first ever run is due", () => {
    expect(isBackupDue({ lastSuccessAt: null, lastAttemptAt: null, now })).toBe(true);
  });

  test("due after 7 days, not before", () => {
    expect(isBackupDue({ lastSuccessAt: now - 6 * DAY, lastAttemptAt: now - 6 * DAY, now })).toBe(false);
    expect(isBackupDue({ lastSuccessAt: now - 7 * DAY, lastAttemptAt: now - 7 * DAY, now })).toBe(true);
    expect(isBackupDue({ lastSuccessAt: now - 30 * DAY, lastAttemptAt: now - 30 * DAY, now })).toBe(true);
  });

  test("after a failed try, waits out the retry window", () => {
    const lastSuccessAt = now - 8 * DAY;
    expect(isBackupDue({ lastSuccessAt, lastAttemptAt: now - 1 * HOUR, now })).toBe(false);
    expect(isBackupDue({ lastSuccessAt, lastAttemptAt: now - 7 * HOUR, now })).toBe(true);
  });

  test("a failed first try also waits before retrying", () => {
    expect(isBackupDue({ lastSuccessAt: null, lastAttemptAt: now - 2 * HOUR, now })).toBe(false);
    expect(isBackupDue({ lastSuccessAt: null, lastAttemptAt: now - 9 * HOUR, now })).toBe(true);
  });

  test("next backup is a week after the last success", () => {
    expect(nextBackupAt(null)).toBeNull();
    expect(nextBackupAt(now).getTime()).toBe(now + 7 * DAY);
  });

  test("file names and pruning", () => {
    expect(backupFileName("2026-10-04")).toBe("layp-backup-2026-10-04.json");
    expect(parseBackupFileDate("layp-backup-2026-10-04.json")).toBe("2026-10-04");
    expect(parseBackupFileDate("notes.txt")).toBeNull();
    const names = ["layp-backup-2026-09-01.json", "layp-backup-2026-10-04.json", "other.json", "layp-backup-2026-09-20.json", "layp-backup-2026-08-01.json"];
    expect(selectBackupsToDelete(names, 2)).toEqual(["layp-backup-2026-09-01.json", "layp-backup-2026-08-01.json"]);
    expect(selectBackupsToDelete(names, 10)).toEqual([]);
  });
});

// A scripted fake of the Drive REST API: records every request and answers
// from a queue of canned responses.
function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET", headers: init.headers || {}, body: init.body });
    const r = responses.shift();
    if (!r) throw new Error("unexpected extra request: " + url);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json, text: async () => r.text || "" };
  };
  return { impl, calls };
}

describe("google drive client", () => {
  test("uploads into the existing folder and prunes beyond keepLast", async () => {
    const f = fakeFetch([
      { status: 200, json: { files: [{ id: "folder1" }] } },
      { status: 200, json: { id: "new", name: "layp-backup-2026-10-04.json" } },
      { status: 200, json: { files: [{ id: "new" }, { id: "b" }, { id: "c" }, { id: "d" }] } },
      { status: 204 }, { status: 204 },
    ]);
    const client = createDriveClient({ getToken: async () => "tok", fetchImpl: f.impl });
    const out = await client.uploadBackup({ name: "layp-backup-2026-10-04.json", content: '{"a":1}', keepLast: 2 });
    expect(out).toEqual({ id: "new", name: "layp-backup-2026-10-04.json", pruned: 2 });
    expect(f.calls.map((c) => c.method)).toEqual(["GET", "POST", "GET", "DELETE", "DELETE"]);
    expect(f.calls[3].url.endsWith("/files/c")).toBe(true);
    expect(f.calls[4].url.endsWith("/files/d")).toBe(true);
    expect(f.calls[0].headers.Authorization).toBe("Bearer tok");
    expect(f.calls[1].url.includes("uploadType=multipart")).toBe(true);
    expect(f.calls[1].body.includes('"parents":["folder1"]')).toBe(true);
    expect(f.calls[1].body.includes('{"a":1}')).toBe(true);
  });

  test("creates the LAYP Backups folder when it doesn't exist yet", async () => {
    const f = fakeFetch([
      { status: 200, json: { files: [] } },
      { status: 200, json: { id: "made" } },
      { status: 200, json: { id: "up", name: "x.json" } },
      { status: 200, json: { files: [{ id: "up" }] } },
    ]);
    const client = createDriveClient({ getToken: async () => "tok", fetchImpl: f.impl });
    await client.uploadBackup({ name: "x.json", content: "{}" });
    expect(f.calls[1].method).toBe("POST");
    expect(JSON.parse(f.calls[1].body).name).toBe(BACKUP_FOLDER_NAME);
    expect(f.calls[2].body.includes('"parents":["made"]')).toBe(true);
  });

  test("a 401 refreshes the token once and retries", async () => {
    const f = fakeFetch([
      { status: 401, text: "expired" },
      { status: 200, json: { files: [{ id: "folder1" }] } },
      { status: 200, json: { id: "u", name: "n" } },
      { status: 200, json: { files: [] } },
    ]);
    let refreshed = null;
    let n = 0;
    const client = createDriveClient({ getToken: async () => `tok${++n}`, refreshToken: async (t) => { refreshed = t; }, fetchImpl: f.impl });
    await client.uploadBackup({ name: "n", content: "{}" });
    expect(refreshed).toBe("tok1");
    expect(f.calls[0].headers.Authorization).toBe("Bearer tok1");
    expect(f.calls[1].headers.Authorization).toBe("Bearer tok2");
  });

  test("a failing request surfaces as a DriveError", async () => {
    const f = fakeFetch([{ status: 403, text: "quota" }]);
    const client = createDriveClient({ getToken: async () => "t", fetchImpl: f.impl });
    let err = null;
    try { await client.uploadBackup({ name: "n", content: "{}" }); } catch (e) { err = e; }
    expect(err instanceof DriveError).toBe(true);
    expect(err.status).toBe(403);
  });

  test("a failed prune never fails the upload", async () => {
    const f = fakeFetch([
      { status: 200, json: { files: [{ id: "folder1" }] } },
      { status: 200, json: { id: "u", name: "n" } },
      { status: 500, text: "boom" },
    ]);
    const client = createDriveClient({ getToken: async () => "t", fetchImpl: f.impl });
    const out = await client.uploadBackup({ name: "n", content: "{}", keepLast: 1 });
    expect(out.id).toBe("u");
  });

  test("multipart body has the metadata part, then the file part, then the closing boundary", () => {
    const body = buildMultipartBody({ name: "a.json" }, '{"x":1}', "BND");
    const lines = body.split("\r\n");
    expect(lines[0]).toBe("--BND");
    expect(lines[3]).toBe('{"name":"a.json"}');
    expect(lines[4]).toBe("--BND");
    expect(lines[7]).toBe('{"x":1}');
    expect(lines[8]).toBe("--BND--");
  });
});

describe("runBackup", () => {
  const data = { version: 1, todos: [] };
  const base = { data, todayISO: "2026-10-04", now: 5000, settings: { driveEnabled: true }, driveConnected: true };
  const okDeps = () => ({ calls: [], writeLocal: async (n) => ({ uri: "file:///b/" + n }), uploadDrive: async () => ({ id: "d1" }), markExported: async () => {} });

  test("device + Drive both succeed", async () => {
    const r = await runBackup({ ...base, deps: okDeps() });
    expect(r.success).toBe(true);
    expect(r.local.ok).toBe(true);
    expect(r.drive.ok).toBe(true);
    expect(r.settingsPatch).toEqual({ lastAttemptAt: 5000, lastLocalAt: 5000, lastDriveAt: 5000, lastSuccessAt: 5000, lastError: null });
  });

  test("Drive off or not connected: the device copy alone is a success", async () => {
    const a = await runBackup({ ...base, settings: { driveEnabled: false }, deps: okDeps() });
    expect(a.success).toBe(true);
    expect(a.drive.skipped).toBe(true);
    const b = await runBackup({ ...base, driveConnected: false, deps: okDeps() });
    expect(b.success).toBe(true);
    expect(b.drive.skipped).toBe(true);
  });

  test("Drive failing keeps the device copy but is not a success, so it retries", async () => {
    const deps = { ...okDeps(), uploadDrive: async () => { throw new Error("offline"); } };
    const r = await runBackup({ ...base, deps });
    expect(r.local.ok).toBe(true);
    expect(r.drive.ok).toBe(false);
    expect(r.success).toBe(false);
    expect(r.settingsPatch.lastSuccessAt).toBeUndefined();
    expect(r.settingsPatch.lastLocalAt).toBe(5000);
    expect(r.settingsPatch.lastError).toBe("Google Drive: offline");
  });

  test("the device write failing doesn't stop the Drive upload", async () => {
    const deps = { ...okDeps(), writeLocal: async () => { throw new Error("disk full"); } };
    const r = await runBackup({ ...base, deps });
    expect(r.local.ok).toBe(false);
    expect(r.drive.ok).toBe(true);
    expect(r.success).toBe(false);
    expect(r.settingsPatch.lastError).toBe("Device: disk full");
  });

  test("uploads exactly what was written, under the dated name", async () => {
    let wrote = null, uploaded = null;
    const deps = { ...okDeps(), writeLocal: async (n, c) => { wrote = [n, c]; return { uri: "u" }; }, uploadDrive: async (n, c) => { uploaded = [n, c]; return { id: "x" }; } };
    await runBackup({ ...base, deps });
    expect(wrote).toEqual(["layp-backup-2026-10-04.json", JSON.stringify(data)]);
    expect(uploaded).toEqual(wrote);
  });

  test("the reminder is reset whenever something was actually saved", async () => {
    let marked = 0;
    const deps = { ...okDeps(), markExported: async () => { marked += 1; } };
    await runBackup({ ...base, deps });
    expect(marked).toBe(1);
    const failing = { ...okDeps(), writeLocal: async () => { throw new Error("x"); }, uploadDrive: async () => { throw new Error("y"); }, markExported: async () => { marked += 1; } };
    await runBackup({ ...base, deps: failing });
    expect(marked).toBe(1);
  });
});

describe("backup settings", () => {
  test("defaults: automatic, Drive on, nothing done yet", () => {
    expect(normalizeBackupSettings(null)).toEqual(DEFAULT_BACKUP_SETTINGS);
    expect(DEFAULT_BACKUP_SETTINGS.autoEnabled).toBe(true);
    expect(DEFAULT_BACKUP_SETTINGS.driveEnabled).toBe(true);
  });

  test("bad values fall back safely", () => {
    const s = normalizeBackupSettings({ autoEnabled: "yes", lastSuccessAt: "x", folderUri: 5, lastError: "boom" });
    expect(s.autoEnabled).toBe(true);
    expect(s.lastSuccessAt).toBeNull();
    expect(s.folderUri).toBeNull();
    expect(s.lastError).toBe("boom");
  });
});
