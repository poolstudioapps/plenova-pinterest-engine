/**
 * Shrinks an image in the browser before it is uploaded.
 *
 * A phone screenshot or a design export is several megabytes; a dozen in a
 * row runs past the request limit long before it reaches the server. Nothing
 * in this product needs more than 1600px on the long edge - a TikTok slide is
 * 1080 wide.
 *
 * Returns the dimensions too, so the server can file the real aspect ratio
 * rather than assume one.
 */

const MAX_EDGE = 1600;

export interface ShrunkImage {
  dataUrl: string;
  width: number;
  height: number;
}

export async function shrinkImage(file: File): Promise<ShrunkImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Le canvas est indisponible dans ce navigateur.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // PNG keeps transparency, which a designed CTA image may rely on; everything
  // else goes to JPEG, which is a fraction of the size for a photograph.
  const png = file.type === "image/png";
  return {
    dataUrl: canvas.toDataURL(png ? "image/png" : "image/jpeg", 0.9),
    width,
    height,
  };
}
