/**
 * Resizes/compresses an uploaded image client-side before it's ever
 * sent to the server — member photos are stored as a base64 data URL
 * directly (no file-storage infra in this app yet), so keeping the
 * data small here is the only size control that matters. Downscales
 * to at most maxDimension on the longer side, then tries decreasing
 * JPEG quality until under maxBytes (never raises quality back up —
 * a slightly blurrier small photo beats failing the upload).
 */
export async function resizeImageToDataUrl(
  file: File,
  maxDimension = 200,
  maxBytes = 100_000
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported in this browser");
  ctx.drawImage(bitmap, 0, 0, width, height);

  let quality = 0.85;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > maxBytes * 1.37 && quality > 0.3) {
    quality -= 0.15;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  return dataUrl;
}
