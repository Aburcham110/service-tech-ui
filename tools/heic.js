// HEIC/HEIF -> PNG on the phone, with the self-hosted libheif decoder (vendor/libheif).
// The decoder (~1.4 MB) is precached by sw.js but only import()ed when the picked file is HEIC/HEIF.
// Same-origin only: no CDN, no network calls besides the module import itself.

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);
export const DECODER_URL = new URL("../vendor/libheif/libheif-bundle.mjs", import.meta.url).href;

/** True if the bytes start with an ISO-BMFF ftyp box whose major brand (or a compatible brand) is HEIF/HEIC. */
export function isHeicBytes(bytes) {
  if (!bytes || bytes.length < 12) return false;
  const s = (i) => String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
  if (s(4) !== "ftyp") return false;
  if (HEIF_BRANDS.has(s(8))) return true;
  const size = Math.min((bytes[0] << 24 | bytes[1] << 16 | bytes[2] << 8 | bytes[3]) >>> 0, bytes.length);
  for (let i = 16; i + 4 <= size; i += 4) if (HEIF_BRANDS.has(s(i))) return true; // compatible brands
  return false;
}

/** HEIC/HEIF by MIME type, extension, or magic bytes (Android often reports an empty type). */
export async function isHeic(file) {
  if (!file) return false;
  if (/^image\/hei[cf](-sequence)?$/i.test(file.type || "")) return true;
  if (/\.(heic|heif|hif)$/i.test(file.name || "")) return true;
  if (/^image\/(jpeg|png|gif|webp|bmp)$/i.test(file.type || "")) return false;
  try { return isHeicBytes(new Uint8Array(await file.slice(0, 64).arrayBuffer())); } catch (e) { return false; }
}

let libPromise = null;
export function loadDecoder() {
  if (!libPromise) {
    libPromise = import(DECODER_URL).then((m) => m.default()).catch((e) => { libPromise = null; throw e; });
  }
  return libPromise;
}

/** Decode the primary image (rotation/mirror from irot/imir applied) and return an upright PNG File. Throws on failure. */
export async function heicToFile(file) {
  const lib = await loadDecoder();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const decoder = new lib.HeifDecoder();
  let images = [];
  try {
    images = decoder.decode(bytes) || [];
    if (!images.length) throw new Error("no image in HEIF file");
    const img = images[0];
    const w = img.get_width(), h = img.get_height();
    if (!(w > 0 && h > 0)) throw new Error("bad HEIF dimensions");
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(w, h);
    await new Promise((resolve, reject) => img.display(imageData, (d) => (d ? resolve() : reject(new Error("HEIF decode failed")))));
    ctx.putImageData(imageData, 0, 0);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    canvas.width = canvas.height = 0;
    if (!blob) throw new Error("PNG encode failed");
    const name = (file.name || "photo").replace(/\.[^.]*$/, "") + ".png";
    return new File([blob], name, { type: "image/png" });
  } finally {
    for (const im of images) { try { im.free && im.free(); } catch (e) { /* ignore */ } }
    try { if (decoder.decoder) { lib.heif_context_free(decoder.decoder); decoder.decoder = null; } } catch (e) { /* ignore */ }
  }
}
