import sharp from "sharp";
import { FAVICON_SIZES, FAVICON_UPLOAD_LIMIT } from "@/lib/favicon-config";
import { FAVICON_PACK_LIMIT, packFavicon } from "@/lib/favicon-pack";
import { MediaUploadError, validateMediaPreflight } from "@/lib/media-upload";

const maximumSide = 2048;

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
    // Enclose all visible pixels in the circle. A rectangular JPEG keeps its
    // corners, while an existing circular PNG keeps its larger visual footprint.
    let radius = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 0) {
          radius = Math.max(radius, (x + 0.5 - width / 2) ** 2 + (y + 0.5 - height / 2) ** 2);
        }
      }
    }
    if (radius === 0) throw new MediaUploadError("invalidFile");
    const scale = Math.min(256 / Math.max(width, height), 126 / Math.sqrt(radius));
    const resized = await sharp(data, { raw: info }).resize({
      width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), fit: "inside",
    }).png().toBuffer();
    const corners = [0, width - 1, (height - 1) * width, width * height - 1].map(i => i * 4);
    const color = (channel: number) => Math.round(corners.reduce((sum, offset) => sum + data[offset + channel], 0) / 4);
    const background = { r: color(0), g: color(1), b: color(2), alpha: color(3) === 255 ? 1 : 0 };
    const square = await sharp(resized).resize(256, 256, { fit: "contain", withoutEnlargement: true, background }).png().toBuffer();
    const mask = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><circle cx="128" cy="128" r="127" fill="white"/></svg>');
    const circle = await sharp(square).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
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
