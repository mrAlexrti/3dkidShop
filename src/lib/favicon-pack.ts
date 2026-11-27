import { FAVICON_SIZES, type FaviconSize } from "@/lib/favicon-config";

export const FAVICON_PACK_LIMIT = 128 * 1024;
const directorySize = 6 + FAVICON_SIZES.length * 16;
const pngSignature = Buffer.from("89504e470d0a1a0a", "hex");

export function packFavicon(frames: readonly Buffer[]) {
  const header = Buffer.alloc(directorySize);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(FAVICON_SIZES.length, 4);
  let offset = header.length;
  for (const [index, size] of FAVICON_SIZES.entries()) {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(frames[index].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += frames[index].length;
  }
  return Buffer.concat([header, ...frames]);
}

export function faviconFrames(bytes: Buffer) {
  if (bytes.length < directorySize || bytes.length > FAVICON_PACK_LIMIT ||
      bytes.readUInt32LE(0) !== 0x00010000 || bytes.readUInt16LE(4) !== FAVICON_SIZES.length) {
    throw new Error("Invalid favicon directory");
  }
  const frames = new Map<FaviconSize, Buffer>();
  let offset = directorySize;
  for (const [index, size] of FAVICON_SIZES.entries()) {
    const entry = 6 + index * 16;
    const length = bytes.readUInt32LE(entry + 8);
    if (bytes[entry] !== size || bytes[entry + 1] !== size || bytes.readUInt32LE(entry + 12) !== offset ||
        length < 33 || offset + length > bytes.length) throw new Error("Invalid favicon entry");
    const frame = bytes.subarray(offset, offset + length);
    if (!frame.subarray(0, 8).equals(pngSignature) ||
        frame.toString("ascii", 12, 16) !== "IHDR" || frame.readUInt32BE(16) !== size || frame.readUInt32BE(20) !== size) {
      throw new Error("Invalid favicon PNG");
    }
    frames.set(size, frame);
    offset += length;
  }
  if (offset !== bytes.length) throw new Error("Invalid favicon length");
  return frames;
}
