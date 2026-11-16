import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { optionalHoverGifUrl, updateMainProductImage } from "../src/lib/product-media";

export async function verifyIsolatedMedia() {
  for (const empty of [undefined, "", "   "]) assert.equal(optionalHoverGifUrl.parse(empty), null);
  assert.equal(optionalHoverGifUrl.parse(" https://example.com/turn.gif "), "https://example.com/turn.gif");
  for (const invalid of ["bad", "data:image/gif;base64,R0lGODlh", "javascript:alert(1)", "ftp://example.com/a.gif", "https://user:password@example.com/a.gif"]) assert.equal(optionalHoverGifUrl.safeParse(invalid).success, false);
  const images = [{ id: "main", url: "https://example.com/main.webp", order: 0 }, { id: "gallery", url: "https://example.com/gallery.webp", order: 1 }];
  let writes = 0;
  const tx = { productImage: {
    findFirst: async () => images[0] ?? null,
    create: async ({ data }: { data: { url: string; order: number } }) => { images.push({ id: "created", ...data }); writes++; },
    update: async ({ where, data }: { where: { id: string }; data: { url: string } }) => { images.find((image) => image.id === where.id)!.url = data.url; writes++; },
  } } as unknown as Prisma.TransactionClient;
  const gallery = { ...images[1] };
  await updateMainProductImage(tx, "qa", images[0].url); assert.equal(writes, 0);
  await updateMainProductImage(tx, "qa", "https://example.com/changed.webp");
  await updateMainProductImage(tx, "qa", "https://example.com/changed-again.webp");
  assert.equal(images[0].id, "main"); assert.equal(images.length, 2); assert.deepEqual(images[1], gallery);
  images.length = 0; await updateMainProductImage(tx, "qa", "https://example.com/new.webp");
  assert.equal(images.length, 1); assert.equal(images[0].order, 0);
  console.log("PASS isolated product media: URL validation, nullable GIF, stable main image ID, gallery preserved, no duplicate images, missing main image created. No DB/env/network access.");
}
