import { PHOTO_SIZE } from "./photo";

/**
 * Browser-only: centre-crop to a square and downscale to PHOTO_SIZE, re-encoded as JPEG.
 * Phone photos are often 5–10 MB (and HEIC/rotated); this makes them ~50–150 KB and applies the
 * EXIF orientation. Also drops EXIF metadata (location etc.) because the canvas re-encode omits it.
 */
export async function resizeToSquareJpeg(file: File, size = PHOTO_SIZE): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = Math.floor((bitmap.width - side) / 2);
    const sy = Math.floor((bitmap.height - side) / 2);
    const out = Math.min(size, side);
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("encode failed");
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
