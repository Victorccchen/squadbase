import { createClient } from "@/lib/supabase/server";
import { PLAYER_PHOTOS_BUCKET, SIGNED_PHOTO_TTL_SECONDS } from "@/lib/org/player-photos";

export async function signPlayerStoragePaths(
  paths: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [
    ...new Set(
      paths
        .map((path) => path?.trim() ?? "")
        .filter((path) => path.length > 0),
    ),
  ];
  if (unique.length === 0) {
    return new Map();
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(PLAYER_PHOTOS_BUCKET)
    .createSignedUrls(unique, SIGNED_PHOTO_TTL_SECONDS);

  if (error || !data) {
    console.error("signPlayerStoragePaths", error?.message);
    return new Map();
  }

  const map = new Map<string, string>();
  for (const row of data) {
    const url = row.signedUrl ?? row.signedURL;
    if (row.path && url && !row.error) {
      map.set(row.path, url);
    }
  }
  return map;
}
