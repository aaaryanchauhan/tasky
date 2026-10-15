/** Member photo rules shared by the browser (pre-upload resize) and the server (validation). */

/** Hard cap on what the server accepts (matches the bucket's file_size_limit). */
export const MAX_PHOTO_BYTES = 1_048_576;
/** Side of the square avatar the browser produces; plenty for an avatar, small for mobile data. */
export const PHOTO_SIZE = 512;
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

export type PhotoType = { mime: "image/jpeg" | "image/png" | "image/webp"; ext: "jpg" | "png" | "webp" };

/**
 * Identify an image by its leading bytes. The client-supplied Content-Type and filename are
 * never trusted: an SVG or HTML file renamed to .jpg is rejected here.
 */
export function detectImageType(bytes: Uint8Array): PhotoType | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return { mime: "image/png", ext: "png" };
  }
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // "RIFF"
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50   // "WEBP"
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

/** A fresh object name per upload so replaced photos never serve stale cached bytes. */
export function photoObjectPath(memberId: string, ext: string, nonce: string): string {
  return `${memberId}/${nonce}.${ext}`;
}

/** Only paths we generated for this member are acceptable (blocks path tricks). */
export function isOwnPhotoPath(memberId: string, path: string): boolean {
  return new RegExp(`^${memberId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(path);
}

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "";
  return (first + last).toUpperCase();
}
