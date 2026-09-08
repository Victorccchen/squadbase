import { PLAYER_PHOTOS_BUCKET } from "@/lib/org/player-photos";
import type { createClient } from "@/lib/supabase/server";

type PhotoClient = Awaited<ReturnType<typeof createClient>>;

/** Best-effort private Storage reads. Missing objects are skipped, never thrown. */
export async function downloadPlayerStorageObjects(
  supabase: PhotoClient,
  paths: readonly string[],
): Promise<Map<string, Uint8Array>> {
  const unique = [...new Set(paths.map((path) => path.trim()).filter((path) => path.length > 0))];
  const entries = await Promise.all(
    unique.map(async (path) => {
      try {
        const { data, error } = await supabase.storage.from(PLAYER_PHOTOS_BUCKET).download(path);
        if (error || !data) {
          console.error("downloadPlayerStorageObjects", path, error?.message);
          return null;
        }
        const bytes = new Uint8Array(await data.arrayBuffer());
        if (bytes.length === 0) {
          return null;
        }
        return [path, bytes] as const;
      } catch (error) {
        console.error("downloadPlayerStorageObjects", path, error);
        return null;
      }
    }),
  );

  const map = new Map<string, Uint8Array>();
  for (const entry of entries) {
    if (entry) {
      map.set(entry[0], entry[1]);
    }
  }
  return map;
}
