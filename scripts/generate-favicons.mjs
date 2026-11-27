// Generate only the packaged default favicon with the same renderer as uploads.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { require as loadTypeScript } from "tsx/cjs/api";

const { renderFavicon } = loadTypeScript("../src/lib/favicon-image.ts", import.meta.url);
const { faviconFrames } = loadTypeScript("../src/lib/favicon-pack.ts", import.meta.url);
const source = new URL("../assets/brand/Logo_Actual.jpg", import.meta.url);
const output = new URL("../assets/brand/favicon/", import.meta.url);
const ico = await renderFavicon(readFileSync(source), "image/jpeg");
const frames = faviconFrames(ico);
mkdirSync(output, { recursive: true });
for (const [size, png] of frames) writeFileSync(new URL(`favicon-${size}.png`, output), png);
writeFileSync(new URL("favicon.ico", output), ico);
console.log("Generated the default PNG and ICO favicons.");
