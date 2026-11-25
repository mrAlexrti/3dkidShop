// Pass the operator-approved square pink mark explicitly. Marketing artwork stays separate.
import assert from "node:assert/strict";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const source = process.argv[2];
assert.ok(source, "Provide the operator-approved favicon PNG path.");
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
assert.ok(info.width === info.height && info.width >= 512, "Use a square source of at least 512 px.");

// Detect the pink disc's bounds and mask only the exterior, preserving cream lettering and sparkles.
let left = info.width, top = info.height, right = 0, bottom = 0;
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    const index = (y * info.width + x) * 4;
    if (data[index] - data[index + 1] <= 50 || data[index + 2] - data[index + 1] <= 24) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
}
const width = right - left + 1, height = bottom - top + 1;
assert.ok(Math.min(width, height) > info.width / 2, "The pink disc was not found.");
const side = Math.max(width, height) + 12;
const x = Math.floor((left + right + 1 - side) / 2), y = Math.floor((top + bottom + 1 - side) / 2);
assert.ok(x >= 0 && y >= 0 && x + side <= info.width && y + side <= info.height, "The approved mark needs a small outer margin.");
const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}"><ellipse cx="${(left + right + 1) / 2 - x}" cy="${(top + bottom + 1) / 2 - y}" rx="${width / 2 - 1}" ry="${height / 2 - 1}" fill="white"/></svg>`);
const square = await sharp(source).extract({ left: x, top: y, width: side, height: side }).ensureAlpha()
  .composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
const png = (size) => sharp(square).resize(size, size).png({ palette: true, colours: size < 49 ? 128 : 256, dither: 0.6 }).toBuffer();
const sizes = [16, 32, 48, 96];
const frames = await Promise.all(sizes.map(png));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2); // ICO, not CUR.
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index]; header[entry + 1] = sizes[index];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
  writeFileSync(`public/favicon-${sizes[index]}.png`, frame);
});
writeFileSync("public/favicon.ico", Buffer.concat([header, ...frames]));
writeFileSync("public/apple-touch-icon.png", await png(180));
mkdirSync("public/seo", { recursive: true });
writeFileSync("public/seo/brand-mark.png", await png(256));
const mark = await sharp(square).resize(405).png().toBuffer();
const card = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#fff5ea"/><rect x="41" y="41" width="1118" height="548" rx="44" fill="#fff9f3" stroke="#f7b9d2" stroke-width="3"/><g fill="#462638" font-family="Arial, sans-serif" font-weight="bold"><text x="561" y="296" font-size="95">3D kid</text></g><g fill="#a62762" font-family="Arial, sans-serif" font-weight="bold" font-size="38"><text x="565" y="381">3D-printed toys</text><text x="565" y="433">&amp; accessories</text></g><path d="M1080 115q8 32 40 40-32 8-40 40-8-32-40-40 32-8 40-40Z" fill="#ffda5b"/></svg>');
await sharp(card).composite([{ input: mark, top: 112, left: 100 }]).jpeg({ quality: 83, mozjpeg: true }).toFile("public/seo/store-share.jpg");
console.log("Generated the approved favicon set, structured-data mark and fallback social card.");
