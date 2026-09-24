import "server-only";

/**
 * Scrubs the metadata off an image before it is stored or published.
 *
 * Three reasons, in order of how much they matter here:
 *
 *  1. Provenance. A photograph pulled from a stock library or produced by a
 *     model arrives carrying its own EXIF and XMP - camera, software, dates,
 *     sometimes GPS, sometimes the originating account. Republishing that
 *     verbatim hands it straight to the platform.
 *
 *  2. Consistency. A slide composed in the browser goes through a canvas, so
 *     it comes out with no metadata at all. The bare photograph beside it kept
 *     everything. The same carousel was shipping two different kinds of file.
 *
 *  3. Size. EXIF thumbnails and XMP packets are routinely tens of kilobytes on
 *     an image that has a hard 20 MB ceiling at TikTok.
 *
 * It is deliberately pure segment surgery - no re-encode. Re-encoding would
 * cost a generation of JPEG quality on every save, and the pixels are the one
 * thing here that must not change.
 *
 * ICC colour profiles are KEPT. They are metadata by the letter, but dropping
 * one shifts the colours of the image, which is a visible edit rather than a
 * cleanup.
 */

export interface ScrubResult {
  data: Buffer;
  /** Bytes removed. Zero means the image carried nothing to begin with. */
  removed: number;
}

/** Dispatches on the container's magic bytes, not on the declared type. */
export function scrubImageMetadata(data: Buffer): ScrubResult {
  try {
    if (isJpeg(data)) return finish(data, scrubJpeg(data));
    if (isPng(data)) return finish(data, scrubPng(data));
    if (isWebp(data)) return finish(data, scrubWebp(data));
  } catch {
    // A malformed file is not worth failing a publish over: the worst case is
    // that it keeps the metadata it arrived with.
  }
  return { data, removed: 0 };
}

function finish(original: Buffer, out: Buffer): ScrubResult {
  // Never hand back something larger, or empty, than what came in.
  if (out.length === 0 || out.length > original.length) {
    return { data: original, removed: 0 };
  }
  return { data: out, removed: original.length - out.length };
}

const isJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8;
const isPng = (b: Buffer) =>
  b.length > 8 && b.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
const isWebp = (b: Buffer) =>
  b.length > 12 &&
  b.subarray(0, 4).toString("latin1") === "RIFF" &&
  b.subarray(8, 12).toString("latin1") === "WEBP";

/*
 * JPEG: walk the marker segments and drop the ones that carry text.
 *
 * APP1  EXIF and XMP - the big one, and the one with GPS in it
 * APP2  ICC when it starts "ICC_PROFILE", which is why APP2 is inspected
 *       rather than dropped: colour stays, anything else in APP2 goes
 * APP13 Photoshop IRB, which is where IPTC credit and caption live
 * COM   a free-text comment
 *
 * APP0 (JFIF) is kept: it is the density header, five bytes of nothing
 * sensitive, and some decoders are happier with it present.
 */
const JPEG_DROP = new Set([0xe1, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9,
  0xea, 0xeb, 0xec, 0xed, 0xee, 0xef, 0xfe]);

function scrubJpeg(data: Buffer): Buffer {
  const keep: Buffer[] = [data.subarray(0, 2)]; // SOI
  let i = 2;

  while (i + 3 < data.length) {
    if (data[i] !== 0xff) break;
    const marker = data[i + 1]!;

    // Start of scan: the entropy-coded image data runs to the end, untouched.
    if (marker === 0xda) {
      keep.push(data.subarray(i));
      return Buffer.concat(keep);
    }
    // Standalone markers carry no length field.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      keep.push(data.subarray(i, i + 2));
      i += 2;
      continue;
    }

    const length = data.readUInt16BE(i + 2);
    if (length < 2 || i + 2 + length > data.length) break;
    const end = i + 2 + length;

    const isIcc =
      marker === 0xe2 &&
      data.subarray(i + 4, i + 15).toString("latin1") === "ICC_PROFILE";

    if (!JPEG_DROP.has(marker) && !(marker === 0xe2 && !isIcc)) {
      keep.push(data.subarray(i, end));
    }
    i = end;
  }

  keep.push(data.subarray(i));
  return Buffer.concat(keep);
}

/*
 * PNG: keep only the chunks that describe pixels.
 *
 * Everything textual (tEXt/zTXt/iTXt), the EXIF chunk, and the timestamp go.
 * iCCP stays for the same reason APP2/ICC does in JPEG.
 */
const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME", "dSIG"]);

function scrubPng(data: Buffer): Buffer {
  const keep: Buffer[] = [data.subarray(0, 8)];
  let i = 8;

  while (i + 8 <= data.length) {
    const length = data.readUInt32BE(i);
    const type = data.subarray(i + 4, i + 8).toString("latin1");
    const end = i + 12 + length; // length + type + data + crc
    if (end > data.length) break;

    if (!PNG_DROP.has(type)) keep.push(data.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }

  return Buffer.concat(keep);
}

/*
 * WebP: a RIFF container. Drop the EXIF and XMP chunks and rewrite the file
 * size in the header, which is what makes the result a valid RIFF again.
 */
const WEBP_DROP = new Set(["EXIF", "XMP "]);

function scrubWebp(data: Buffer): Buffer {
  const keep: Buffer[] = [];
  let i = 12;

  while (i + 8 <= data.length) {
    const type = data.subarray(i, i + 4).toString("latin1");
    const size = data.readUInt32LE(i + 4);
    // Chunks are padded to an even length.
    const end = i + 8 + size + (size % 2);
    if (end > data.length) break;

    if (!WEBP_DROP.has(type)) keep.push(data.subarray(i, Math.min(end, data.length)));
    i = end;
  }

  const body = Buffer.concat(keep);
  const header = Buffer.from(data.subarray(0, 12));
  header.writeUInt32LE(body.length + 4, 4); // "WEBP" + payload
  return Buffer.concat([header, body]);
}
