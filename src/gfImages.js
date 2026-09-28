import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { uid } from "./utils";

// expo-image-picker hands back a URI that can point into the OS's own
// cache/picker storage -- fine for immediately previewing the image, but
// not guaranteed to still exist next time the app launches. Copying it
// into the app's own document directory (same durability guarantee as
// everything else LAYP stores) is what makes a Like's or Gift Idea's
// photo actually persist across sessions, not just until the OS decides
// to reclaim its cache.
const GF_IMAGES_DIR = FileSystem.documentDirectory + "gf-images/";

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(GF_IMAGES_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(GF_IMAGES_DIR, { intermediates: true });
}

// Opens the photo library, and returns the persisted local URI of
// whatever was picked -- or null if the person cancelled or denied the
// permission prompt. Never throws; a failure here should just mean "no
// image attached", not a crash.
export async function pickAndSaveGfImage() {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    const picked = result.assets[0].uri;
    await ensureDir();
    const ext = (picked.split(".").pop() || "jpg").split("?")[0].slice(0, 4);
    const dest = `${GF_IMAGES_DIR}${uid()}.${ext}`;
    await FileSystem.copyAsync({ from: picked, to: dest });
    return dest;
  } catch (e) {
    console.error("pickAndSaveGfImage failed", e);
    return null;
  }
}

// Best-effort cleanup when a Like/Gift Idea with an attached photo is
// deleted -- not calling this wouldn't corrupt anything (it's just an
// orphaned file sitting in the app's own sandboxed storage), but there's
// no reason to let it accumulate forever either.
export async function deleteGfImage(uri) {
  if (!uri || !uri.startsWith(GF_IMAGES_DIR)) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (e) {
    // Already gone -- nothing to do.
  }
}
