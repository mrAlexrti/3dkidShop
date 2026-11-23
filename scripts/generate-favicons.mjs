// Deterministic derivatives of the unchanged official header/footer logo.
// Uses Sharp already installed with Next.js; no tracing, cropping or recoloring.
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const source = "public/hero/logo.png";
const square = (size) => sharp(source).resize(size, size, {
  fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 },
});
const png = { compressionLevel: 9, adaptiveFiltering: true };
const sizes = [16, 32, 48];
const frames = await Promise.all(sizes.map((size) => square(size).png(png).toBuffer()));
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
});
writeFileSync("src/app/favicon.ico", Buffer.concat([header, ...frames]));
writeFileSync("src/app/icon.png", await square(96).png(png).toBuffer());
// Opaque Apple bookmark/home-screen icon uses the existing site's cream surface.
writeFileSync("src/app/apple-icon.png", await sharp(source).flatten({ background: "#fbf7f2" })
  .resize(180, 180, { fit: "contain", background: "#fbf7f2" }).removeAlpha().png(png).toBuffer());
console.log("Generated official-logo ICO (16/32/48), PNG (96) and Apple PNG (180). Original logo unchanged.");
