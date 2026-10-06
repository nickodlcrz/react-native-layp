import AsyncStorage from "@react-native-async-storage/async-storage";
import { saveState, flushSaveState } from "../storage";

jest.mock("@react-native-async-storage/async-storage", () => ({
  multiSet: jest.fn(() => Promise.resolve()),
}));
beforeEach(() => { jest.useFakeTimers(); AsyncStorage.multiSet.mockClear(); });
afterEach(() => { jest.useRealTimers(); });

it("only reports success after the queued state reaches storage", async () => {
  let complete;
  AsyncStorage.multiSet.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
  saveState({ cancelledClasses: [{ entryId: "c", date: "2026-10-07" }] });
  let done = false;
  const saving = flushSaveState().then((ok) => { done = ok; });
  await Promise.resolve();
  expect(done).toBe(false);
  const otherFlush = flushSaveState();
  complete();
  await saving;
  expect(await otherFlush).toBe(true);
  expect(AsyncStorage.multiSet.mock.calls[0][0]).toEqual(expect.arrayContaining([expect.arrayContaining([JSON.stringify([{ entryId: "c", date: "2026-10-07" }])])]));
});
it("a failed write retains state for retry instead of acknowledging widget changes", async () => {
  const error = jest.spyOn(console, "error").mockImplementation(() => {});
  AsyncStorage.multiSet.mockRejectedValueOnce(new Error("Disk unavailable"));
  saveState({ reminders: [{ id: "r", text: "Remember" }] });
  expect(await flushSaveState()).toBe(false);
  expect(await flushSaveState()).toBe(true);
  expect(AsyncStorage.multiSet).toHaveBeenCalledTimes(2);
  error.mockRestore();
});

it("a failed older write cannot overwrite a newer successful save", async () => {
  const error = jest.spyOn(console, "error").mockImplementation(() => {});
  let fail;
  AsyncStorage.multiSet.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
  saveState({ reminders: [{ id: "old" }] });
  const older = flushSaveState();
  await Promise.resolve();
  saveState({ reminders: [{ id: "new" }] });
  const newer = flushSaveState();
  fail(new Error("Old write failed"));
  expect(await older).toBe(false);
  expect(await newer).toBe(true);
  expect(await flushSaveState()).toBe(true);
  expect(AsyncStorage.multiSet).toHaveBeenCalledTimes(2);
  expect(AsyncStorage.multiSet.mock.calls[1][0][0][1]).toBe(JSON.stringify([{ id: "new" }]));
  error.mockRestore();
});
