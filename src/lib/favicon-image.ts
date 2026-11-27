import sharp, { type OutputInfo } from "sharp";
import { FAVICON_SIZES, FAVICON_UPLOAD_LIMIT } from "@/lib/favicon-config";
import { FAVICON_PACK_LIMIT, packFavicon } from "@/lib/favicon-pack";
import { MediaUploadError, validateMediaPreflight } from "@/lib/media-upload";

const maximumSide = 2048;

function circleMask(side: number) {
  const center = side / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}"><circle cx="${center}" cy="${center}" r="${center - 1}" fill="white"/></svg>`);
}

function canMaskBackground(data: Buffer, width: number, height: number, side: number, left: number, top: number) {
  // Allow minor JPEG noise in the flat field. Keep a one-pixel safety margin
  // inside the mask to protect details near the antialiased edge as well.
  const tolerance = 8;
  const limit = (side / 2 - 2) ** 2;
  const matchesColor = (a: number, b: number) => [0, 1, 2].every(channel => Math.abs(data[a + channel] - data[b + channel]) <= tolerance);
  for (const corner of [width - 1, (height - 1) * width, width * height - 1]) {
    if (!matchesColor(corner * 4, 0)) return false;
  }
  for (let y = 0; y < height; y++) {
    const row = (y + 0.5 + top - side / 2) ** 2;
    const cornerRow = y < height / 2 ? 0 : (height - 1) * width;
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (data[offset + 3] !== 255) return false;
      if (row + (x + 0.5 + left - side / 2) ** 2 >= limit) {
        const corner = cornerRow + (x < width / 2 ? 0 : width - 1);
        if (!matchesColor(offset, corner * 4)) return false;
      }
    }
  }
  return true;
}

async function fittedSquare(data: Buffer, info: OutputInfo) {
  const { width, height } = info;
  const side = Math.max(width, height);
  const left = Math.floor((side - width) / 2);
  const top = Math.floor((side - height) / 2);
  if (canMaskBackground(data, width, height, side, left, top)) {
    const square = sharp(data, { raw: info });
    if (width !== height) square.extend({ left, right: side - width - left, top, bottom: side - height - top, extendWith: "copy" });
    // Match the packaged PNG density for stable bytes across input encodings.
    return { square: await square.withDensity(72).png().toBuffer(), side };
  }

  // Fit all visible pixels when the mask would trim any artwork.
  let radius = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        radius = Math.max(radius, (x + 0.5 - width / 2) ** 2 + (y + 0.5 - height / 2) ** 2);
      }
    }
  }
  if (radius === 0) throw new MediaUploadError("invalidFile");
  const scale = Math.min(256 / side, 126 / Math.sqrt(radius));
  const resized = await sharp(data, { raw: info }).resize({
    width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), fit: "inside",
  }).png().toBuffer();
  const corners = [0, width - 1, (height - 1) * width, width * height - 1].map(i => i * 4);
  const color = (channel: number) => Math.round(corners.reduce((sum, offset) => sum + data[offset + channel], 0) / 4);
  const background = { r: color(0), g: color(1), b: color(2), alpha: color(3) === 255 ? 1 : 0 };
  return { square: await sharp(resized).resize(256, 256, { fit: "contain", withoutEnlargement: true, background }).png().toBuffer(), side: 256 };
}

export async function renderFavicon(bytes: Buffer, contentType: string) {
  if (bytes.length > FAVICON_UPLOAD_LIMIT) throw new MediaUploadError("tooLarge");
  validateMediaPreflight({ kind: "image", size: bytes.length, contentType, headerHex: bytes.subarray(0, 32).toString("hex") });
  try {
    const image = sharp(bytes, { limitInputPixels: maximumSide ** 2, failOn: "warning" });
    const metadata = await image.metadata();
    const { width, height } = metadata.autoOrient;
    if (width < 64 || height < 64 || width > maximumSide || height > maximumSide ||
        (metadata.pages ?? 1) !== 1) throw new MediaUploadError("invalidFile");

    const { data, info } = await image.autoOrient().toColourspace("srgb").ensureAlpha().raw()
      .toBuffer({ resolveWithObject: true });
    const { square, side } = await fittedSquare(data, info);
    const circle = await sharp(square).ensureAlpha().composite([{ input: circleMask(side), blend: "dest-in" }]).png().toBuffer();
    const frames = await Promise.all(FAVICON_SIZES.map(size => sharp(circle).resize(size, size)
      .png({ palette: true, colours: size < 49 ? 128 : 256, dither: 0.6 }).toBuffer()));
    const pack = packFavicon(frames);
    if (pack.length > FAVICON_PACK_LIMIT) throw new MediaUploadError("invalidFile");
    return pack;
  } catch (error) {
    if (error instanceof MediaUploadError) throw error;
    throw new MediaUploadError("invalidFile");
  }
}
