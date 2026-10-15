import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { detectImageType, isOwnPhotoPath, MAX_PHOTO_BYTES, photoObjectPath } from "@/lib/photo";

type Client = SupabaseClient<Database>;

export const PHOTO_BUCKET = "member-photos";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type PhotoResult = { ok: true; path: string } | { ok: false; error: string };

/**
 * Validate and store a member's photo, then point the member at it. The browser resizes first, but
 * nothing about the upload is trusted: size and real file type are checked here, and the object is
 * written through the admin's own session so storage RLS applies as well.
 */
export async function saveMemberPhoto(
  supabase: Client,
  memberId: string,
  file: File,
  previousPath: string | null,
): Promise<PhotoResult> {
  if (file.size === 0) return { ok: false, error: "That photo is empty." };
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: "That photo is too large (1 MB maximum)." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) return { ok: false, error: "Use a JPEG, PNG or WebP photo." };

  const path = photoObjectPath(memberId, type.ext, crypto.randomUUID());
  const upload = await supabase.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: type.mime, upsert: false });
  if (upload.error) {
    console.error("photo upload failed", upload.error.message);
    return { ok: false, error: "The photo couldn't be uploaded. Please try again." };
  }

  const { error } = await supabase.from("members").update({ photo_path: path }).eq("id", memberId);
  if (error) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path]); // don't leave an orphan behind
    console.error("photo path update failed", error.message);
    return { ok: false, error: "The photo couldn't be saved. Please try again." };
  }

  if (previousPath && previousPath !== path && isOwnPhotoPath(memberId, previousPath)) {
    await supabase.storage.from(PHOTO_BUCKET).remove([previousPath]);
  }
  return { ok: true, path };
}

export async function removeMemberPhoto(supabase: Client, memberId: string, path: string | null): Promise<void> {
  const { error } = await supabase.from("members").update({ photo_path: null }).eq("id", memberId);
  if (error) {
    console.error("photo path clear failed", error.message);
    return;
  }
  if (path && isOwnPhotoPath(memberId, path)) await supabase.storage.from(PHOTO_BUCKET).remove([path]);
}

/** Short-lived signed links for display. The bucket is private; there are no permanent URLs. */
export async function signedPhotoUrls(
  supabase: Client,
  paths: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    console.error("could not sign photo urls", error?.message);
    return out; // fall back to initials rather than failing the page
  }
  for (const item of data) if (item.path && item.signedUrl) out.set(item.path, item.signedUrl);
  return out;
}
