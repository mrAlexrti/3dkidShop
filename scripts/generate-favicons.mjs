// Generate public derivatives from the unmodified, operator-approved master.
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const source = "assets/brand/Logo_Actual.jpg";
const { width, height } = await sharp(source).metadata();

// Keep the complete rectangular artwork for storefront and email. Extend the
// pink field before masking the circle so the outer sparkles fit at their original positions.
await sharp(source).png({ palette: true, colours: 256, dither: 0.4 }).toFile("public/hero/logo.png");
const side = Math.max(width, height);
const left = Math.floor((side - width) / 2);
const top = Math.floor((side - height) / 2);
const radius = side / 2 - 1;
const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}"><circle cx="${side / 2}" cy="${side / 2}" r="${radius}" fill="white"/></svg>`);
const square = await sharp(source).extend({
  left, right: side - width - left, top, bottom: side - height - top, extendWith: "copy",
}).ensureAlpha()
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
console.log("Generated the storefront logo, favicon set, structured-data mark and fallback social card.");
