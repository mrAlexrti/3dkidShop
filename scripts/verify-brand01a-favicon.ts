import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { FAVICON_SIZES, FAVICON_UPLOAD_LIMIT, faviconRevision } from "../src/lib/favicon-config";
import { renderFavicon } from "../src/lib/favicon-image";
import { faviconFrames } from "../src/lib/favicon-pack";
import { MediaUploadError } from "../src/lib/media-upload";

async function main() {
  const master = readFileSync("assets/brand/Logo_Actual.jpg");
  const rgba = await sharp(master).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const webp = await sharp(master).webp({ lossless: true }).toBuffer();
  const png = await sharp(master).png().toBuffer();
  const rendered: Buffer[] = [];
  for (const [source, type] of [[master, "image/jpeg"], [png, "image/png"], [webp, "image/webp"]] as const) {
    const pack = await renderFavicon(source, type);
    const frames = faviconFrames(pack);
    rendered.push(pack);
    assert.deepEqual([...frames.keys()], [...FAVICON_SIZES]);
    for (const [size, frame] of frames) {
      const { data, info } = await sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.deepEqual([info.width, info.height], [size, size]);
      assert.equal(data[3], 0);
      assert.equal(data[(size * Math.floor(size / 2) + Math.floor(size / 2)) * 4 + 3], 255);
    }
  }
  assert.deepEqual(rendered[0], rendered[1]);
  assert.deepEqual(rendered[0], rendered[2]);

  // Keep markers at all four corners on a rectangular source. The exterior
  // remains transparent and the source aspect ratio survives normalization.
  const rect = Buffer.alloc(360 * 200 * 4, 255);
  const markers = [[12, 12], [348, 12], [12, 188], [348, 188]] as const;
  for (const [cx, cy] of markers) for (let y = cy - 10; y < cy + 10; y++) for (let x = cx - 10; x < cx + 10; x++) {
    const i = (y * 360 + x) * 4;
    rect[i] = 220; rect[i + 1] = 20; rect[i + 2] = 50;
  }
  const source = await sharp(rect, { raw: { width: 360, height: 200, channels: 4 } }).png().toBuffer();
  const ninetySix = faviconFrames(await renderFavicon(source, "image/png")).get(96)!;
  const data = await sharp(ninetySix).ensureAlpha().raw().toBuffer();
  const redPixels: [number, number][] = [];
  for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
    const i = (y * 96 + x) * 4;
    if (data[i + 3] > 230 && data[i] > 180 && data[i + 1] < 70) redPixels.push([x, y]);
  }
  for (const [cx, cy] of markers) assert.ok(redPixels.filter(([x, y]) => (x < 48) === (cx < 180) && (y < 48) === (cy < 100)).length >= 10);
  const range = (axis: 0 | 1) => Math.max(...redPixels.map(point => point[axis])) - Math.min(...redPixels.map(point => point[axis]));
  assert.ok(Math.abs(range(0) / range(1) - 1.8) < 0.14);

  const small = await sharp(png).resize(30).png().toBuffer();
  const wide = await sharp(png).resize(2090, 64, { fit: "fill" }).png().toBuffer();
  const invalid = (code: string) => (error: unknown) => error instanceof MediaUploadError && error.code === code;
  await assert.rejects(renderFavicon(master.subarray(0, 128), "image/jpeg"), invalid("invalidFile"));
  await assert.rejects(renderFavicon(small, "image/png"), invalid("invalidFile"));
  await assert.rejects(renderFavicon(wide, "image/png"), invalid("invalidFile"));
  await assert.rejects(renderFavicon(master, "image/png"), invalid("invalidFile"));
  await assert.rejects(renderFavicon(master, "image/gif"), invalid("unsupported"));
  await assert.rejects(renderFavicon(Buffer.alloc(FAVICON_UPLOAD_LIMIT + 1), "image/png"), invalid("tooLarge"));
  const blank = await sharp({ create: { width: 100, height: 100, channels: 4, background: "#00000000" } }).png().toBuffer();
  await assert.rejects(renderFavicon(blank, "image/png"), invalid("invalidFile"));
  assert.throws(() => faviconFrames(rendered[0].subarray(0, 80)));
  assert.equal(rgba.info.width, 409);
  assert.equal(rgba.info.height, 369);
  const revision = "a".repeat(32);
  const path = "/3dkid/favicon/" + revision + ".ico";
  assert.equal(faviconRevision("https://test.public.blob.vercel-storage.com" + path), revision);
  assert.equal(faviconRevision("https://wrong.invalid" + path), null);
  assert.equal(faviconRevision("https://test.public.blob.vercel-storage.com" + path + "?x=1"), null);
  console.log("PASS BRAND-01A JPEG/PNG/WebP decode, approved 409 × 369 source, square/transparent frames, retained corner markers, aspect ratio and invalid input");
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
